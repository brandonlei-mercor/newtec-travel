import { z } from "zod";
import { searchCabinSchema, type FlightOffer, type SearchCabin } from "@/shared/contracts/search";
import { customerTotalMinor, formatMoney } from "@/shared/pricing";

/*
 * The flight a customer checked out with, as it is written down and as it is
 * read back.
 *
 * The email and the agency's board both have to describe the trip the way the
 * checkout card described it — each direction with its day, its times, its
 * airline, how long it takes and where it stops. Sentences cannot be stored for
 * that: the customer may read the mail in Vietnamese, and prose written in
 * English on a Wednesday cannot be turned into Vietnamese on a Thursday. So the
 * column holds the facts and the words are made at the moment of rendering.
 *
 * Nothing here may import from next-intl or React: the worker that sends the
 * mail is a plain Node process with no request and no component tree.
 */

const localTime = z.string().regex(/^\d{2}:\d{2}$/);
const airport = z.string().regex(/^[A-Z]{3}$/);

const storedSliceSchema = z
  .object({
    /** The calendar day the direction leaves on, in the departure airport's own reckoning. */
    date: z.iso.date(),
    from: airport,
    to: airport,
    dep: localTime,
    arr: localTime,
    /** Days the arrival falls after the departure — the "+1" a red-eye earns. */
    plus: z.number().int().min(0).max(3),
    minutes: z.number().int().min(1).max(3_000),
    via: z.array(airport).max(3),
    airlines: z.array(z.string().min(1).max(60)).min(1).max(4),
    /*
     * The same airlines again as IATA codes, because a logo is filed under the
     * code and not under the name. Empty is a fine answer — a carrier whose code
     * is not the two or three characters IATA issues simply goes unillustrated,
     * and a record written before this field existed decodes without it.
     */
    carriers: z
      .array(z.string().regex(/^[A-Z0-9]{2,3}$/))
      .max(4)
      .default([])
  })
  .strict();

const storedOfferSchema = z
  .object({
    v: z.literal(1),
    cabin: searchCabinSchema,
    totalMinor: z.number().int().nonnegative(),
    currency: z.string().length(3),
    slices: z.array(storedSliceSchema).min(1).max(2)
  })
  .strict();

export type StoredOffer = z.infer<typeof storedOfferSchema>;

/**
 * The chosen flight, written down for the email and the board.
 *
 * The offer reference and the airline's own subtotal are left out on purpose: a
 * Duffel offer has expired long before anyone opens the mail, and splitting the
 * quoted price back into fare and fee only invites the question of which half
 * the customer is paying.
 */
export function encodeOfferSummary(offer: FlightOffer, cabin: SearchCabin): string {
  const slices = [offer.outbound, ...(offer.inbound ? [offer.inbound] : [])].map((slice) => {
    const first = slice.segments[0];
    const last = slice.segments[slice.segments.length - 1];
    if (!first || !last) throw new Error("OFFER_SLICE_HAS_NO_SEGMENTS");
    return {
      date: first.departureLocal.slice(0, 10),
      from: first.originAirport,
      to: last.destinationAirport,
      dep: first.departureLocal.slice(11, 16),
      arr: last.arrivalLocal.slice(11, 16),
      plus: dayOffset(first.departureLocal.slice(0, 10), last.arrivalLocal.slice(0, 10)),
      minutes: slice.durationMinutes,
      // Where the trip touches down between the two ends, which is the only
      // part of a connection a customer has any feeling about.
      via: slice.segments.slice(0, -1).map((segment) => segment.destinationAirport),
      airlines: [
        ...new Set(
          slice.segments.map((segment) => segment.marketingCarrierName ?? segment.marketingCarrier)
        )
      ],
      carriers: [...new Set(slice.segments.map((segment) => segment.marketingCarrier))].filter(
        (code) => /^[A-Z0-9]{2,3}$/.test(code)
      )
    };
  });

  return JSON.stringify({
    v: 1,
    cabin,
    totalMinor: customerTotalMinor(offer.priceTotalMinor),
    currency: offer.currency,
    slices
  } satisfies StoredOffer);
}

/**
 * The stored flight, or null if this is not one.
 *
 * The value reaches the database from the request body, so it is validated
 * rather than trusted, down to the shape of an airport code. Null is also the
 * honest answer for every request taken before this format existed, whose
 * column holds a line of English prose — the callers print those as they are.
 */
