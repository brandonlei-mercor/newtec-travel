import { env } from "../../shared/env";
import type { FlightOffer, FlightOffersQuery, SearchSource } from "../../shared/contracts/search";
import { DuffelClient } from "./duffel-client";
import { DuffelFlightSearchProvider } from "./duffel-flight-search";

/**
 * Shopping-preview boundary. Results are estimates for display only; the site
 * never books or charges, and staff reprice by hand in Sabre. See ADR 0002.
 */
export interface FlightSearchProvider {
  readonly source: SearchSource;
  searchOffers(query: FlightOffersQuery): Promise<FlightOffer[]>;
}

/**
 * Duffel is the only provider. There is deliberately no fabricated fallback: a
 * wrong price shown as real is worse than no price, so a missing token fails at
 * startup rather than degrading to invented numbers. The deterministic stand-in
 * the tests use lives in tests/helpers/fake-flight-search.ts, out of src/, so
 * no production code path can reach it.
 */
export function createFlightSearchProvider(): FlightSearchProvider {
  // env.ts already fails startup when the token is missing; this narrows the type.
  if (!env.DUFFEL_ACCESS_TOKEN) {
    throw new Error("A Duffel access token is required to search for flights");
  }
  return new DuffelFlightSearchProvider(
    new DuffelClient({
      accessToken: env.DUFFEL_ACCESS_TOKEN,
      apiUrl: env.DUFFEL_API_URL,
      supplierTimeoutMs: env.DUFFEL_SUPPLIER_TIMEOUT_MS
    })
  );
}
