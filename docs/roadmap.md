# Delivery record

**Status:** Implemented  
**Updated:** 2026-08-08

The site shows live fares and collects callback requests. Scraping, Sabre automation, payment, and
deployment are outside the product boundary. Staff price and issue travel through the agency's own
Sabre Red 360 access.

## Phase 1 — Foundation

- One strict TypeScript Next.js application with modular domain boundaries.
- PostgreSQL and Drizzle migrations, Graphile Worker, and Mailpit via Compose.
- English and Vietnamese shells, design tokens, CI, Vitest, and Playwright harnesses.

## Phase 2 — Request intake

- Bilingual, accessible four-step form constrained to the supported departure cities and Vietnam
  destinations.
- Party, date-horizon, consent, assistance, language, cabin, and visa-interest validation shared
  between browser and server.
- Idempotent creation: a retried submission returns the first result rather than a second lead.
- Both contact channels required, with a preferred one recorded and reflected back to the customer.

## Phase 3 — Live fares

- Duffel offer search for Vietnam Airlines and EVA Air, USD only, with near-duplicate offers grouped.
- A month date picker for choosing departure and return. It shows no prices: every cell would be a
  separate billable Duffel search, so pricing happens once, on the search the customer asks for.
- Selecting a flight pre-fills the request form.
- Every result list closes with the agency phone number for other flights and for group and
  business-class discounts, because those never appear in Duffel results.

## Phase 4 — Back office

- Transactional outbox: the request row, the notification row, and the send job are written in one
  transaction, so a mail outage cannot lose a lead.
- One email per request to the agency mailbox, `Reply-To` set to the customer, with the phone,
  email, preferred channel, language, trip, and notes it takes to call back.
- `/admin`: a New → Processing → Done board with click-to-call and click-to-mail contact details,
  per-card delivery state, and drag-and-drop moves that persist the status on the row.
- One password, exchanged at `/admin/login` for a signed session cookie and verified in the proxy
  and again in the page and the status route, with a constant-time digest comparison. Production
  refuses the local default password.

## Phase 5 — Reduction to intake only

Recorded in [ADR 0003](decisions/0003-intake-only-site.md).

- Removed the customer portal, sign-in, development authentication, itinerary options, quotes,
  payments, fulfillment, the issuance audit, visa cases, document storage, the accounting subledger,
  exports, staff queues, and the synthetic seed.
- Removed every source of invented pricing: the deterministic fake provider moved to `tests/helpers/`
  outside `src/`, and the app now refuses to boot without a Duffel token.
- Dropped the dependencies and Compose services that only those features needed.

## Still required before real customers

- Human review of Vietnamese legal and transactional copy, and WCAG keyboard and screen-reader
  checks with a real assistive technology.
- Confirmation of whether NEWTEC's consolidator or net fares undercut the public Duffel fares the
  site displays, and what the page should say if they do.
- Business and legal validation of seller-of-travel disclosure and data-retention obligations for
  the contact details `/admin` holds.
- Production email deliverability (SPF, DKIM, DMARC for the agency domain), secrets handling,
  backups, monitoring, rate limiting on the public form, and a deployment design.
