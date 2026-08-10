import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDuffelOfferRequestBody,
  mapDuffelOffers,
  parseIso8601DurationMinutes
} from "../../../src/server/integrations/duffel-flight-search";
import { cachedOffersSchema, type FlightOffersQuery } from "../../../src/shared/contracts/search";

const fixture: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../fixtures/duffel/offer-request-sfo-sgn.json", import.meta.url)),
    "utf8"
  )
);

const query: FlightOffersQuery = {
  origin: "SFO",
  destination: "SGN",
  tripType: "ROUND_TRIP",
  departureDate: "2026-09-10",
  returnDate: "2026-09-24",
  adults: 2,
  children: 1,
  infants: 1,
  cabin: "ECONOMY"
};

describe("parseIso8601DurationMinutes", () => {
  it("parses the shapes Duffel emits", () => {
    expect(parseIso8601DurationMinutes("PT16H35M")).toBe(995);
    expect(parseIso8601DurationMinutes("PT45M")).toBe(45);
    expect(parseIso8601DurationMinutes("PT03H")).toBe(180);
    expect(parseIso8601DurationMinutes("P1DT2H30M")).toBe(1590);
    expect(parseIso8601DurationMinutes("PT00H30M")).toBe(30);
  });

  it("returns undefined rather than guessing at unparseable input", () => {
    expect(parseIso8601DurationMinutes("16h35m")).toBeUndefined();
    expect(parseIso8601DurationMinutes("")).toBeUndefined();
    expect(parseIso8601DurationMinutes("P")).toBeUndefined();
  });
});

