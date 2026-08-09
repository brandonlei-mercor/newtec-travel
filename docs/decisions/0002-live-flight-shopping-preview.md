# ADR 0002: Live flight-shopping preview with estimated fares

**Status:** Accepted; downstream references amended by [ADR 0003](0003-intake-only-site.md); the
fare calendar it introduced was removed on 2026-08-09 and the origin was widened on 2026-08-09
(see the notes below)  
**Date:** 2026-07-18  
**Owners:** Product, operations, and engineering  
**Amends:** ADR 0001

> **The fare calendar described here no longer exists.** On 2026-08-09 the agency decided that
> a priced month grid was not worth what it cost: every cell is a separate billable Duffel
> search, and the whole apparatus that made that affordable — the `fare_calendar_entries`
> table, the nightly `refresh_fare_calendar` sweep, the on-read backfill, the `backfilling`
> flag, the polling grid, and the homepage "from $X" strip — existed only to hide that price
> from the customer. The date picker is now an unpriced calendar, and one search runs when a
> customer picks their dates and asks. Everything below about the calendar is kept as the
> record of why it was built, not as a description of the system. The offer cache and its
> expiry sweeping survived; the sweep moved from the nightly job into the cache-miss path of
> `searchFlightOffers`.
>
> **The origin is no longer fixed to SFO.** On 2026-08-09 the agency added Los Angeles, Phoenix,
> and New York (JFK) as departure cities. SFO remains the default and the home airport; the other
> three are a closed set enforced the same way the destinations are — a Zod enum on the query, a
> check constraint on both `inquiries.origin` and `flight_offer_caches.origin`, and the origin as
> part of the offer cache key so two cities can never share one cached search. The carrier
> allowlist was left alone, so Phoenix (STARLUX only) and New York (EVA only) return thinner
> result sets than San Francisco and Los Angeles. Read "non-SFO origins remain out of scope"
> below as the record of the original decision, not the current rule.
>
> The rest of the search decisions here are still in force. Where this ADR defers a guarantee to a
> quote, an authorization, a capture, or an issuance audit, read "the specialist prices and
> issues the trip in Sabre after the callback" instead: ADR 0003 removed those flows from the
> application. One rule tightened rather than relaxed — there is no longer a fallback search
> provider inside `src/`, so a fare is either live from Duffel or absent.

## Context

ADR 0001 established the inquiry-first concierge and deliberately excluded a public
search surface and speculative search adapters. Customers, however, comparison-shop on
Google Flights and expect a date-picker-and-results experience before they commit to a
request. The agency serves exactly three round-trip routes (SFO ↔ SGN, HAN, DAD), which
makes a cached fare-preview surface cheap to operate and easy to keep fresh.

The insight that unlocks this without violating ADR 0001's money and ticketing guards:
the shopping surface only needs to be _indicative_. Every downstream guarantee — staff
Sabre verification, the immutable fingerprinted quote, authorization, the final check,
capture, manual issuance, and independent audit — remains the sole source of bookable
truth.

## Decision

Add a customer-facing flight-shopping preview at `/[locale]/flights`:

- A `FlightSearchProvider` integration boundary supplies **estimated** fare-calendar
  entries and flight offers. Version one ships a deterministic local fake provider;
  Duffel is the first real implementation (see the amendment below).
- Estimated data is cached in two new tables (`fare_calendar_entries`,
  `flight_offer_caches`). These are caches, not business evidence: they are upserted in
  place, carry a source label and fetch timestamp, and **no quote, payment, or ledger
  row may ever derive from them**.
- A recurring `refresh_fare_calendar` worker job prefetches the calendar across the
  three destinations; offer searches are cached by a normalized search key with a short
  TTL.
- Every price on the shopping surface is labeled as an estimate that a specialist
  confirms before payment. No screen calls a search result a bookable offer, and the
  UI makes no "all flights" or real-time availability claim.
- Selecting an offer only pre-fills the existing inquiry form (destination, dates,
  party, cabin, and a human-readable summary of the selected flights in the notes
  field). Case intake, staffing, quoting, payment, fulfillment, and audit flows are
  unchanged from ADR 0001.
- The fake provider is forbidden when `APP_ENV=production`, mirroring the existing
  fail-closed rules for development auth and fake payments.
- Provider credentials (for example Amadeus keys) live only in environment variables,
  never in the database or logs.

## What this does not change

- Staff-entered, Sabre-checked itinerary options remain the only content a quote can
  reference.
- The customer promise is unchanged: a specialist confirms availability and the exact
  fare before any payment. The preview shortens the conversation; it does not replace
  the check.
