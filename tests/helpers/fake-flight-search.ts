import {
  offerIsShownCarrier,
  type FlightOffer,
  type FlightOfferSegment,
  type FlightOffersQuery,
  type SearchCabin,
  type SearchDestination
} from "@/shared/contracts/search";
import type { FlightSearchProvider } from "@/server/integrations";

/*
 * A deterministic stand-in for Duffel. It lives under tests/ on purpose: the
 * site shows real prices or none at all, so no production code path can reach
 * fabricated fares. Tests that need stable, free, offline results use this.
 */
const MINUTE_MS = 60_000;

/** Fixed offsets are enough for synthetic schedules; DST realism is out of scope. */
const AIRPORT_OFFSET_MINUTES: Record<string, number> = {
  SFO: -420,
  SGN: 420,
  HAN: 420,
  DAD: 420,
  TPE: 480,
  ICN: 540,
  HKG: 480,
  HND: 540
};

const SEASONALITY_BY_MONTH = [1.35, 1.3, 1.0, 0.92, 0.9, 1.15, 1.2, 1.18, 0.88, 0.9, 1.05, 1.4];

const CABIN_MULTIPLIER: Record<SearchCabin, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.9,
  BUSINESS: 3.6
};

type LegTemplate = {
  from: string;
  to: string;
  carrier: string;
  flightNumber: string;
  durationMinutes: number;
  /** Scheduled connection time at `from` before this leg; jittered per search key. */
  connectionMinutesBefore?: number;
};

type OfferTemplate = {
  key: string;
  carrier: string;
  basePerAdultMinor: number;
  outboundDepartureMinutes: number;
  inboundDepartureMinutes: number;
  outbound: LegTemplate[];
  inbound: LegTemplate[];
};

const VN_OUT: LegTemplate = {
  from: "SFO",
  to: "SGN",
  carrier: "VN",
  flightNumber: "VN99",
  durationMinutes: 995
};
const VN_IN: LegTemplate = {
  from: "SGN",
  to: "SFO",
  carrier: "VN",
  flightNumber: "VN98",
  durationMinutes: 815
};
const BR_OUT: LegTemplate = {
  from: "SFO",
  to: "TPE",
  carrier: "BR",
  flightNumber: "BR27",
  durationMinutes: 835
};
const BR_IN: LegTemplate = {
  from: "TPE",
  to: "SFO",
  carrier: "BR",
  flightNumber: "BR26",
  durationMinutes: 675
};
const KE_OUT: LegTemplate = {
  from: "SFO",
  to: "ICN",
  carrier: "KE",
  flightNumber: "KE24",
  durationMinutes: 775
};
const KE_IN: LegTemplate = {
  from: "ICN",
  to: "SFO",
  carrier: "KE",
  flightNumber: "KE23",
  durationMinutes: 630
};
const CI_OUT: LegTemplate = {
  from: "SFO",
  to: "TPE",
  carrier: "CI",
  flightNumber: "CI3",
  durationMinutes: 840
};
const CI_IN: LegTemplate = {
  from: "TPE",
  to: "SFO",
  carrier: "CI",
  flightNumber: "CI4",
  durationMinutes: 660
};

