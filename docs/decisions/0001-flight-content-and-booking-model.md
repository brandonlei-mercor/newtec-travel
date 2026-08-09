# ADR 0001: Inquiry-first flight content and fulfillment

**Status:** Superseded in part by [ADR 0003](0003-intake-only-site.md)  
**Date:** 2026-07-12  
**Owners:** Product, operations, finance, and engineering

> Read this as history. The inquiry-first premise and the reasoning against public-web
> aggregation still hold, but everything after the request — staff-entered options, quotes,
> authorization, capture, issuance, the audit, visa cases, documents, and the ledger — was
> removed by ADR 0003. Those steps happen in the agency's Sabre Red 360 terminal and are not
> modeled in this repository.

## Context

The agency has staff access to authorized Vietnam Airlines/Sabre workflows, but a direct Sabre API is not currently economical. Scraping Google Flights, an airline site, or another OTA would not provide contractual display rights, stable availability, priceable offer identifiers, servicing authority, or a reliable ticketing source of truth.

The valuable product is the agency's route expertise and human fulfillment, not the appearance of exhaustive public inventory.

## Decision

Version one is an inquiry-first concierge:

`inquiry → staff-entered options → traveler details → immutable quote → authorization → final check → capture → manual issue → independent audit`

- Customers do not search public live inventory.
- Staff enters itinerary and fare information only after checking an authorized Sabre environment.
- Published itinerary versions, quotes, acceptances, payment evidence, supplier records, tickets, coupons, journal entries, messages, and audits are append-only.
- The application never stores Sabre credentials or automates the terminal.
- Search and ticketing adapters are not speculative extension points in version one. A future licensed integration requires a new ADR and explicit commercial authorization.
- A browser redirect never advances payment state. Only a verified provider event may authorize or capture funds.
- A recorded PNR is labeled “Airline record locator.” It is not confirmation.
- The traveler sees a confirmed projection only after each accepted traveler has an active ticket and an active coupon for each accepted segment, followed by a passing audit from someone other than the issuer.
- Issuance creates an audit due within 24 hours. A failed audit opens a critical exception and removes the confirmed projection.

## Supported scope

- Round trips originating at SFO.
- SGN, HAN, DAD, or flexible among those three destinations.
- One to nine travelers, with at least one adult and no more lap infants than adults.
- Economy, premium economy, business, or no cabin preference.
- English and Vietnamese customer experience; English-only operations console.
- Flight-linked visa preparation, documents, communications, refunds, reconciliation, and export.

One-way, multi-city, hotel/car/package, visa-only, customer self-service changes, government-portal automation, and deployment infrastructure are out of scope.

## Why not public-web aggregation

Public pages are presentation products, not agency distribution APIs. Copying them would create both product and operational defects:

- No defensible “all flights” or real-time availability claim.
- Prices and seats may change without machine-readable expiry or reprice semantics.
- Incomplete fare rules, baggage, point-of-sale, private fare, and codeshare details.
- No ability to create, retrieve, issue, void, exchange, or refund the same offer.
- Fragile anti-bot/page-change dependency and unclear reuse rights.

The application therefore makes a truthful service promise: submit preferences at any time, then receive options checked by a specialist.

## Money and ticketing policy

The customer accepts one exact quote fingerprint. A final staff check records retrieval time, supplier amount, ticketing deadline, PNR HMAC, and itinerary/fare fingerprints.

- A material mismatch blocks capture, voids the authorization, and requires a replacement quote and acceptance.
- Matching evidence queues exact capture; staff issues immediately after confirmed capture.
- Partial ticketing never appears confirmed.
- Refunds, overrides, and issuance audit require a distinct authorized person where policy calls for dual control.
- Authorization has no journal effect. Posted accounting corrections are reversing entries, never edits.

## Consequences

Positive:

- The initial system has no external flight-data dependency or unlicensed content risk.
- The customer language matches what staff can actually fulfill.
- Human operations are structured, versioned, auditable, and ready for selective future automation.
- Failure states—fare mismatch, payment without ticket, partial ticketing, failed audit, and refund pending—remain visible and owned.

Tradeoffs:

- Customers wait for a specialist rather than receiving instant search results.
- Service-window and staffing discipline affect conversion.
- Staff performs duplicate entry between Sabre and this system until a licensed integration is approved.

## Future review trigger

Revisit this decision only when the agency has written API/display/ticketing authority, proven SFO–Vietnam content and servicing behavior, approved unit economics, and an end-to-end sandbox contract covering reprice, issue, retrieve, void, and refund. The new integration must preserve the same quote, payment, coverage, audit, and ledger guards.
