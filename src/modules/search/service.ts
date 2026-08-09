import { createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Database } from "@/server/db";
import { flightOfferCaches } from "@/server/db/schema";
import type { Clock, FlightSearchProvider } from "@/server/integrations";
import {
  SEARCH_HORIZON_DAYS,
  cachedOffersSchema,
  flightOffersQuerySchema,
  type FlightOffer,
  type FlightOffersQuery,
  type FlightOffersResult
} from "@/shared/contracts/search";
import { currentPacificDate } from "@/shared/dates";
import { AppError } from "@/shared/errors";

const DAY_MS = 86_400_000;
const OFFER_CACHE_TTL_MS = 30 * 60 * 1000;

export type SearchDependencies = {
  db: Database;
  flightSearch: FlightSearchProvider;
  clock: Clock;
};

function addDaysIso(dateIso: string, days: number): string {
  return new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function assertWithinHorizon(query: FlightOffersQuery, today: string): void {
  if (query.departureDate < today) {
    throw new AppError("VALIDATION_ERROR", "Departure date is in the past", 422, {
      field: "departureDate"
    });
  }
  if (query.departureDate > addDaysIso(today, SEARCH_HORIZON_DAYS)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Departure date is beyond the ${SEARCH_HORIZON_DAYS}-day search window`,
      422,
      { field: "departureDate" }
    );
  }
}

/*
 * Bumped whenever a change alters which offers a search may return, so cached
 * rows written under the old rules are never read back. v2 introduced the
 * carrier allowlist: a v1 row can hold an airline the agency does not sell.
 */
const OFFER_CACHE_VERSION = "v2";

/**
 * The cache key a search is stored under. Exported so an end-to-end test can
 * seed a known set of offers and drive the real checkout without paying for a
 * live provider search; production code should go through the functions below.
 */
export function offerSearchKey(query: FlightOffersQuery, source: string): string {
  const canonical = [
    OFFER_CACHE_VERSION,
    /*
     * Origin took the place of the SFO constant that used to sit here, so an
     * SFO search still hashes to exactly the key it hashed to before and the
     * rows already in the table stay readable. Anywhere else is a new key.
     */
    query.origin,
    query.destination,
    query.tripType,
    query.departureDate,
    query.returnDate ?? "",
    query.adults,
    query.children,
    query.infants,
    query.cabin,
    source
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Drops offer caches that expired more than a day ago. This used to ride along
 * with the nightly fare-calendar sweep; with that job gone, the table is swept
 * here instead. It hangs off the cache-miss path deliberately — that request is
 * already waiting on a paid upstream search, so an indexed delete on the way out
 * costs nothing noticeable, and a cache hit stays a single read.
 *
 * The day of grace past expiry is what makes this safe to run from a request:
 * rows are only removed once nothing can still be reading them.
 */
async function pruneExpiredOfferCaches(db: Database, now: Date): Promise<void> {
  await db
    .delete(flightOfferCaches)
    .where(lt(flightOfferCaches.expiresAt, new Date(now.getTime() - DAY_MS)));
}

/**
 * Estimated offers for an exact date pair, cached by normalized search key.
 * The provider call happens outside any database transaction.
 */
export async function searchFlightOffers(
  { db, flightSearch, clock }: SearchDependencies,
  input: unknown
): Promise<FlightOffersResult> {
  const query = flightOffersQuerySchema.parse(input);
  const now = clock.now();
  assertWithinHorizon(query, currentPacificDate(now));

  const searchKey = offerSearchKey(query, flightSearch.source);
  const [cached] = await db
    .select()
    .from(flightOfferCaches)
    .where(eq(flightOfferCaches.searchKey, searchKey))
    .limit(1);

  if (cached && cached.expiresAt.getTime() > now.getTime()) {
    return {
      query,
      offers: cachedOffersSchema.parse(cached.offers),
      source: flightSearch.source,
      fetchedAt: cached.fetchedAt.toISOString()
    };
  }

  const offers = cachedOffersSchema.parse(await flightSearch.searchOffers(query));
  const expiresAt = new Date(now.getTime() + OFFER_CACHE_TTL_MS);
  await db
    .insert(flightOfferCaches)
    .values({
      searchKey,
      origin: query.origin,
      destination: query.destination,
      tripType: query.tripType,
      departureDate: query.departureDate,
      returnDate: query.returnDate ?? null,
      adults: query.adults,
      children: query.children,
      infants: query.infants,
      cabin: query.cabin,
      offers,
      source: flightSearch.source,
      fetchedAt: now,
      expiresAt
    })
    .onConflictDoUpdate({
      target: flightOfferCaches.searchKey,
      set: { offers, fetchedAt: now, expiresAt }
    });

  await pruneExpiredOfferCaches(db, now);

  return { query, offers, source: flightSearch.source, fetchedAt: now.toISOString() };
}

/**
 * The one offer a customer picked, read back from our own cache so the request
 * page shows what we quoted rather than whatever a URL claims.
 *
 * Expiry is deliberately ignored and the provider is never called: this is an
 * echo of a choice already made, not a re-price, and a page load must not be
 * able to spend a paid upstream search. Returns undefined when the search was
 * never run here or has since been pruned, which the caller treats as "go pick
 * a flight again" rather than showing a request form with no flight in it.
 */
export async function findSelectedOffer(
  { db, flightSearch }: Pick<SearchDependencies, "db" | "flightSearch">,
  input: unknown,
  offerRef: string
): Promise<FlightOffer | undefined> {
  const query = flightOffersQuerySchema.parse(input);
  const [cached] = await db
    .select({ offers: flightOfferCaches.offers })
    .from(flightOfferCaches)
    .where(eq(flightOfferCaches.searchKey, offerSearchKey(query, flightSearch.source)))
    .limit(1);
  if (!cached) return undefined;
  return cachedOffersSchema.parse(cached.offers).find((offer) => offer.offerRef === offerRef);
}
