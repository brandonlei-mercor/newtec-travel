import { describe, expect, it } from "vitest";
import { DuffelFlightSearchProvider } from "../../../src/server/integrations/duffel-flight-search";
import { createFlightSearchProvider } from "../../../src/server/integrations/flight-search";
import { FakeFlightSearchProvider } from "../../helpers/fake-flight-search";
import {
  SEARCH_DESTINATIONS,
  SEARCH_ORIGINS,
  cachedOffersSchema,
  flightOffersQuerySchema,
  type FlightOffersQuery
} from "../../../src/shared/contracts/search";

const baseQuery: FlightOffersQuery = {
  origin: "SFO",
  destination: "SGN",
  tripType: "ROUND_TRIP",
  departureDate: "2026-09-10",
  returnDate: "2026-09-24",
  adults: 1,
  children: 0,
  infants: 0,
  cabin: "ECONOMY"
};

describe("FakeFlightSearchProvider offers", () => {
  const provider = new FakeFlightSearchProvider();

  it("is deterministic for identical queries", async () => {
    const first = await provider.searchOffers(baseQuery);
    const second = await provider.searchOffers(baseQuery);
    expect(second).toEqual(first);
  });

  it("produces contract-valid round trips for every destination", async () => {
    for (const destination of SEARCH_DESTINATIONS) {
      const offers = await provider.searchOffers({ ...baseQuery, destination });
      expect(offers.length).toBeGreaterThanOrEqual(2);
      cachedOffersSchema.parse(offers);

      for (const offer of offers) {
        expect(offer.offerRef).toMatch(/^fake-[0-9a-f]{16}$/);
        expect(offer.estimated).toBe(true);
        expect(offer.priceTotalMinor).toBeGreaterThan(0);
        expect(offer.priceTotalMinor % 100).toBe(0);

        const inboundSlice = offer.inbound;
        // A round-trip query must produce a return leg on every offer.
        if (!inboundSlice) throw new Error(`round trip offer ${offer.offerRef} has no return`);

        const outbound = offer.outbound.segments;
        const inbound = inboundSlice.segments;
        expect(outbound[0]?.originAirport).toBe("SFO");
        expect(outbound[outbound.length - 1]?.destinationAirport).toBe(destination);
        expect(inbound[0]?.originAirport).toBe(destination);
        expect(inbound[inbound.length - 1]?.destinationAirport).toBe("SFO");

        for (const slice of [offer.outbound, inboundSlice]) {
          const segmentSum = slice.segments.reduce(
            (total, segment) => total + segment.durationMinutes,
            0
          );
          expect(slice.durationMinutes).toBeGreaterThanOrEqual(segmentSum);
          for (let index = 1; index < slice.segments.length; index += 1) {
            expect(slice.segments[index]?.originAirport).toBe(
              slice.segments[index - 1]?.destinationAirport
            );
          }
        }
        expect(offer.outbound.segments[0]?.departureLocal.slice(0, 10)).toBe(
          baseQuery.departureDate
        );
        expect(inboundSlice.segments[0]?.departureLocal.slice(0, 10)).toBe(baseQuery.returnDate);
      }
    }
  });

  it("varies prices by departure date", async () => {
    const datePairs: Array<[string, string]> = [
      ["2026-09-10", "2026-09-24"],
      ["2026-10-05", "2026-10-19"],
      ["2026-12-19", "2027-01-02"],
      ["2027-01-30", "2027-02-13"],
      ["2027-04-14", "2027-04-28"]
    ];
    const cheapest = await Promise.all(
      datePairs.map(async ([departureDate, returnDate]) => {
        const offers = await provider.searchOffers({ ...baseQuery, departureDate, returnDate });
        return offers[0]?.priceTotalMinor;
      })
    );
    expect(new Set(cheapest).size).toBeGreaterThan(1);
  });

  it("prices premium cabins and larger parties higher", async () => {
    const economy = (await provider.searchOffers(baseQuery))[0];
    const business = (await provider.searchOffers({ ...baseQuery, cabin: "BUSINESS" }))[0];
    expect(business?.priceTotalMinor ?? 0).toBeGreaterThan(economy?.priceTotalMinor ?? 0);

    const family = (await provider.searchOffers({ ...baseQuery, adults: 2, children: 1 }))[0];
    expect(family?.priceTotalMinor ?? 0).toBeGreaterThan(economy?.priceTotalMinor ?? 0);
  });
});

describe("flight search factory and contracts", () => {
  /*
   * The fake above is a test helper and lives outside src/ so no production
   * path can reach it. The factory only ever builds the live Duffel provider:
   * an invented price shown as real is worse than an outage.
   */
  it("always builds the live Duffel provider", () => {
    expect(createFlightSearchProvider()).toBeInstanceOf(DuffelFlightSearchProvider);
  });

  it("coerces and validates offer queries", () => {
    const parsed = flightOffersQuerySchema.parse({
      destination: "SGN",
      departureDate: "2026-09-10",
      returnDate: "2026-09-24",
      adults: "2",
      children: "1",
      infants: "0",
      cabin: "ECONOMY"
    });
    expect(parsed.adults).toBe(2);
    expect(parsed.children).toBe(1);
  });

  /*
   * Links to the search were shared before the agency sold out of anywhere but
   * San Francisco, and they must still open the trip they always meant.
   */
  it("defaults a query with no origin to the home airport", () => {
    const parsed = flightOffersQuerySchema.parse({
      destination: "SGN",
      departureDate: "2026-09-10",
      returnDate: "2026-09-24"
    });
    expect(parsed.origin).toBe("SFO");
  });

  it("accepts every departure city the agency sells", () => {
    for (const origin of SEARCH_ORIGINS) {
      expect(flightOffersQuerySchema.safeParse({ ...baseQuery, origin }).success).toBe(true);
    }
  });

  it("rejects invalid offer queries", () => {
    const invalid = [
      { ...baseQuery, returnDate: baseQuery.departureDate },
      { ...baseQuery, returnDate: "2026-09-05" },
      { ...baseQuery, adults: 9, children: 1 },
      { ...baseQuery, adults: 1, infants: 2 },
      { ...baseQuery, returnDate: "2026-12-10" },
      { ...baseQuery, destination: "NRT" },
      /* An airport the agency does not sell out of, so it never reaches Duffel. */
      { ...baseQuery, origin: "MIA" }
    ];
    for (const query of invalid) {
      expect(flightOffersQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
