import { config } from "dotenv";
import { Pool } from "pg";
import { offerSearchKey } from "@/modules/search/service";
import type { FlightOffersQuery } from "@/shared/contracts/search";
import { FakeFlightSearchProvider } from "../../helpers/fake-flight-search";

/*
 * The browser tests need a flight to check out with, and the site only shows
 * real fares. Rather than spend a rate-limited Duffel search per run (and hope
 * the airlines publish something on the day the test picked), we write a known
 * set of offers into the same cache a real search writes, under the same key.
 * Everything after that is the real thing: the results page reads the cache,
 * and the request page reads back the offer the browser actually clicked.
 */
config({ path: ".env.local", quiet: true });

const DAY_MS = 86_400_000;
/** The dev provider, so a seeded row is the one the running server looks for. */
const SOURCE = "DUFFEL";
/*
 * Deliberately longer than the production TTL. The results page only serves a
 * cached search while it is unexpired, and an expiry that lapsed mid-suite would
 * quietly fall through to a live, rate-limited, paid provider call.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type SeededOffer = {
  /** The /flights and /request query string, minus the offer reference. */
  search: string;
  offerRef: string;
};

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Puts a deterministic search in the offer cache and returns the query the
 * pages expect plus one offer reference from it.
 */
export async function seedOfferCache(): Promise<SeededOffer> {
  const query: FlightOffersQuery = {
    origin: "SFO",
    destination: "SGN",
    tripType: "ROUND_TRIP",
    departureDate: isoDate(45),
    returnDate: isoDate(59),
    adults: 2,
    children: 0,
    infants: 0,
    cabin: "ECONOMY"
  };

  const offers = await new FakeFlightSearchProvider().searchOffers(query);
  const first = offers[0];
  if (!first) throw new Error("the fake provider returned no offers to seed");

  const now = new Date();
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  try {
    await pool.query(
      `insert into flight_offer_caches
         (search_key, origin, destination, trip_type, departure_date, return_date,
          adults, children, infants, cabin, offers, source, fetched_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (search_key) do update
         set offers = excluded.offers,
             fetched_at = excluded.fetched_at,
             expires_at = excluded.expires_at`,
      [
        offerSearchKey(query, SOURCE),
        query.origin,
        query.destination,
        query.tripType,
        query.departureDate,
        query.returnDate ?? null,
        query.adults,
        query.children,
        query.infants,
        query.cabin,
        JSON.stringify(offers),
        SOURCE,
        now,
        new Date(now.getTime() + CACHE_TTL_MS)
      ]
    );
  } finally {
    await pool.end();
  }

  const search = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    tripType: query.tripType,
    departureDate: query.departureDate,
    returnDate: query.returnDate ?? "",
    adults: String(query.adults),
    children: String(query.children),
    infants: String(query.infants),
    cabin: query.cabin
  }).toString();

  return { search, offerRef: first.offerRef };
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; run the local stack before the e2e suite");
  return url;
}