describe("mapDuffelOffers", () => {
  const offers = mapDuffelOffers(fixture, query);

  it("returns only offers representable in the display contract", () => {
    // Fixture holds four offers: VN nonstop, EVA one-stop, a GBP-priced offer,
    // and one with a five-segment slice. The last two must be dropped.
    expect(offers).toHaveLength(2);
    cachedOffersSchema.parse(offers);
    expect(offers.every((offer) => offer.source === "DUFFEL")).toBe(true);
    expect(offers.every((offer) => offer.estimated)).toBe(true);
  });

  it("sorts by price and converts the decimal amount to minor units", () => {
    expect(offers.map((offer) => offer.priceTotalMinor)).toEqual([104_230, 128_460]);
  });

  it("never converts a non-USD offer into dollars", () => {
    // The GBP offer is 812.00, cheaper than both survivors; if it were kept it
    // would sort first and be shown as $812.
    expect(offers.some((offer) => offer.priceTotalMinor === 81_200)).toBe(false);
  });

  it("throws when every offer is priced in a foreign currency", () => {
    const allForeign = {
      data: {
        offers: [
          {
            id: "off_0000AZgFtSSCwGm3sEgVsW_2",
            total_amount: "812.00",
            total_currency: "GBP",
            slices: []
          }
        ]
      }
    };
    expect(() => mapDuffelOffers(allForeign, query)).toThrowError(/GBP/);
  });

  it("keeps airport-local wall times to the minute", () => {
    const vietnamAirlines = offers[1];
    const outbound = vietnamAirlines?.outbound.segments[0];
    expect(outbound?.departureLocal).toBe("2026-09-10T22:15");
    expect(outbound?.arrivalLocal).toBe("2026-09-12T05:50");
    expect(outbound?.durationMinutes).toBe(995);
  });

  it("composes flight numbers and strips carrier zero padding", () => {
    expect(offers[1]?.outbound.segments[0]?.flightNumber).toBe("VN99");
    expect(offers[0]?.outbound.segments[0]?.flightNumber).toBe("BR27");
  });

  it("carries the airline's own name through, because the card headline is that name", () => {
    expect(offers[1]?.outbound.segments[0]?.marketingCarrierName).toBe("Vietnam Airlines");
    expect(offers[0]?.outbound.segments[0]?.marketingCarrierName).toBe("EVA Air");
  });

  it("leaves the name unset rather than inventing one when Duffel omits it", () => {
    // The card falls back to the IATA code; a blank airline is never rendered.
    const nameless = mapDuffelOffers(
      {
        data: {
          offers: [
            {
              id: "off_nameless",
              total_amount: "900.00",
              total_currency: "USD",
              slices: [
                {
                  duration: "PT900M",
                  segments: [
                    {
                      origin: { iata_code: "SFO" },
                      destination: { iata_code: "SGN" },
                      departing_at: "2026-09-10T22:15:00",
                      arriving_at: "2026-09-11T06:00:00",
                      duration: "PT900M",
                      marketing_carrier: { iata_code: "VN" },
                      marketing_carrier_flight_number: "99"
                    }
                  ]
                },
                {
                  duration: "PT900M",
                  segments: [
                    {
                      origin: { iata_code: "SGN" },
                      destination: { iata_code: "SFO" },
                      departing_at: "2026-09-24T10:00:00",
                      arriving_at: "2026-09-24T18:00:00",
                      duration: "PT900M",
                      marketing_carrier: { iata_code: "VN" },
                      marketing_carrier_flight_number: "98"
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      query
    );

    expect(nameless[0]?.outbound.segments[0]?.marketingCarrierName).toBeUndefined();
    expect(nameless[0]?.outbound.segments[0]?.marketingCarrier).toBe("VN");
  });

  it("falls back to the marketing carrier when the operating carrier is null", () => {
    const connecting = offers[0]?.outbound.segments[1];
    expect(connecting?.marketingCarrier).toBe("BR");
    expect(connecting?.operatingCarrier).toBe("BR");
  });

  it("derives a slice duration from segments and layovers when Duffel omits it", () => {
    // Inbound slice has duration: null. 3h25m + 11h20m flying, plus a 4h50m
    // layover at TPE, both sides of which are wall times in the same zone.
    expect(offers[0]?.inbound?.durationMinutes).toBe(1_175);
    expect(offers[0]?.outbound.durationMinutes).toBe(1_300);
  });

  it("rejects a payload that is not a Duffel offer-request envelope", () => {
    expect(() => mapDuffelOffers({ offers: [] }, query)).toThrowError(/unrecognised/);
  });
});

describe("mapDuffelOffers grouping", () => {
  /*
   * Arrival is derived from the departure and the duration rather than fixed:
   * a longer return is a later landing, and the grouping now reads the clock
   * times to tell one trip from another.
   */
  function segment(flightNumber: string, departingAt: string, minutes: number) {
    return {
      origin: { iata_code: "SFO" },
      destination: { iata_code: "SGN" },
      departing_at: departingAt,
      arriving_at: new Date(new Date(`${departingAt}Z`).getTime() + minutes * 60_000)
        .toISOString()
        .slice(0, 19),
      duration: `PT${minutes}M`,
      marketing_carrier: { iata_code: "VN" },
      marketing_carrier_flight_number: flightNumber
    };
  }

  function offer(id: string, amount: string, outboundNumber: string, inboundMinutes: number) {
    return {
      id,
      total_amount: amount,
      total_currency: "USD",
      slices: [
        { duration: "PT900M", segments: [segment(outboundNumber, "2026-09-10T22:15:00", 900)] },
        {
          duration: `PT${inboundMinutes}M`,
          segments: [segment("99", "2026-09-24T10:00:00", inboundMinutes)]
        }
      ]
    };
  }

  it("collapses same-price offers on the same outbound onto the shortest return", () => {
    const grouped = mapDuffelOffers(
      {
        data: {
          offers: [
            offer("off_group_slow", "900.00", "0099", 1_200),
            offer("off_group_fast", "900.00", "0099", 1_000),
            offer("off_group_mid", "900.00", "0099", 1_100)
          ]
        }
      },
      query
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.offerRef).toBe("off_group_fast");
    expect(grouped[0]?.alternateReturnCount).toBe(2);
  });

  /*
   * The same aircraft at the same times, sold as Lite, Classic and Flex, is one
   * flight with three price tags. The card shows none of what separates them,
   * so three rows read as a broken search; the cheapest is what the agency
   * would quote anyway.
   */
  it("keeps only the cheapest fare brand for a given trip", () => {
    const grouped = mapDuffelOffers(
      {
        data: {
          offers: [
            offer("off_brand_lite", "900.00", "0099", 1_000),
            offer("off_brand_classic", "980.00", "0099", 1_000),
            offer("off_brand_flex", "1450.00", "0099", 1_000)
          ]
        }
      },
      query
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.offerRef).toBe("off_brand_lite");
    expect(grouped[0]?.priceTotalMinor).toBe(90_000);
  });

  it("keeps a genuinely different trip, whatever it costs", () => {
    const grouped = mapDuffelOffers(
      {
        data: {
          offers: [
            offer("off_group_cheap", "900.00", "0099", 1_000),
            // A different outbound flight: a real alternative, not a fare brand.
            offer("off_group_other", "980.00", "0007", 1_000),
            // Same outbound, a later landing coming home, and dearer with it.
            offer("off_group_late", "1100.00", "0099", 1_200)
          ]
        }
      },
      query
    );

    expect(grouped.map((entry) => entry.offerRef)).toEqual([
      "off_group_cheap",
      "off_group_other",
      "off_group_late"
    ]);
    expect(grouped.every((entry) => entry.alternateReturnCount === 0)).toBe(true);
  });
});

describe("mapDuffelOffers carrier allowlist", () => {
  function slice(carrier: string, departingAt: string) {
    return {
      duration: "PT900M",
      segments: [
        {
          origin: { iata_code: "SFO" },
          destination: { iata_code: "SGN" },
          departing_at: departingAt,
          arriving_at: "2026-09-11T06:00:00",
          duration: "PT900M",
          marketing_carrier: { iata_code: carrier },
          marketing_carrier_flight_number: "0100"
        }
      ]
    };
  }

  function connectingSlice(firstCarrier: string, secondCarrier: string) {
    return {
      duration: "PT1200M",
      segments: [
        {
          origin: { iata_code: "SFO" },
          destination: { iata_code: "TPE" },
          departing_at: "2026-09-10T01:00:00",
          arriving_at: "2026-09-11T05:00:00",
          duration: "PT700M",
          marketing_carrier: { iata_code: firstCarrier },
          marketing_carrier_flight_number: "0018"
        },
        {
          origin: { iata_code: "TPE" },
          destination: { iata_code: "SGN" },
          departing_at: "2026-09-11T08:00:00",
          arriving_at: "2026-09-11T11:00:00",
          duration: "PT180M",
          marketing_carrier: { iata_code: secondCarrier },
          marketing_carrier_flight_number: "0391"
        }
      ]
    };
  }

  it("keeps only the three carriers the agency sells", () => {
    const mapped = mapDuffelOffers(
      {
        data: {
          offers: [
            {
              id: "off_vietnam",
              total_amount: "900.00",
              total_currency: "USD",
              slices: [slice("VN", "2026-09-10T22:15:00"), slice("VN", "2026-09-24T10:00:00")]
            },
            {
              id: "off_starlux",
              total_amount: "950.00",
              total_currency: "USD",
              slices: [slice("JX", "2026-09-10T22:15:00"), slice("JX", "2026-09-24T10:00:00")]
            },
            {
              id: "off_cathay",
              total_amount: "800.00",
              total_currency: "USD",
              slices: [slice("CX", "2026-09-10T22:15:00"), slice("CX", "2026-09-24T10:00:00")]
            }
          ]
        }
      },
      query
    );

    expect(mapped.map((offer) => offer.offerRef)).toEqual(["off_vietnam", "off_starlux"]);
  });

  it("drops a trip whose connection is flown by an airline the agency cannot ticket", () => {
    // The headline would read "EVA Air" while the second leg is a China Airlines
    // flight the specialist has no way to issue.
    const mapped = mapDuffelOffers(
      {
        data: {
          offers: [
            {
              id: "off_mixed",
              total_amount: "820.00",
              total_currency: "USD",
              slices: [connectingSlice("BR", "CI"), slice("BR", "2026-09-24T10:00:00")]
            }
          ]
        }
      },
      query
    );

    expect(mapped).toEqual([]);
  });

  it("does not report a currency problem when the allowlist emptied the results", () => {
    // One USD offer arrived, so USD billing is configured correctly. Throwing
    // here would send the operator hunting a Duffel setting that is already right.
    expect(() =>
      mapDuffelOffers(
        {
          data: {
            offers: [
              {
                id: "off_cathay",
                total_amount: "800.00",
                total_currency: "USD",
                slices: [slice("CX", "2026-09-10T22:15:00"), slice("CX", "2026-09-24T10:00:00")]
              },
              {
                id: "off_pounds",
                total_amount: "700.00",
                total_currency: "GBP",
                slices: [slice("VN", "2026-09-10T22:15:00"), slice("VN", "2026-09-24T10:00:00")]
              }
            ]
          }
        },
        query
      )
    ).not.toThrow();
  });
});

describe("mapDuffelOffers one way", () => {
  const oneWayQuery: FlightOffersQuery = { ...query, tripType: "ONE_WAY", returnDate: undefined };

  function oneWayOffer(id: string, amount: string, flightNumber: string) {
    return {
      id,
      total_amount: amount,
      total_currency: "USD",
      slices: [
        {
          duration: "PT900M",
          segments: [
            {
              origin: { iata_code: "SFO" },
              destination: { iata_code: "SGN" },
              departing_at: "2026-09-10T22:15:00",
              arriving_at: "2026-09-11T06:00:00",
              duration: "PT900M",
              marketing_carrier: { iata_code: "VN" },
              marketing_carrier_flight_number: flightNumber
            }
          ]
        }
      ]
    };
  }

  it("maps a single-slice offer with no return itinerary", () => {
    const mapped = mapDuffelOffers(
      { data: { offers: [oneWayOffer("off_one_way", "600.00", "0099")] } },
      oneWayQuery
    );

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.inbound).toBeUndefined();
    cachedOffersSchema.parse(mapped);
  });

  it("ignores round trips when a one way was asked for, and the reverse", () => {
    const roundTrip = {
      id: "off_round",
      total_amount: "900.00",
      total_currency: "USD",
      slices: [
        oneWayOffer("x", "900.00", "0099").slices[0],
        oneWayOffer("x", "900.00", "0100").slices[0]
      ]
    };

    expect(mapDuffelOffers({ data: { offers: [roundTrip] } }, oneWayQuery)).toEqual([]);
    expect(
      mapDuffelOffers({ data: { offers: [oneWayOffer("off_one_way", "600.00", "0099")] } }, query)
    ).toEqual([]);
  });

  it("does not claim alternate return times on same-price one ways", () => {
    // Two one ways at the same price on the same flight differ only in fare
    // brand; "1 other return time" would be a plain lie on a trip with no return.
    const mapped = mapDuffelOffers(
      {
        data: {
          offers: [
            oneWayOffer("off_brand_a", "600.00", "0099"),
            oneWayOffer("off_brand_b", "600.00", "0099")
          ]
        }
      },
      oneWayQuery
    );

    expect(mapped.every((offer) => (offer.alternateReturnCount ?? 0) === 0)).toBe(true);
  });
});

describe("buildDuffelOfferRequestBody", () => {
  it("sends a two-slice round trip with one passenger entry per traveller", () => {
    const body = buildDuffelOfferRequestBody(query);
    expect(body.data.slices).toEqual([
      { origin: "SFO", destination: "SGN", departure_date: "2026-09-10" },
      { origin: "SGN", destination: "SFO", departure_date: "2026-09-24" }
    ]);
    expect(body.data.passengers).toEqual([
      { type: "adult" },
      { type: "adult" },
      { type: "child" },
      { type: "infant_without_seat" }
    ]);
    expect(body.data.cabin_class).toBe("economy");
    expect(body.data.max_connections).toBe(1);
  });

  it("sends a single slice for a one way, so no return is ever priced", () => {
    const body = buildDuffelOfferRequestBody({
      ...query,
      tripType: "ONE_WAY",
      returnDate: undefined
    });
    expect(body.data.slices).toEqual([
      { origin: "SFO", destination: "SGN", departure_date: "2026-09-10" }
    ]);
  });

  /*
   * The origin now arrives with the query rather than being a constant, so both
   * slices have to follow it: a Los Angeles search that returns to SFO would
   * quote a trip nobody asked for.
   */
  it("flies out of and back into the origin the query asked for", () => {
    const body = buildDuffelOfferRequestBody({ ...query, origin: "LAX" });
    expect(body.data.slices).toEqual([
      { origin: "LAX", destination: "SGN", departure_date: "2026-09-10" },
      { origin: "SGN", destination: "LAX", departure_date: "2026-09-24" }
    ]);
  });

  it("maps every cabin in the display contract", () => {
    expect(
      buildDuffelOfferRequestBody({ ...query, cabin: "PREMIUM_ECONOMY" }).data.cabin_class
    ).toBe("premium_economy");
    expect(buildDuffelOfferRequestBody({ ...query, cabin: "BUSINESS" }).data.cabin_class).toBe(
      "business"
    );
  });
});