- One-way, multi-city, and non-SFO origins remain out of scope.
- No scraping of Google Flights, airline sites, or other OTAs. Real providers must be
  licensed APIs with written display authority.

## Consequences

Positive:

- Customers get an instant, familiar shopping experience and arrive at the inquiry
  form with realistic dates and expectations.
- The tiny route space keeps prefetching cheap and the preview fresh.
- The provider boundary gives the future Sabre or Amadeus integration (per ADR 0001's
  review trigger) a ready seam with deterministic local substitutes for tests.

Tradeoffs:

- Estimated prices can differ from the verified quote; copy must manage that
  expectation, and staff may field "the site said it was cheaper" conversations.
- The public search endpoints widen the pre-auth surface; query inputs are strictly
  bounded and cache-keyed, and production rate limiting remains a deployment-boundary
  responsibility.

## Amendment 2026-08-08: Duffel is the first real provider

Amadeus decommissioned its self-service portal on 17 July 2026, so the planned Amadeus
adapter has no signup path. Of the remaining options, Duffel is the only one that is
self-serve and contract-free. Sabre reaches the same content but costs roughly $6,125 in
year one, which buys booking capability the site does not need: ticketing already happens
by hand in Sabre Red 360.

Live verification on 8 August 2026 against the production API, one round-trip search per
destination departing 2026-10-10, returned all three carriers the agency sells, contrary
to the pre-integration assumption that STARLUX was absent:

| Destination | Carriers returned      | Cheapest |
| ----------- | ---------------------- | -------- |
| SGN         | OZ, KE, BR, JX, CX, VN | $794.73  |
| HAN         | OZ, BR, CX, VN         | —        |
| DAD         | OZ, BR, JX, VN         | —        |

Vietnam Airlines (VN), EVA Air (BR), and STARLUX (JX) are all in Duffel's content; JX
appears on the Taipei-connecting SGN and DAD routes. Duffel also returns Asiana, Korean
Air, and Cathay Pacific, which routinely undercut all three on price. The preview shows
whatever the search returns rather than a fixed carrier list, so no carrier allow-list is
implemented.

Search without booking is explicitly permitted and priced by Duffel, not a terms
violation: their search-to-order ratio treats zero orders as one order, so usage is
1,500 free searches a month and $0.005 each after that.

`FLIGHT_SEARCH_PROVIDER=duffel` selects `DuffelFlightSearchProvider`, which adds three
constraints worth recording:

- **Every calendar cell is one paid search.** Duffel has no calendar endpoint. The blind
  nightly sweep as originally written was 3 destinations x 330 days x 4 stay lengths =
  3,960 upstream requests, about $590 a month. The prefetch is now the default 14-night
  stay across a 120-day booking window on a 72-hour freshness budget, so a sweep is 360
  requests every third day. Months beyond that window stay exact because opening one
  enqueues a backfill, and only for months a customer opens.
- **Duffel allows 10 offer requests per wall-clock minute**, reported through
  `ratelimit-limit` / `ratelimit-remaining` / `ratelimit-reset`. `ratelimit-reset` is an
  HTTP-date and Duffel sends no `retry-after`, so an exponential backoff from 400ms
  retries three times inside the same rejected minute and gives up; the live calendar
  silently lost 21 of 31 dates that way. `DuffelClient` now paces outbound offer requests
  to 8 a minute (below the allowance, because a worker sweep and a customer's live search
  draw on the same per-process quota) and derives a 429 wait from `ratelimit-reset`.
- **A calendar read therefore cannot fill its own month.** Thirty-one dates at that pace
  is roughly four minutes, so `getFareCalendar` serves whatever is cached, returns
  `backfilling: true`, and enqueues a `refresh_fare_calendar` job keyed
  `calendar:<destination>:<stayNights>:<month>` so repeat views of the same grid collapse
  onto one job. The job recomputes the missing-or-stale set before fetching, since another
  sweep may have covered it in the meantime and every date is a paid search. The grid
  polls and fills in behind the reader.
- **Duffel prices in the organisation's billing currency.** A non-USD offer is dropped,
  never converted, and a response entirely in a foreign currency raises a configuration
  error. Inventing an exchange rate would put a wrong number on a page that customers
  read as dollars.
- **A Duffel test token is rejected when `APP_ENV=production`**, alongside the existing
  fail-closed rules. Test content shown as real pricing is worse than showing nothing.

Duffel returns public market fares, not the agency's own consolidator or net fares. The
preview is labeled an estimate either way, and the staff-verified quote remains the only
bookable number, so this is a positioning question rather than a correctness one.

Booking through Duffel stays out of scope. No Orders API, no payment instrument, and no
passenger identity leaves the app: an offer request carries traveller counts and cabin,
never names or documents.
