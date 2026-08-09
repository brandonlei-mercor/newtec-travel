import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findSelectedOffer, searchFlightOffers } from "@/modules/search/service";
import { flightOfferCaches } from "@/server/db/schema";
import { FixedClock } from "@/server/integrations/clock";
import { FakeFlightSearchProvider } from "../helpers/fake-flight-search";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "../helpers/database";

const NOW = new Date("2026-07-18T12:00:00Z");
const OFFER_CACHE_TTL_MS = 30 * 60 * 1000;

const query = {
  destination: "SGN",
  tripType: "ROUND_TRIP",
  departureDate: "2026-09-01",
  returnDate: "2026-09-15",
  adults: 2,
  children: 0,
  infants: 0,
  cabin: "ECONOMY"
} as const;

/**
 * The request page never trusts the URL for what a flight is or costs: it names
 * an offer and we look it up in the cache the search itself wrote. These are the
 * ways that lookup can come back empty, each of which sends someone back to
 * search rather than into a form holding a price we cannot stand behind.
 */
describe("reading back a chosen offer", () => {
  let database: IsolatedTestDatabase;
  const clock = new FixedClock(NOW);
  const flightSearch = new FakeFlightSearchProvider();

  beforeAll(async () => {
    database = await createIsolatedTestDatabase("selected-offer");
  });

  afterAll(async () => {
    await database.cleanup();
  });

  beforeEach(async () => {
    clock.set(NOW);
    await database.db.delete(flightOfferCaches);
  });

  async function runSearch() {
    return searchFlightOffers({ db: database.db, flightSearch, clock }, query);
  }

  it("returns the offer the customer picked, exactly as it was quoted", async () => {
    const { offers } = await runSearch();
    const picked = offers[1];
    expect(picked).toBeDefined();

    const found = await findSelectedOffer(
      { db: database.db, flightSearch },
      query,
      picked!.offerRef
    );
    // Same price, same flights: this is what the card on screen showed.
    expect(found).toEqual(picked);
  });

  it("finds nothing when the reference does not belong to this search", async () => {
    await runSearch();
    // A guessed or copied reference must not resolve to some other trip's flight.
    expect(
      await findSelectedOffer({ db: database.db, flightSearch }, query, "off_not_in_this_search")
    ).toBeUndefined();
  });

  it("finds nothing when the search itself was never run here", async () => {
    // No cache row at all: nothing was ever quoted for these dates.
    expect(
      await findSelectedOffer({ db: database.db, flightSearch }, query, "off_anything")
    ).toBeUndefined();
  });

  it("does not let a changed traveler count read another search's offers", async () => {
    const { offers } = await runSearch();
    const picked = offers[0]!;

    /*
     * The count is part of the cache key because it is part of the price. Editing
     * it in the address bar must miss rather than quietly reprice the same flight.
     */
    expect(
      await findSelectedOffer(
        { db: database.db, flightSearch },
        { ...query, adults: 3 },
        picked.offerRef
      )
    ).toBeUndefined();
  });

  it("still answers after the cache row has gone stale", async () => {
    const { offers } = await runSearch();
    const picked = offers[0]!;
    const [row] = await database.db.select().from(flightOfferCaches);
    expect(row!.expiresAt.getTime()).toBe(NOW.getTime() + OFFER_CACHE_TTL_MS);

    // Someone who spends 45 minutes filling in the form must not lose the flight
    // they picked. Pruning eventually removes the row; expiry alone does not.
    clock.set(new Date(NOW.getTime() + 45 * 60 * 1000));
    const found = await findSelectedOffer(
      { db: database.db, flightSearch },
      query,
      picked.offerRef
    );
    expect(found?.offerRef).toBe(picked.offerRef);

    // And it answered from the cache rather than paying for a fresh search.
    const rows = await database.db
      .select()
      .from(flightOfferCaches)
      .where(eq(flightOfferCaches.searchKey, row!.searchKey));
    expect(rows[0]?.fetchedAt.getTime()).toBe(NOW.getTime());
  });
});
