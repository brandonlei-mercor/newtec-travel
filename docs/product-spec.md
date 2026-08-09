# Product specification

**Product:** NEWTEC TRAVEL AND TOURS — US ↔ Vietnam  
**Version:** 2.0, intake only  
**Updated:** 2026-08-08

Version 1.0 specified a full concierge case-management system. [ADR 0003](decisions/0003-intake-only-site.md) records why that was cut back to what the agency actually does.

## 1. Product promise

The site answers two questions a customer has before they call:

1. What do flights from San Francisco, Los Angeles, Phoenix, or New York to Vietnam cost right now?
2. How do I get a person to help me book one?

`search live fares → send a request → a specialist calls back → the specialist tickets it in Sabre`

The site never sells anything. It has no cart, no payment, no account, and no booking record. Ticketing is manual work in the agency's Sabre Red 360 terminal, by ARC-accredited staff, exactly as it was before the site existed.

Customer-facing language stays honest about that:

| Term             | Meaning                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Estimated fare   | What an airline published to Duffel a moment ago. Not a held seat and not a quoted price. |
| Request          | Trip preferences and contact details submitted for a callback. Nothing is reserved.       |
| Reference `TV-…` | The handle a customer can quote on the phone.                                             |

## 2. Scope

### Included

- Origin SFO, LAX, PHX, or JFK, defaulting to SFO; round-trip destination SGN, HAN, DAD, or flexible among those cities.
- Live Duffel fares, a month calendar to pick dates on, sorting, a nonstop filter, and grouping of near-duplicate offers.
- Exact dates, ±1 day, or ±3 days, within 330 days.
- One to nine travelers, at least one adult, with infants not exceeding adults.
- Economy, premium economy, business, or no cabin preference.
- English and Vietnamese customer UI.
- A closing notice on every result list pointing at the phone for other flights and for group and business-class discounts.
- One email per request to the agency mailbox, with `Reply-To` set to the customer.
- One operations page listing requests, behind a single credential.

### Excluded

- Payment, ticketing, seat holds, customer accounts, and any post-callback record.
- Scraping, cached public fares, and any price the site did not receive from Duffel.
- Sabre terminal or API automation.
- Visa sales, document collection, and government-portal automation.
- Multi-city trips, departure cities outside the four supported airports, hotel/car/package/insurance products.
- Deployment and infrastructure-as-code.

## 3. The request form

Four mobile-first steps: trip, travelers, contact, review.

- The server accepts only the four supported origins and validates dates against the 330-day horizon, party composition, contact details, language, cabin, visa interest, assistance, and notes.
- **Email and phone are both required.** The customer picks one as preferred, which the confirmation page and the agency email both reflect, but both are collected: the agency calls back by hand and one bad channel must not strand the lead.
- Consent to be contacted about the request, and authority to submit other travelers' details, are both required. Marketing consent is separate and unchecked.
- Passport, payment, and medical data are never requested, and the notes fields say so.
- Success shows the `TV-…` reference, says nothing is reserved, and gives the phone number for anything urgent.

## 4. Back office

Every submission writes the request and its outbox row in one transaction, and queues the email that announces it when `INQUIRY_EMAIL_ENABLED` is on.

- **`/admin`** is the durable record and the place the work happens: a three-column board — New, Processing, Done — with each request's contact details as click-to-call and click-to-mail links, and cards that move between columns by drag or by a plain select. The column a card sits in is the request's status, stored on the row.
- **Email**, when enabled, is the alert. One message to `newtectravelagency@gmail.com`, subject carrying the reference and route, body carrying phone, email, preferred channel, language, trip, party, and notes. Replying answers the customer. Each card shows whether its email was sent, queued, or failed.

A mail outage therefore degrades to "someone has to open `/admin`", not to a lost customer. Access is one password, `ADMIN_PASSWORD`, exchanged at `/admin/login` for a signed eight-hour session cookie and checked in the proxy and again in the page and the status route; production refuses to boot on the local default.

## 5. Business rules

- Prices come from Duffel and nowhere else. No fallback provider exists in the application, and the app refuses to boot without a token outside tests.
- Offers not priced in USD are dropped rather than converted.
- A displayed fare is labeled estimated, because it can change until the agency issues the ticket.
- The calendar is a cache with a 72-hour freshness horizon; a cold month backfills in the background while the grid polls.
- A retried submission returns the first result: a double-clicked submit button is one lead, not two.
- Carriage returns and newlines are rejected in names, email, and phone by the contract, by the email sender, and by a database column check, because those values reach an email header.

## 6. Localization, design, and accessibility

Customer routes use `/en` and `/vi` with English fallback. `/admin` is English only.

The target is WCAG 2.2 AA: skip links, correct landmarks and headings, visible focus, 44px touch targets, reduced-motion support, error summaries, and keyboard-operable controls. Message-key parity between locales is checked. Legal and transactional Vietnamese content requires professional human review before real use.

## 7. Completion criteria

- A fresh clone reaches a working application with `pnpm bootstrap`, a Duffel token, and `pnpm dev`.
- No screen implies a reservation, a held seat, or a confirmed price.
- No price on any screen originated anywhere but Duffel.
- A duplicate submission cannot create a second request or a second email.
- A submitted request survives a mail failure and is visible with its failure reason.
- `/admin` redirects to its sign-in form without a session, and its status route returns 401.
- Both locales have complete customer keys and the public pages pass automated accessibility checks.
- Unit tests cover the contract and the notification; integration tests cover intake, the outbox, retries, and delivery failure against real PostgreSQL; Playwright covers the customer path, the admin gate, and accessibility.

Production launch additionally requires real email deliverability, legal and compliance review, professionally reviewed Vietnamese copy, monitoring and backups, and deployment infrastructure. Those are deliberately not performed by this repository.