const OFFER_TEMPLATES: Record<SearchDestination, OfferTemplate[]> = {
  SGN: [
    {
      key: "VN-NONSTOP",
      carrier: "VN",
      basePerAdultMinor: 115_000,
      outboundDepartureMinutes: 22 * 60 + 15,
      inboundDepartureMinutes: 19 * 60 + 50,
      outbound: [VN_OUT],
      inbound: [VN_IN]
    },
    {
      key: "BR-TPE",
      carrier: "BR",
      basePerAdultMinor: 99_000,
      outboundDepartureMinutes: 60 + 20,
      inboundDepartureMinutes: 15 * 60 + 40,
      outbound: [
        BR_OUT,
        {
          from: "TPE",
          to: "SGN",
          carrier: "BR",
          flightNumber: "BR395",
          durationMinutes: 215,
          connectionMinutesBefore: 150
        }
      ],
      inbound: [
        { from: "SGN", to: "TPE", carrier: "BR", flightNumber: "BR396", durationMinutes: 205 },
        { ...BR_IN, connectionMinutesBefore: 170 }
      ]
    },
    {
      key: "KE-ICN",
      carrier: "KE",
      basePerAdultMinor: 102_000,
      outboundDepartureMinutes: 23 * 60 + 20,
      inboundDepartureMinutes: 23 * 60 + 40,
      outbound: [
        KE_OUT,
        {
          from: "ICN",
          to: "SGN",
          carrier: "KE",
          flightNumber: "KE683",
          durationMinutes: 330,
          connectionMinutesBefore: 160
        }
      ],
      inbound: [
        { from: "SGN", to: "ICN", carrier: "KE", flightNumber: "KE684", durationMinutes: 320 },
        { ...KE_IN, connectionMinutesBefore: 140 }
      ]
    },
    {
      key: "CI-TPE",
      carrier: "CI",
      basePerAdultMinor: 96_000,
      outboundDepartureMinutes: 60 + 55,
      inboundDepartureMinutes: 8 * 60 + 10,
      outbound: [
        CI_OUT,
        {
          from: "TPE",
          to: "SGN",
          carrier: "CI",
          flightNumber: "CI781",
          durationMinutes: 220,
          connectionMinutesBefore: 135
        }
      ],
      inbound: [
        { from: "SGN", to: "TPE", carrier: "CI", flightNumber: "CI782", durationMinutes: 210 },
        { ...CI_IN, connectionMinutesBefore: 180 }
      ]
    },
    {
      key: "JL-HND",
      carrier: "JL",
      basePerAdultMinor: 108_000,
      outboundDepartureMinutes: 13 * 60 + 5,
      inboundDepartureMinutes: 8 * 60 + 35,
      outbound: [
        { from: "SFO", to: "HND", carrier: "JL", flightNumber: "JL57", durationMinutes: 660 },
        {
          from: "HND",
          to: "SGN",
          carrier: "JL",
          flightNumber: "JL79",
          durationMinutes: 375,
          connectionMinutesBefore: 190
        }
      ],
      inbound: [
        { from: "SGN", to: "HND", carrier: "JL", flightNumber: "JL70", durationMinutes: 360 },
        {
          from: "HND",
          to: "SFO",
          carrier: "JL",
          flightNumber: "JL58",
          durationMinutes: 540,
          connectionMinutesBefore: 220
        }
      ]
    }
  ],
  HAN: [
    {
      key: "VN-SGN",
      carrier: "VN",
      basePerAdultMinor: 112_000,
      outboundDepartureMinutes: 22 * 60 + 15,
      inboundDepartureMinutes: 16 * 60 + 10,
      outbound: [
        VN_OUT,
        {
          from: "SGN",
          to: "HAN",
          carrier: "VN",
          flightNumber: "VN262",
          durationMinutes: 130,
          connectionMinutesBefore: 150
        }
      ],
      inbound: [
        { from: "HAN", to: "SGN", carrier: "VN", flightNumber: "VN263", durationMinutes: 130 },
        { ...VN_IN, connectionMinutesBefore: 160 }
      ]
    },
    {
      key: "KE-ICN",
      carrier: "KE",
      basePerAdultMinor: 101_000,
      outboundDepartureMinutes: 23 * 60 + 20,
      inboundDepartureMinutes: 22 * 60 + 30,
      outbound: [
        KE_OUT,
        {
          from: "ICN",
          to: "HAN",
          carrier: "KE",
          flightNumber: "KE679",
          durationMinutes: 285,
          connectionMinutesBefore: 150
        }
      ],
      inbound: [
        { from: "HAN", to: "ICN", carrier: "KE", flightNumber: "KE680", durationMinutes: 275 },
        { ...KE_IN, connectionMinutesBefore: 150 }
      ]
    },
    {
      key: "BR-TPE",
      carrier: "BR",
      basePerAdultMinor: 97_000,
      outboundDepartureMinutes: 60 + 20,
      inboundDepartureMinutes: 12 * 60 + 30,
      outbound: [
        BR_OUT,
        {
          from: "TPE",
          to: "HAN",
          carrier: "BR",
          flightNumber: "BR397",
          durationMinutes: 195,
          connectionMinutesBefore: 140
        }
      ],
      inbound: [
        { from: "HAN", to: "TPE", carrier: "BR", flightNumber: "BR398", durationMinutes: 185 },
        { ...BR_IN, connectionMinutesBefore: 190 }
      ]
    },
    {
      key: "CX-HKG",
      carrier: "CX",
      basePerAdultMinor: 105_000,
      outboundDepartureMinutes: 23 * 60 + 35,
      inboundDepartureMinutes: 14 * 60 + 50,
      outbound: [
        { from: "SFO", to: "HKG", carrier: "CX", flightNumber: "CX873", durationMinutes: 890 },
        {
          from: "HKG",
          to: "HAN",
          carrier: "CX",
          flightNumber: "CX742",
          durationMinutes: 120,
          connectionMinutesBefore: 145
        }
      ],
      inbound: [
        { from: "HAN", to: "HKG", carrier: "CX", flightNumber: "CX743", durationMinutes: 115 },
        {
          from: "HKG",
          to: "SFO",
          carrier: "CX",
          flightNumber: "CX872",
          durationMinutes: 750,
          connectionMinutesBefore: 170
        }
      ]
    }
  ],
  DAD: [
    {
      key: "VN-SGN",
      carrier: "VN",
      basePerAdultMinor: 114_000,
      outboundDepartureMinutes: 22 * 60 + 15,
      inboundDepartureMinutes: 15 * 60 + 30,
      outbound: [
        VN_OUT,
        {
          from: "SGN",
          to: "DAD",
          carrier: "VN",
          flightNumber: "VN114",
          durationMinutes: 85,
          connectionMinutesBefore: 140
        }
      ],
      inbound: [
        { from: "DAD", to: "SGN", carrier: "VN", flightNumber: "VN115", durationMinutes: 85 },
        { ...VN_IN, connectionMinutesBefore: 150 }
      ]
    },
    {
      key: "KE-ICN",
      carrier: "KE",
      basePerAdultMinor: 103_000,
      outboundDepartureMinutes: 23 * 60 + 20,
      inboundDepartureMinutes: 22 * 60 + 50,
      outbound: [
        KE_OUT,
        {
          from: "ICN",
          to: "DAD",
          carrier: "KE",
          flightNumber: "KE461",
          durationMinutes: 280,
          connectionMinutesBefore: 170
        }
      ],
      inbound: [
        { from: "DAD", to: "ICN", carrier: "KE", flightNumber: "KE462", durationMinutes: 270 },
        { ...KE_IN, connectionMinutesBefore: 130 }
      ]
    },
    {
      key: "BR-TPE",
      carrier: "BR",
      basePerAdultMinor: 99_000,
      outboundDepartureMinutes: 60 + 20,
      inboundDepartureMinutes: 12 * 60 + 10,
      outbound: [
        BR_OUT,
        {
          from: "TPE",
          to: "DAD",
          carrier: "BR",
          flightNumber: "BR383",
          durationMinutes: 170,
          connectionMinutesBefore: 155
        }
      ],
      inbound: [
        { from: "DAD", to: "TPE", carrier: "BR", flightNumber: "BR384", durationMinutes: 165 },
        { ...BR_IN, connectionMinutesBefore: 175 }
      ]
    },
    {
      key: "CI-TPE",
      carrier: "CI",
      basePerAdultMinor: 98_000,
      outboundDepartureMinutes: 60 + 55,
      inboundDepartureMinutes: 9 * 60 + 20,
      outbound: [
        CI_OUT,
        {
          from: "TPE",
          to: "DAD",
          carrier: "CI",
          flightNumber: "CI699",
          durationMinutes: 175,
          connectionMinutesBefore: 145
        }
      ],
      inbound: [
        { from: "DAD", to: "TPE", carrier: "CI", flightNumber: "CI700", durationMinutes: 170 },
        { ...CI_IN, connectionMinutesBefore: 210 }
      ]
    }
  ]
};

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic pseudo-random value in [0, 1) derived from a string seed. */
function hashUnit(seed: string): number {
  return fnv1a(seed) / 0x1_0000_0000;
}

