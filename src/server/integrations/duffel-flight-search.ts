import { z } from "zod";
import {
  offerIsShownCarrier,
  type FlightOffer,
  type FlightOfferSegment,
  type FlightOfferSlice,
  type FlightOffersQuery,
  type SearchCabin
} from "../../shared/contracts/search";
import { AppError } from "../../shared/errors";
import {
  DuffelClient,
  type DuffelCabinClass,
  type DuffelOfferRequestBody,
  type DuffelPassengerType
} from "./duffel-client";
import type { FlightSearchProvider } from "./flight-search";

const MINUTE_MS = 60_000;
const MAX_OFFERS = 50;
const MAX_SEGMENTS_PER_SLICE = 4;
const CABIN_TO_DUFFEL: Record<SearchCabin, DuffelCabinClass> = {
  ECONOMY: "economy",
  PREMIUM_ECONOMY: "premium_economy",
  BUSINESS: "business"
};

/** Duffel `first` collapses to BUSINESS: the display contract has no first class. */
const DUFFEL_TO_CABIN: Record<string, SearchCabin> = {
  economy: "ECONOMY",
  premium_economy: "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "BUSINESS"
};

const airportSchema = z.object({ iata_code: z.string() });
const carrierSchema = z.object({ iata_code: z.string(), name: z.string().nullish() });

/**
 * Plain (stripping) object schemas, not `.strict()`: this is a payload we do
 * not control and Duffel adds fields without a major version bump. Everything
 * not modelled here is dropped before it can reach the cache.
 */
const duffelSegmentSchema = z.object({
  origin: airportSchema,
  destination: airportSchema,
  departing_at: z.string(),
  arriving_at: z.string(),
  duration: z.string().nullish(),
  marketing_carrier: carrierSchema,
  marketing_carrier_flight_number: z.string(),
  operating_carrier: carrierSchema.nullish(),
  passengers: z.array(z.object({ cabin_class: z.string().nullish() })).optional()
});

const duffelSliceSchema = z.object({
  duration: z.string().nullish(),
  segments: z.array(duffelSegmentSchema).min(1)
});

const duffelOfferSchema = z.object({
  id: z.string(),
  total_amount: z.string(),
  total_currency: z.string(),
  slices: z.array(duffelSliceSchema)
});

const duffelOfferRequestResponseSchema = z.object({
  data: z.object({ offers: z.array(duffelOfferSchema).default([]) })
});

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** "PT15H40M" -> 940. Returns undefined for anything unparseable. */
export function parseIso8601DurationMinutes(value: string): number | undefined {
  const match = ISO_DURATION.exec(value);
  if (!match) return undefined;
  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return undefined;
  const total =
    Number(days ?? 0) * 1440 +
    Number(hours ?? 0) * 60 +
    Number(minutes ?? 0) +
    Number(seconds ?? 0) / 60;
  return Math.round(total);
}

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Duffel emits airport-local wall times with no zone ("2026-09-10T22:15:00"),
 * which is exactly what the display contract wants. Truncate to the minute.
 */
function toLocalDateTime(value: string): string | undefined {
  return LOCAL_DATE_TIME.test(value) ? value.slice(0, 16) : undefined;
}

function localMinutes(value: string): number {
  return Date.parse(`${value}:00Z`) / MINUTE_MS;
}

/** "0099" -> "99"; airlines display VN99, not VN0099. */
function normalizeFlightNumber(value: string): string {
  const trimmed = value.trim().replace(/^0+(?=\d)/, "");
  return trimmed.length > 0 ? trimmed : value.trim();
}

type DuffelSlice = z.infer<typeof duffelSliceSchema>;

