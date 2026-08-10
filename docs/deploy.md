# Deploying to Render

The site runs on Render as two services against one Postgres database:

| Resource          | Type              | What it does                           | Needed at launch   |
| ----------------- | ----------------- | -------------------------------------- | ------------------ |
| `newtec-web`      | Web service       | The site, `/admin`, and the API routes | Yes                |
| `newtec-postgres` | Postgres 18       | Inquiries and the notification outbox  | Yes                |
| `newtec-worker`   | Background worker | Drains the outbox and sends the email  | Only with email on |

The worker is optional because `INQUIRY_EMAIL_ENABLED` defaults to off. With it off, a
request still writes its inquiry row and its outbox row, and the agency reads new
requests at `/admin`. Turning email on later delivers nothing that was missed, because
the outbox rows were written all along.

Migrations run as the web service's pre-deploy command, which Render runs once per deploy,
in this same image with these same variables, before any traffic reaches the new instance.
A failed migration therefore fails the deploy and leaves the previous version serving. Put
migrations in the start command instead and a bad migration produces a container that is
already live and crash-looping. Pre-deploy commands need a paid instance type, which is one
more reason the free tier does not fit here.

## The image

Render builds from the repo's `Dockerfile` rather than its own Node buildpack, because
`package.json` pins pnpm 10.33.0 and an install with a different pnpm fails on the
lockfile. Development dependencies stay in the image: `tsx` runs both the worker and the
migration script.

## Environment variables

Set values, never names, through the Render dashboard for the three marked secret. The
rest are safe on a command line.

| Variable                     | Web | Worker | Value                                                  |
| ---------------------------- | :-: | :----: | ------------------------------------------------------ |
| `APP_ENV`                    |  ✓  |   ✓    | `production`                                           |
| `APP_URL`                    |  ✓  |   ✓    | The service's own `https://` URL                       |
| `DATABASE_URL`               |  ✓  |   ✓    | The database's **internal** connection string (secret) |
| `DUFFEL_ACCESS_TOKEN`        |  ✓  |        | A live token; `duffel_test_…` is refused (secret)      |
| `ADMIN_PASSWORD`             |  ✓  |   ✓    | 16+ random characters (secret)                         |
| `INQUIRY_NOTIFICATION_EMAIL` |     |   ✓    | `newtectravelagency@gmail.com`                         |
| `INQUIRY_EMAIL_ENABLED`      |     |   ✓    | `true` once a relay is configured                      |
| `SMTP_HOST` / `SMTP_PORT`    |     |   ✓    | `smtp.resend.com` / `465`                              |
| `SMTP_SECURE`                |     |   ✓    | `true` on port 465                                     |
| `SMTP_USER`                  |     |   ✓    | `resend`, literally                                    |
| `SMTP_PASSWORD`              |     |   ✓    | A Resend API key, `re_…` (secret)                      |
| `SMTP_FROM`                  |     |   ✓    | `NEWTEC TRAVEL AND TOURS <hanh@newtectravel.com>`      |

`APP_URL` is load-bearing twice over: it is one of the two origins the mutation guard
accepts, and the `/admin` session cookie is marked `Secure` only when it begins `https://`.
An `http://` value in production issues a session cookie that any network can read.

`ADMIN_PASSWORD` is also the HMAC material the session cookie is signed with, so changing
it signs every open session out. That is the revocation mechanism; there is no session
table.

## First deploy

`render login` opens a browser and has no token flag, so it is the one step that cannot be
scripted.

```bash
render login
render workspace set

render postgres create --name newtec-postgres --version 18 --region oregon \
  --plan basic_256mb --confirm --output json

render services create \
  --name newtec-web \
  --type web_service \
  --runtime docker \
  --repo https://github.com/brandonlei-mercor/newtec-travel \
  --branch main \
  --region oregon \
  --plan starter \
  --num-instances 1 \
  --health-check-path /api/v1/health \
  --pre-deploy-command "pnpm db:migrate" \
  --start-command "pnpm start" \
  --env-var APP_ENV=production \
  --output json
```

`--num-instances` defaults to 0, so passing 1 is not optional.

Then, in the dashboard, add `DATABASE_URL` (copy the internal connection string from the
database's Connect panel so it never reaches a shell history), `DUFFEL_ACCESS_TOKEN`,
`ADMIN_PASSWORD`, and `APP_URL` once Render has assigned the URL. Saving them redeploys.

The service will not boot until all four are set: `src/shared/env.ts` refuses to start under
`APP_ENV=production` without a live Duffel token and a 16-character admin password. A first
deploy that fails on a missing variable is the guard working, not a broken deploy.

```bash
render deploys create <service-id> --wait
render logs <service-id> --tail
```

## Verifying, in this order

1. `curl https://<url>/api/v1/health` returns `{"status":"ok"}`.
2. `/en` and `/vi` load, and a search returns live fares. Empty results mean the Duffel
   token, not the deploy.
3. Submit a request. It should land in `/admin` with the reference from the confirmation
   page. This is the whole product: if a request reaches `/admin`, the site works.
4. Sign in to `/admin` and confirm the browser shows the session cookie as `Secure`.

## Turning email on

A request sends one email: a welcome addressed to the customer, copying the agency
mailbox, so the reply thread the customer answers in is the thread the agency works out
of. Reply-To is the Gmail address regardless of who the relay sends as.

The relay is Resend, reached over SMTP so the app needs no Resend SDK. Before the first
send, verify `newtectravel.com` in the Resend dashboard and publish the DNS records it
gives you at GoDaddy, where the domain's nameservers live. `SMTP_FROM` is then a mailbox
at that domain: `newtectravelagency@gmail.com` cannot be the sender, because Resend sends
only as domains the account holds and Gmail's DMARC policy tells receivers to reject
anything else claiming to be gmail.com. `src/shared/env.ts` refuses to boot on a free-mail
sender rather than let the failure arrive one unanswered lead at a time. `SMTP_USER` is
the literal string `resend`; the password is the API key.

With the relay configured (see the SMTP variables above), create the worker from the same
repo and image:

```bash
render services create \
  --name newtec-worker \
  --type background_worker \
  --runtime docker \
  --repo https://github.com/brandonlei-mercor/newtec-travel \
  --branch main \
  --region oregon \
  --plan starter \
  --num-instances 1 \
  --start-command "pnpm worker" \
  --env-var APP_ENV=production \
  --env-var INQUIRY_EMAIL_ENABLED=true \
  --output json
```

A send that fails is recorded on the notification row with its SMTP error and retried
eight times with backoff, so `/admin` shows both that a request arrived and whether
anyone was told.

## Costs, and why not the free tier

Free Postgres is deleted 30 days after creation, and a free web service spins down after
15 minutes of inactivity, so the first visitor after a quiet spell waits about a minute
for a cold start. Leads are the product here, which rules out a database that expires.
Starter web plus Basic Postgres is roughly $13 a month, plus another $7 when the worker
starts running.

## Notes

- Local Postgres is 16 (`compose.yaml`) and Render's is 18. The migrations are plain SQL
  and portable, but it is a version gap worth knowing about when reproducing a bug.
- The repo's `crontab` file is inert: the worker calls graphile-worker's `run` without a
  `crontab` or `crontabFile` option, and graphile-worker only loads cron items when one of
  those is passed. Nothing in it is scheduled.