function wallMs(dateIso: string, minutesOfDay: number): number {
  const [year = 0, month = 1, day = 1] = dateIso.split("-").map(Number);
  return Date.UTC(year, month - 1, day) + minutesOfDay * MINUTE_MS;
}

function formatWall(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

function offsetMs(airport: string): number {
  const offset = AIRPORT_OFFSET_MINUTES[airport];
  if (offset === undefined) throw new Error(`Unknown airport in fake schedule: ${airport}`);
  return offset * MINUTE_MS;
}

function pricePerAdultMinor(
  template: OfferTemplate,
  destination: SearchDestination,
  departureDate: string,
  returnDate: string,
  cabin: SearchCabin
): number {
  const departure = new Date(`${departureDate}T00:00:00Z`);
  const seasonality = SEASONALITY_BY_MONTH[departure.getUTCMonth()] ?? 1;
  const weekday = departure.getUTCDay();
  const weekdayFactor = weekday === 5 || weekday === 6 || weekday === 0 ? 1.06 : 0.97;
  const jitter =
    0.88 + 0.24 * hashUnit(`${destination}|${departureDate}|${returnDate}|${template.key}`);
  const raw =
    template.basePerAdultMinor * seasonality * weekdayFactor * jitter * CABIN_MULTIPLIER[cabin];
  return Math.round(raw / 100) * 100;
}

function partyTotalMinor(perAdultMinor: number, query: FlightOffersQuery): number {
  const weighted = query.adults + query.children * 0.78 + query.infants * 0.12;
  return Math.round((perAdultMinor * weighted) / 100) * 100;
}

function buildSlice(
  legs: LegTemplate[],
  dateIso: string,
  firstDepartureMinutes: number,
  cabin: SearchCabin,
  seed: string
): { segments: FlightOfferSegment[]; durationMinutes: number } {
  const segments: FlightOfferSegment[] = [];
  let departureWall = wallMs(dateIso, firstDepartureMinutes);
  let firstAbsolute = 0;
  let lastAbsolute = 0;

  legs.forEach((leg, index) => {
    if (index > 0) {
      const connectionJitter = Math.floor(hashUnit(`${seed}|conn|${index}`) * 75);
      departureWall += ((leg.connectionMinutesBefore ?? 120) + connectionJitter) * MINUTE_MS;
    }
    const absoluteDeparture = departureWall - offsetMs(leg.from);
    if (index === 0) firstAbsolute = absoluteDeparture;
    const absoluteArrival = absoluteDeparture + leg.durationMinutes * MINUTE_MS;
    const arrivalWall = absoluteArrival + offsetMs(leg.to);
    segments.push({
      originAirport: leg.from,
      destinationAirport: leg.to,
      departureLocal: formatWall(departureWall),
      arrivalLocal: formatWall(arrivalWall),
      durationMinutes: leg.durationMinutes,
      flightNumber: leg.flightNumber,
      marketingCarrier: leg.carrier,
      operatingCarrier: leg.carrier,
      cabin
    });
    lastAbsolute = absoluteArrival;
    departureWall = arrivalWall;
  });

  return { segments, durationMinutes: Math.round((lastAbsolute - firstAbsolute) / MINUTE_MS) };
}

/**
 * Deterministic local stand-in for a licensed flight-search API. The same
 * query always produces the same synthetic offers; prices follow a seasonal
 * curve so the calendar looks alive. No network I/O and no randomness.
 */
export class FakeFlightSearchProvider implements FlightSearchProvider {
  readonly source = "FAKE" as const;

  async searchOffers(query: FlightOffersQuery): Promise<FlightOffer[]> {
    const returnDate = query.returnDate ?? "";
    const offers = OFFER_TEMPLATES[query.destination].map((template) => {
      const seed = `${query.destination}|${query.departureDate}|${returnDate}|${template.key}|${query.cabin}`;
      const perAdult = pricePerAdultMinor(
        template,
        query.destination,
        query.departureDate,
        returnDate,
        query.cabin
      );
      const offerRef = `fake-${fnv1a(seed).toString(16).padStart(8, "0")}${fnv1a(`${seed}|ref`)
        .toString(16)
        .padStart(8, "0")}`;
      return {
        offerRef,
        source: this.source,
        estimated: true as const,
        priceTotalMinor: partyTotalMinor(perAdult, query),
        currency: "USD" as const,
        outbound: buildSlice(
          template.outbound,
          query.departureDate,
          template.outboundDepartureMinutes,
          query.cabin,
          `${seed}|out`
        ),
        // A one-way query has no return leg to synthesize.
        ...(query.returnDate
          ? {
              inbound: buildSlice(
                template.inbound,
                query.returnDate,
                template.inboundDepartureMinutes,
                query.cabin,
                `${seed}|in`
              )
            }
          : {})
      };
    });
    // The same allowlist the live provider applies, so a test never asserts
    // against an airline the real site would have dropped.
    return offers
      .filter((offer) => offerIsShownCarrier(offer))
      .sort((a, b) => a.priceTotalMinor - b.priceTotalMinor);
  }
}
