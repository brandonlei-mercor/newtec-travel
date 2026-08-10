import { z } from "zod";
import { COMPANY, COMPANY_SMTP_FROM } from "./company";

/*
 * A password everyone can read is not a password. It exists so `pnpm dev` runs
 * without setup, and production checks below refuse to start while it is still
 * in place.
 */
const LOCAL_ADMIN_PASSWORD = "local-admin-password";

const ADMIN_PASSWORD_MINIMUM_LENGTH = 16;

const schema = z.object({
  APP_ENV: z.enum(["local", "test", "production"]).default("local"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://travel:travel@127.0.0.1:55432/travel_dev"),
  FLIGHT_SEARCH_PROVIDER: z.enum(["duffel"]).default("duffel"),
  DUFFEL_ACCESS_TOKEN: z.string().optional(),
  DUFFEL_API_URL: z.url().default("https://api.duffel.com"),
  /** Per-airline wait inside one Duffel offer request; Duffel accepts 2000-60000. */
  DUFFEL_SUPPLIER_TIMEOUT_MS: z.coerce.number().int().min(2000).max(60000).default(20000),
  /*
   * Defaults describe Mailpit, the local mail catcher: no credential, no TLS.
   * A real relay needs all four of host, port, secure, and a credential, so
   * production checks below refuse to start on a half-configured mailbox.
   */
  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  /** Implicit TLS from the first byte, which is what port 465 expects. */
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  /*
   * The envelope sender, which must be a mailbox the relay is allowed to send
   * as. Resend allows only domains verified in the account, and gmail.com will
   * never be one of them, so in production this is an address at the agency's
   * own domain. The Gmail address the customer should reach is carried as
   * Reply-To and Cc instead, which no relay polices.
   */
  SMTP_FROM: z.string().default(COMPANY_SMTP_FROM),
  /*
   * Copied on the welcome email that goes to the customer, so the agency holds
   * its side of the same thread. Defaults to the agency's own mailbox.
   */
  INQUIRY_NOTIFICATION_EMAIL: z.email().default(COMPANY.email.address),
  /*
   * Whether a new request also sends that welcome email. Off by default: until
   * a real relay is configured, /admin is where the agency reads its requests,
   * and a job queued against a mailbox that cannot accept it would only produce
   * failures to explain. The outbox row is written either way, so turning this
   * on later loses nothing that already happened.
   */
  INQUIRY_EMAIL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /*
   * The only credential guarding /admin, which lists customer names, phone
   * numbers, and email addresses. There is no username: one password, held by
   * the agency. The local default exists so `pnpm dev` works out of the box;
   * production refuses to boot without a real one.
   */
  ADMIN_PASSWORD: z.string().min(1).default(LOCAL_ADMIN_PASSWORD)
});

const parsed = schema.parse(process.env);

const LOOPBACK_SMTP_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/*
 * Domains nobody gets to send as. Resend delivers only for domains verified in
 * the account, and these publish DMARC policies telling receivers to reject
 * anything else wearing their name, so a sender here is a bounce with extra
 * steps. The agency's own Gmail address rides as Reply-To and Cc instead.
 */
const FREEMAIL_SENDER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com"
]);

/** The domain out of either `name@host` or `Name <name@host>`. */
function senderDomain(from: string): string {
  return (from.split("@").pop() ?? "").replace(">", "").trim().toLowerCase();
}

/*
 * A user without a password would make nodemailer connect anonymously, and the
 * relay would answer with a generic "relay access denied" that reads like a
 * network fault rather than a missing secret. Fail at boot with the real reason.
 */
if (Boolean(parsed.SMTP_USER) !== Boolean(parsed.SMTP_PASSWORD)) {
  throw new Error("SMTP_USER and SMTP_PASSWORD must be set together, or both left empty");
}

if (parsed.APP_ENV === "production") {
  if (!parsed.DUFFEL_ACCESS_TOKEN) {
    throw new Error("DUFFEL_ACCESS_TOKEN is required in production");
  }
  // Duffel test tokens return simulated airline content. Showing it as real
  // pricing would be worse than showing nothing, so production fails closed.
  if (parsed.DUFFEL_ACCESS_TOKEN.startsWith("duffel_test_")) {
    throw new Error("A Duffel test access token is forbidden in production");
  }
  if (parsed.ADMIN_PASSWORD === LOCAL_ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD must be set in production");
  }
  if (parsed.ADMIN_PASSWORD.length < ADMIN_PASSWORD_MINIMUM_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MINIMUM_LENGTH} characters in production`
    );
  }
  /*
   * Only when email is switched on. Left at the Mailpit default, production
   * would accept every welcome email and deliver none of them: the board would
   * show them SENT while no customer ever heard back. The lead is the product,
   * so fail closed rather than quietly.
   */
  if (parsed.INQUIRY_EMAIL_ENABLED) {
    if (LOOPBACK_SMTP_HOSTS.has(parsed.SMTP_HOST)) {
      throw new Error(`SMTP_HOST must be a real mail relay in production, not ${parsed.SMTP_HOST}`);
    }
    if (!parsed.SMTP_USER) {
      throw new Error("SMTP_USER and SMTP_PASSWORD are required in production");
    }
    /*
     * SMTP_FROM defaults to the agency's Gmail address, which is right for the
     * local mail catcher and refused by every real relay. Left unset here, the
     * site would boot, take requests, queue every job, and fail each send at
     * the relay — the failure arriving one unanswered lead at a time.
     */
    const from = senderDomain(parsed.SMTP_FROM);
    if (FREEMAIL_SENDER_DOMAINS.has(from)) {
      throw new Error(
        `SMTP_FROM must be a mailbox at a domain verified with the relay, not ${from}`
      );
    }
  }
}

if (parsed.APP_ENV !== "test" && !parsed.DUFFEL_ACCESS_TOKEN) {
  throw new Error(
    "DUFFEL_ACCESS_TOKEN is required. The site shows live Duffel prices and has no fallback data."
  );
}

export const env = parsed;