export function parseOfferSummary(stored: string): StoredOffer | null {
  if (!stored.startsWith("{")) return null;
  try {
    const parsed = storedOfferSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const DAY_MS = 86_400_000;

function dayOffset(fromIso: string, toIso: string): number {
  const days = Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS
  );
  // Clamped rather than trusted: the schema will not accept a wilder number,
  // and a trip does not arrive before it leaves.
  return Math.min(Math.max(days, 0), 3);
}

const COPY = {
  en: {
    depart: "Depart",
    return: "Return",
    nonstop: "Nonstop",
    stop: (count: number) => `${count} stop${count === 1 ? "" : "s"}`,
    via: (airports: string) => `via ${airports}`,
    duration: (hours: number, minutes: number) =>
      minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`,
    totalLabel: "Total",
    totalWord: "total",
    includes:
      "(including the flights, seats, documents, pre-arrival QR code, and everything else in between)"
  },
  vi: {
    depart: "Chiều đi",
    return: "Chiều về",
    nonstop: "Bay thẳng",
    stop: (count: number) => `${count} điểm dừng`,
    via: (airports: string) => `qua ${airports}`,
    duration: (hours: number, minutes: number) =>
      minutes === 0 ? `${hours} giờ` : `${hours} giờ ${minutes} phút`,
    totalLabel: "Trọn gói",
    totalWord: "trọn gói",
    includes: "(gồm vé máy bay, chỗ ngồi, giấy tờ, mã QR trước khi đến và mọi thứ ở giữa)"
  }
} as const;

/*
 * A travel date is a calendar day rather than an instant, so it is formatted in
 * UTC: the day a flight leaves Saigon is the same day read in California.
 */
function formatDay(iso: string, locale: "en" | "vi"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** One direction of the trip, in the words the reader's own locale uses. */
export type OfferSummarySlice = {
  /** "Depart" or "Return" — which half of the trip this is. */
  label: string;
  date: string;
  /** Both ends on one line: "01:00 SFO → 09:55+1 SGN". */
  times: string;
  /** Who flies it, how long it takes, and where it stops. */
  detail: string;
  /** IATA codes for the marks that belong beside it, in order. */
  carriers: string[];
};

export type OfferSummaryBlock = {
  cabin: string;
  slices: OfferSummarySlice[];
  totalLabel: string;
  total: string;
  includes: string;
};

/**
 * The flight broken into the pieces a layout can arrange.
 *
 * The email draws each direction as its own panel with the airline's mark
 * beside it, which a flat list of sentences cannot be pulled apart into. The
 * words are still made here, in one place, so the mail and the plain-text
 * version of it never drift into saying two different things.
 */
export function offerSummaryBlock(
  offer: StoredOffer,
  locale: "en" | "vi",
  cabinLabel: string
): OfferSummaryBlock {
  const copy = COPY[locale];
  return {
    cabin: cabinLabel,
    slices: offer.slices.map((slice, index) => {
      const arrival = slice.plus > 0 ? `${slice.arr}+${slice.plus}` : slice.arr;
      const stops =
        slice.via.length === 0
          ? copy.nonstop
          : `${copy.stop(slice.via.length)} ${copy.via(slice.via.join(", "))}`;
      return {
        label: index === 0 ? copy.depart : copy.return,
        date: formatDay(slice.date, locale),
        times: `${slice.dep} ${slice.from} → ${arrival} ${slice.to}`,
        detail: [
          slice.airlines.join(", "),
          copy.duration(Math.floor(slice.minutes / 60), slice.minutes % 60),
          stops
        ].join(" · "),
        carriers: slice.carriers
      };
    }),
    totalLabel: copy.totalLabel,
    total: formatMoney(offer.totalMinor, offer.currency),
    includes: copy.includes
  };
}

/**
 * The same flight as flat lines, for the plain-text mail and the board.
 *
 * Two lines per direction, in the checkout card's own order: when it leaves and
 * lands first, because that is what decides whether the trip works, then the
 * airline, the length and the stops underneath. The cabin leads and the price
 * closes, exactly as the card frames them.
 */
export function offerSummaryLines(
  offer: StoredOffer,
  locale: "en" | "vi",
  cabinLabel: string
): string[] {
  const block = offerSummaryBlock(offer, locale, cabinLabel);
  return [
    block.cabin,
    ...block.slices.flatMap((slice) => [
      `${slice.label} ${slice.date} — ${slice.times}`,
      slice.detail
    ]),
    `${block.total} ${COPY[locale].totalWord} ${block.includes}`
  ];
}
