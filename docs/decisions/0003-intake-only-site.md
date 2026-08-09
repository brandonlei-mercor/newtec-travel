# ADR 0003 — Reduce the site to fare display and intake

**Status:** Accepted  
**Date:** 2026-08-08  
**Supersedes parts of:** [ADR 0001](0001-flight-content-and-booking-model.md)

## Context

The repository grew a full concierge case-management system: a customer portal, itinerary options, fingerprinted quotes, hosted payment with manual capture, ticket and coupon recording, an independent issuance audit, visa cases, document quarantine and vault, an append-only accounting subledger, and CSV exports. Roughly two thirds of it ran on synthetic seed data and fake adapters, because the real counterpart lives in the agency's Sabre Red 360 terminal.

NEWTEC is a family-run, ARC-accredited agency. Its actual process is: a customer calls or writes, a specialist prices the trip in Sabre, and the specialist issues the ticket by hand. Nobody at the agency was ever going to accept payment through this site, audit their own issuance in it, or keep a second set of books in it.

Two problems followed from the gap:

1. **Invented data was indistinguishable from real data.** A deterministic fake search provider shipped inside `src/`, so a configuration slip could show a made-up fare as a real one. Seeded demo cases sat in the same tables as real requests.
2. **Every unbuilt half carried real risk for no benefit.** Storing card-adjacent state, passport metadata, and customer documents creates obligations the agency does not need to take on to answer the phone.

## Decision

The site does two things: **show live Duffel prices**, and **collect a request for a callback**.

Deleted: the customer portal and sign-in, development authentication, itinerary options, quotes, payments and the fake payment gateway, fulfillment and ticket/coupon records, the issuance audit, visa cases, document upload with its quarantine/vault buckets and malware scanning, the accounting subledger and exports, staff queues and case workspaces, and the synthetic seed.

Kept: the landing page, `/flights`, the request form, the legal pages, and one operations page listing inquiries.

Three supporting rules:

- **No fallback price data.** `createFlightSearchProvider` only ever builds the live Duffel provider, and the app refuses to boot without a token outside tests. The deterministic fake now lives in `tests/helpers/`, outside `src/`, where no production path can reach it. An outage is an honest failure; an invented price is not.
- **Every result list ends at the phone.** Duffel returns what its airline partners publish. Group fares and the agency's business-class contracts are quoted by hand, so the page says so and shows the number rather than implying the results are everything.
- **Both contact channels are required.** The customer picks email or phone as preferred, but must give both. The agency calls back by hand, and one wrong digit or a filtered mailbox must not be the only route to a lead.

## The back office

A new request writes the inquiry row and an `inquiry_notifications` outbox row in one transaction and enqueues the send inside that same transaction. A worker sends one email to the agency mailbox with `Reply-To` set to the customer.

Email alone was rejected: a bounced or filtered message loses a customer silently, and a mailbox is not a work queue. A full CRM was also rejected: nobody will maintain it. `/admin` is the middle: a single board, New → Processing → Done, with each card's delivery state visible and its column stored as the request's status. If the mail fails, the request is still there and the row says the email failed.

`/admin` is guarded by one password, exchanged for a signed session cookie and checked in the proxy and again inside the page and the status route. The double check is deliberate: the board is customer names, phone numbers, and email addresses, and a matcher regression must not be the only thing standing between them and the internet. Production refuses to boot on the local default password.

## Consequences

- Duffel returns public market fares. If NEWTEC holds consolidator or net fares on Vietnam Airlines, the site can quote higher than the agency actually sells. That is a known open question, and the phone notice partly covers it.
- There is no record here of what happened after the callback. That lives in Sabre and in the agency's own records, which is where it already lived.
- Restoring any deleted capability means designing it against the real Sabre process, not resurrecting the fake adapters.
- The dependency surface shrank accordingly: Auth0, Stripe, the AWS S3 clients, `file-type`, `jose`, and `react-hook-form` are gone from `package.json`, and Compose runs only PostgreSQL and Mailpit.