function mapSlice(slice: DuffelSlice, requestedCabin: SearchCabin): FlightOfferSlice | undefined {
  if (slice.segments.length > MAX_SEGMENTS_PER_SLICE) return undefined;

  const segments: FlightOfferSegment[] = [];
  for (const segment of slice.segments) {
    const departureLocal = toLocalDateTime(segment.departing_at);
    const arrivalLocal = toLocalDateTime(segment.arriving_at);
    if (!departureLocal || !arrivalLocal) return undefined;

    const durationMinutes = segment.duration
      ? parseIso8601DurationMinutes(segment.duration)
      : undefined;
    if (durationMinutes === undefined || durationMinutes <= 0) return undefined;

    const marketingCarrier = segment.marketing_carrier.iata_code;
    const cabinClass = segment.passengers?.[0]?.cabin_class;
    // Duffel's airline names run to "Vietnam Airlines"-length; anything longer
    // is dropped rather than truncated, and the card shows the IATA code.
    const marketingCarrierName = segment.marketing_carrier.name?.trim();
    segments.push({
      originAirport: segment.origin.iata_code,
      destinationAirport: segment.destination.iata_code,
      departureLocal,
      arrivalLocal,
      durationMinutes,
      flightNumber: `${marketingCarrier}${normalizeFlightNumber(segment.marketing_carrier_flight_number)}`,
      marketingCarrier,
      ...(marketingCarrierName && marketingCarrierName.length <= 60
        ? { marketingCarrierName }
        : {}),
      operatingCarrier: segment.operating_carrier?.iata_code ?? marketingCarrier,
      cabin: (cabinClass ? DUFFEL_TO_CABIN[cabinClass] : undefined) ?? requestedCabin
    });
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return undefined;

  // Prefer Duffel's own slice duration. The fallback sums segment durations
  // plus each layover, which is only sound because both sides of a connection
  // are wall times at the same airport, so the difference needs no zone.
  let durationMinutes = slice.duration ? parseIso8601DurationMinutes(slice.duration) : undefined;
  if (durationMinutes === undefined) {
    durationMinutes = segments.reduce((total, segment) => total + segment.durationMinutes, 0);
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      if (!previous || !current) continue;
      durationMinutes += localMinutes(current.departureLocal) - localMinutes(previous.arrivalLocal);
    }
  }
  if (durationMinutes <= 0) return undefined;

  return { segments, durationMinutes };
}

/*
 * One search can return a dozen offers at the same price on the same outbound
 * flights, differing only in return time. Shown as separate rows they read as
 * noise, so keep the shortest return as the representative and count the rest.
 * Input must already be sorted by price, so the survivor is the cheapest.
 */
function groupByOutbound(offers: FlightOffer[]): FlightOffer[] {
  const byOutbound = new Map<string, FlightOffer>();
  for (const offer of offers) {
    const key = `${offer.priceTotalMinor}|${offer.outbound.segments.map((segment) => segment.flightNumber).join(">")}`;
    const held = byOutbound.get(key);
    if (!held) {
      byOutbound.set(key, { ...offer, alternateReturnCount: 0 });
      continue;
    }
    /*
     * On a one-way there is no return to differ in, so a same-price duplicate
     * of the same flight is just a second fare brand. Collapse it silently
     * rather than claiming "1 other return time at this price".
     */
    if (!offer.inbound || !held.inbound) continue;
    const alternateReturnCount = (held.alternateReturnCount ?? 0) + 1;
    const shorter = offer.inbound.durationMinutes < held.inbound.durationMinutes;
    byOutbound.set(key, { ...(shorter ? offer : held), alternateReturnCount });
  }
  return [...byOutbound.values()];
}

/**
 * Maps a raw Duffel offer-request envelope onto display-only flight offers.
 * Anything that cannot be represented faithfully is dropped rather than
 * coerced: a wrong price is worse than one fewer result.
 */
