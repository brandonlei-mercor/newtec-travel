# NEWTEC TRAVEL AND TOURS — US ↔ Vietnam

The agency's website: live round-trip fares from San Francisco, Los Angeles, Phoenix, and New York to Ho Chi Minh City, Hanoi, and Da Nang, and one form that asks a specialist to call back.

**The site shows prices and collects requests. It never sells anything.** Ticketing happens by hand in the agency's Sabre Red 360 terminal, so there is no cart, no payment, no customer account, and no booking record here.

## Company

**NEWTEC TRAVEL AND TOURS**  
[836 Schwerin Street, Daly City, CA 94014](https://www.google.com/maps/search/?api=1&query=836%20Schwerin%20Street%2C%20Daly%20City%2C%20CA%2094014)  
Telephone: [(415) 626 3579](tel:+14156263579)  
Email: [newtec@sbcglobal.net](mailto:newtec@sbcglobal.net)  
Reviews: [Yelp](https://www.yelp.com/biz/newtec-travel-agency-daly-city)

## What the site does

1. A visitor searches SFO, LAX, PHX, or JFK to SGN, HAN, or DAD and sees real Duffel fares.
2. Every result list ends by pointing at the phone, because group fares and business-class contracts are quoted by hand and are never in the search results.
3. Selecting a flight, or starting from scratch, opens a four-step request form.
4. Submitting writes one row and queues one email to `newtec@sbcglobal.net` with the customer's phone, email, trip, and preferred callback channel. Reply-To is the customer, so replying answers them directly.
5. Staff opens `/admin`, calls the customer back, and drags the request from New to Processing to Done.

Both the phone number and the email address are always required, even though the customer picks one as preferred: the agency calls back by hand, and a filtered mailbox or one wrong digit must not be the only route to a lead.

## Pages

| Route                                                             | Purpose                                |
| ----------------------------------------------------------------- | -------------------------------------- |
| `/en`, `/vi`                                                      | Landing page                           |
| `/{locale}/flights`                                               | Live Duffel flight search              |
| `/{locale}/request`                                               | Four-step request form                 |
| `/{locale}/request/received`                                      | Confirmation with the `TV-…` reference |
| `/{locale}/privacy`, `/terms`, `/accessibility`, `/photo-credits` | Legal pages                            |
| `/admin`                                                          | The request board, behind one password |

## Stack

- Next.js 16, React 19, strict TypeScript, Tailwind CSS, `next-intl`
- PostgreSQL 16 and Drizzle ORM with committed SQL migrations
- Graphile Worker for the notification outbox and the fare-calendar backfill
- Mailpit locally for email inspection
- Vitest and Playwright

## Quick start

Requirements: Node `22.22.x`, pnpm `10.33.x`, Docker with Compose, and a Duffel access token.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap
# paste a Duffel token into the DUFFEL_ACCESS_TOKEN line of .env.local
pnpm dev
```

Open [http://localhost:3000/en](http://localhost:3000/en). Local services use PostgreSQL on `127.0.0.1:55432` and Mailpit on `127.0.0.1:1025` (UI at `127.0.0.1:8025`).

`pnpm bootstrap` writes an ignored `.env.local`, waits for infrastructure, and migrates the database. There is no seed: every price on the site is live Duffel data, and no fake request should ever be mistaken for a real customer. The equivalent `pnpm run setup` is retained; bare `pnpm setup` is a reserved pnpm command and must not be used.

**The app refuses to boot without `DUFFEL_ACCESS_TOKEN`** outside tests. That is deliberate: a site that silently falls back to invented prices is worse than a site that is down.

## Duffel

1. Create an account at [duffel.com](https://duffel.com) and generate an access token with **read-write** access. Read-only tokens fail every search with HTTP 403 `insufficient_permissions`: a search creates an offer request, which Duffel counts as a write.
2. Put it in `.env.local`, which is gitignored. Never commit a token or paste one into a chat, an issue, or a PR.

   ```bash
   DUFFEL_ACCESS_TOKEN=duffel_live_...
   ```

Set the Duffel organisation's billing currency to USD. Duffel prices offers in that currency, and the app drops any offer that is not USD rather than inventing an exchange rate, so a mismatch shows an empty result set instead of a wrong price.

Duffel has no calendar endpoint, so a priced month grid would cost one billable search per cell and Duffel allows only 10 a minute. The date picker therefore shows no prices: a customer picks their dates and one search prices that trip. Results are cached under their search parameters for the TTL in `src/modules/search/service.ts`. Read the amendment in [ADR 0002](docs/decisions/0002-live-flight-shopping-preview.md) before adding anything that prices dates the customer did not ask for.

The app never books through Duffel, and no passenger name, document, or payment instrument is ever sent upstream.

## The request board

`/admin` is a three-column board — New, Processing, Done — and the column a card sits in is the request's status. Cards move by dragging, or by the select on each card for a phone or a keyboard; either way the move is sent to the server and survives a reload.

Access is one password, `ADMIN_PASSWORD`. There is no username. `/admin/login` exchanges it for an HttpOnly, SameSite=Strict cookie holding an HMAC-signed eight-hour session; the signing key is derived from the password, so changing `ADMIN_PASSWORD` signs everyone out. The cookie is checked in `src/proxy.ts` and again inside the page and the status route. The second check is not redundant: a matcher regression would otherwise publish customer contact details with nothing else in the way. Production refuses to boot on the local default password, or on anything shorter than 16 characters.

The board is the durable record. Email is off until `INQUIRY_EMAIL_ENABLED=true` and a real relay is configured; with it on, each card also shows whether its email was sent, queued, or failed, so a mail outage degrades to "someone has to open /admin" rather than a lost customer.

## Common commands

```bash
pnpm infra:up             # PostgreSQL and Mailpit
pnpm infra:down
pnpm db:migrate
pnpm db:reset
pnpm worker:once
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:a11y
pnpm test:security
pnpm verify               # format, lint, types, tests, production build
```

## Product boundaries

- Origins are SFO, LAX, PHX, and JFK, with SFO the default; destinations are SGN, HAN, DAD, or flexible among them.
- Only Vietnam Airlines, EVA Air, and STARLUX are shown, and their coverage is uneven: all three fly SFO and LAX, only STARLUX flies PHX, and only EVA flies JFK. A thin result list out of Phoenix or New York is the filter working.
- Prices come from Duffel and nowhere else. No scraping, no cached public fares, no Sabre automation, no invented numbers. See [ADR 0002](docs/decisions/0002-live-flight-shopping-preview.md).
- A displayed fare is what an airline published a moment ago, not a held seat. The agency confirms the exact fare in Sabre before anyone pays.
- The only personal data stored is what a callback needs: name, email, phone, preferred channel, language, and the trip. No passport, payment, or document data is collected anywhere.
- Legal and transactional Vietnamese copy requires human review before production use.

See [the product specification](docs/product-spec.md), [architecture](docs/architecture.md), and the decision records: [flight content and booking model](docs/decisions/0001-flight-content-and-booking-model.md), [live flight shopping](docs/decisions/0002-live-flight-shopping-preview.md), [reduction to an intake site](docs/decisions/0003-intake-only-site.md).
