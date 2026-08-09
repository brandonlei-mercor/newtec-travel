import { z } from "zod";

/*
 * The US cities the agency sells out of. SFO is the home airport and stays the
 * default: it is where most of the customers are and where every carrier the
 * agency ticks serves. The other three are a closed set for the same reason
 * destinations are — an origin reaches the upstream request body, a database
 * row, and an email, and none of those should ever see a string a browser made
 * up.
 */
export const SEARCH_ORIGINS = ["SFO", "LAX", "PHX", "JFK"] as const;
export const SEARCH_DEFAULT_ORIGIN = "SFO" as const;
export const SEARCH_DESTINATIONS = ["SGN", "HAN", "DAD"] as const;
/*
 * The only carriers the agency sells on these routes. Anything else Duffel
 * returns is dropped before it reaches a result card, so a price on screen is
 * always a price a specialist can actually ticket. Coverage is uneven across
 * the origins — all three fly SFO and LAX, only JX flies PHX, only BR flies
 * JFK — so a thin result set out of Phoenix or New York is the filter working,
 * not a bug.
 */
export const SEARCH_SHOWN_CARRIERS = ["VN", "BR", "JX"] as const;
export const SEARCH_HORIZON_DAYS = 330;
export const SEARCH_MAX_STAY_NIGHTS = 60;

export const searchOriginSchema = z.enum(SEARCH_ORIGINS);
export type SearchOrigin = z.infer<typeof searchOriginSchema>;

export const searchDestinationSchema = z.enum(SEARCH_DESTINATIONS);
export type SearchDestination = z.infer<typeof searchDestinationSchema>;

/*
 * The tuples below are exported alongside their enums because the search forms
 * render their options from them. One list, so what a browser can offer and
 * what the server accepts cannot drift apart.
 */
export const SEARCH_CABINS = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"] as const;
export const searchCabinSchema = z.enum(SEARCH_CABINS);
export type SearchCabin = z.infer<typeof searchCabinSchema>;

export const searchSourceSchema = z.enum(["FAKE", "AMADEUS", "DUFFEL"]);
export type SearchSource = z.infer<typeof searchSourceSchema>;

export const SEARCH_TRIP_TYPES = ["ROUND_TRIP", "ONE_WAY"] as const;
export const searchTripTypeSchema = z.enum(SEARCH_TRIP_TYPES);
export type SearchTripType = z.infer<typeof searchTripTypeSchema>;

/** Treats a blank query-string value as absent, so `?returnDate=` is not an error. */
const optionalIsoDate = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.iso.date().optional()
);

export const flightOffersQuerySchema = z
  .object({
    /*
     * Defaulted rather than required so a link written before there was more
     * than one departure city still resolves to the trip it always meant.
     */
    origin: searchOriginSchema.default(SEARCH_DEFAULT_ORIGIN),
    destination: searchDestinationSchema,
    tripType: searchTripTypeSchema.default("ROUND_TRIP"),
    departureDate: z.iso.date(),
    returnDate: optionalIsoDate,
    adults: z.coerce.number().int().min(1).max(9).default(1),
    children: z.coerce.number().int().min(0).max(8).default(0),
    infants: z.coerce.number().int().min(0).max(8).default(0),
    cabin: searchCabinSchema.default("ECONOMY")
  })
  .strict()
  .superRefine((value, context) => {
    // A one-way search with a return date would silently price a round trip.
    if (value.tripType === "ONE_WAY") {
      if (value.returnDate !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["returnDate"],
          message: "SEARCH_ONE_WAY_HAS_NO_RETURN"
        });
      }
    } else if (value.returnDate === undefined) {
      context.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "SEARCH_RETURN_REQUIRED"
      });
    } else if (value.returnDate <= value.departureDate) {
      context.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "SEARCH_RETURN_AFTER_DEPARTURE"
      });
    } else {
      const nights =
        (Date.parse(`${value.returnDate}T00:00:00Z`) -
          Date.parse(`${value.departureDate}T00:00:00Z`)) /
        86_400_000;
      if (nights > SEARCH_MAX_STAY_NIGHTS) {
        context.addIssue({
          code: "custom",
          path: ["returnDate"],
          message: "SEARCH_MAX_STAY_EXCEEDED"
        });
      }
    }
    if (value.adults + value.children + value.infants > 9) {
      context.addIssue({
        code: "custom",
        path: ["adults"],
        message: "SEARCH_MAX_NINE_TRAVELERS"
      });
    }
    if (value.infants > value.adults) {
      context.addIssue({
        code: "custom",
        path: ["infants"],
        message: "SEARCH_INFANTS_REQUIRE_ADULTS"
      });
    }
  });

export type FlightOffersQuery = z.infer<typeof flightOffersQuerySchema>;

/** Naive airport-local wall time without zone, e.g. 2026-09-10T11:35. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "SEARCH_LOCAL_TIME");

export const flightOfferSegmentSchema = z
  .object({
    originAirport: z.string().length(3),
    destinationAirport: z.string().length(3),
    departureLocal: localDateTime,
    arrivalLocal: localDateTime,
    durationMinutes: z.number().int().positive(),
    flightNumber: z.string().min(3).max(8),
    marketingCarrier: z.string().min(2).max(3),
    /*
     * The airline's own name as Duffel reports it, so a card can say "Vietnam
     * Airlines" instead of "VN". Optional: offers cached before this field
     * existed must still parse, and the UI falls back to the IATA code.
     */
    marketingCarrierName: z.string().min(1).max(60).optional(),
    operatingCarrier: z.string().min(2).max(3),
    cabin: searchCabinSchema
  })
  .strict();

export type FlightOfferSegment = z.infer<typeof flightOfferSegmentSchema>;

export const flightOfferSliceSchema = z
  .object({
    segments: z.array(flightOfferSegmentSchema).min(1).max(4),
    durationMinutes: z.number().int().positive()
  })
  .strict();

export type FlightOfferSlice = z.infer<typeof flightOfferSliceSchema>;

export const flightOfferSchema = z
  .object({
    offerRef: z.string().min(8).max(64),
    source: searchSourceSchema,
    /** A displayed fare is always an estimate; only the specialist's Sabre price is real. */
    estimated: z.literal(true),
    priceTotalMinor: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    outbound: flightOfferSliceSchema,
    /** Absent on a one-way offer, which has no return itinerary to describe. */
    inbound: flightOfferSliceSchema.optional(),
    /*
     * How many further offers share this price and outbound itinerary, differing
     * only in return time. Optional so offers cached before grouping still parse.
     */
    alternateReturnCount: z.number().int().nonnegative().optional()
  })
  .strict();

export type FlightOffer = z.infer<typeof flightOfferSchema>;

const shownCarriers = new Set<string>(SEARCH_SHOWN_CARRIERS);

/**
 * True when every flight in the trip is sold by a carrier the agency handles.
 * A trip is rejected on any one segment: a customer who picks "EVA Air" must not
 * discover a connection is flown by an airline the agency cannot ticket.
 */
export function offerIsShownCarrier(offer: {
  outbound: FlightOfferSlice;
  inbound?: FlightOfferSlice | undefined;
}): boolean {
  return [offer.outbound, offer.inbound].every(
    (slice) =>
      slice === undefined ||
      slice.segments.every((segment) => shownCarriers.has(segment.marketingCarrier))
  );
}

export const cachedOffersSchema = z.array(flightOfferSchema).max(50);

export type FlightOffersResult = {
  query: FlightOffersQuery;
  offers: FlightOffer[];
  source: SearchSource;
  fetchedAt: string;
};