export function mapDuffelOffers(payload: unknown, query: FlightOffersQuery): FlightOffer[] {
  const parsed = duffelOfferRequestResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError("INTEGRATION_ERROR", "Duffel returned an unrecognised offer payload", 502);
  }

  const offers: FlightOffer[] = [];
  const rejectedCurrencies = new Set<string>();
  let sawUsdOffer = false;

  for (const offer of parsed.data.data.offers) {
    // Duffel prices in the organisation's billing currency. Converting here
    // would invent an exchange rate, so a non-USD offer is dropped outright.
    if (offer.total_currency !== "USD") {
      rejectedCurrencies.add(offer.total_currency);
      continue;
    }
    sawUsdOffer = true;
    const amount = Number(offer.total_amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    if (offer.id.length < 8 || offer.id.length > 64) continue;
    if (offer.slices.length !== (query.tripType === "ONE_WAY" ? 1 : 2)) continue;

    const [outboundSlice, inboundSlice] = offer.slices;
    if (!outboundSlice) continue;
    const outbound = mapSlice(outboundSlice, query.cabin);
    if (!outbound) continue;
    const inbound = inboundSlice ? mapSlice(inboundSlice, query.cabin) : undefined;
    if (inboundSlice && !inbound) continue;
    if (!offerIsShownCarrier({ outbound, inbound })) continue;

    offers.push({
      offerRef: offer.id,
      source: "DUFFEL",
      estimated: true,
      priceTotalMinor: Math.round(amount * 100),
      currency: "USD",
      outbound,
      ...(inbound ? { inbound } : {})
    });
  }

  // Only a response with no USD offer at all is a misconfiguration. An empty
  // result after the carrier filter is a normal, correct outcome.
  if (!sawUsdOffer && rejectedCurrencies.size > 0) {
    // A whole response in one non-USD currency is a misconfigured Duffel
    // organisation, not an empty market. Fail loudly at setup time.
    throw new AppError(
      "INTEGRATION_ERROR",
      `Duffel is pricing in ${[...rejectedCurrencies].join(", ")}; set the Duffel organisation billing currency to USD`,
      502
    );
  }

  return groupByOutbound(offers.sort((a, b) => a.priceTotalMinor - b.priceTotalMinor)).slice(
    0,
    MAX_OFFERS
  );
}

function buildPassengers(query: FlightOffersQuery): Array<{ type: DuffelPassengerType }> {
  const passengers: Array<{ type: DuffelPassengerType }> = [];
  for (let index = 0; index < query.adults; index += 1) passengers.push({ type: "adult" });
  for (let index = 0; index < query.children; index += 1) passengers.push({ type: "child" });
  for (let index = 0; index < query.infants; index += 1) {
    passengers.push({ type: "infant_without_seat" });
  }
  return passengers;
}

export function buildDuffelOfferRequestBody(query: FlightOffersQuery): DuffelOfferRequestBody {
  /*
   * Both airports come from closed Zod enums the query was parsed against, so
   * even though the origin now arrives with the request rather than being a
   * constant, no user-controlled string is ever interpolated into the upstream
   * body — an unknown code is rejected at the contract, before this runs.
   */
  const outbound = {
    origin: query.origin,
    destination: query.destination,
    departure_date: query.departureDate
  };
  const inbound = query.returnDate
    ? {
        origin: query.destination,
        destination: query.origin,
        departure_date: query.returnDate
      }
    : undefined;

  return {
    data: {
      slices: inbound ? [outbound, inbound] : [outbound],
      passengers: buildPassengers(query),
      cabin_class: CABIN_TO_DUFFEL[query.cabin],
      max_connections: 1
    }
  };
}

/**
 * Live shopping through Duffel's Flights API. Search only: this app never
 * books through Duffel, so results stay `estimated: true` and a staff member
 * still ticketing in Sabre Red 360 is what makes a price real. See ADR 0002.
 */
export class DuffelFlightSearchProvider implements FlightSearchProvider {
  readonly source = "DUFFEL" as const;

  constructor(private readonly client: DuffelClient) {}

  async searchOffers(query: FlightOffersQuery): Promise<FlightOffer[]> {
    const payload = await this.client.createOfferRequest(buildDuffelOfferRequestBody(query));
    return mapDuffelOffers(payload, query);
  }
}
