"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "./format";
import type { FlightOfferSlice } from "@/shared/contracts/search";

/*
 * Official airline marks, downloaded from Duffel's published asset CDN and
 * served from this origin: no third-party request at render time, so the
 * image-src content-security policy stays 'self'. Keyed by IATA code, and a
 * carrier with no file here falls back to its code rather than a blank space.
 */
const CARRIER_LOGOS: Record<string, string> = {
  VN: "/images/airlines/VN.svg",
  BR: "/images/airlines/BR.svg",
  JX: "/images/airlines/JX.svg"
};

const DAY_MS = 86_400_000;

function nightsBetween(fromIso: string, toIso: string) {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS
  );
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/*
 * A trip can mix carriers within one direction as easily as between them: SFO to
 * Saigon is often EVA as far as Taipei and Vietnam Airlines from there. Naming
 * the airlines per direction is the only way a customer can tell who they fly
 * out with and who brings them home, so both of these work on a slice rather
 * than on the whole offer.
 */
export function sliceCarriers(slice: FlightOfferSlice): string[] {
  return [...new Set(slice.segments.map((segment) => segment.marketingCarrier))];
}

export function sliceAirlineNames(slice: FlightOfferSlice): string {
  return [
    ...new Set(
      slice.segments.map((segment) => segment.marketingCarrierName ?? segment.marketingCarrier)
    )
  ].join(", ");
}

/**
 * The airline's own mark. Decorative: the name is written beside it, so
 * announcing the logo too would just repeat it to a screen reader.
 */
function AirlineLogo({ carrier }: { carrier: string }) {
  const source = CARRIER_LOGOS[carrier];
  if (!source) {
    return (
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] font-mono text-[0.6rem] font-bold text-[color:var(--brand-dark)]"
      >
        {carrier}
      </span>
    );
  }
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="h-5 w-auto shrink-0"
      height={32}
      // Static marks already sized for the web; the optimizer would only
      // rasterize them, and SVG through the optimizer needs it enabled globally.
      src={source}
      unoptimized
      width={48}
    />
  );
}

/** Every mark for one leg, so two airlines on a leg show as two logos. */
export function AirlineLogos({ carriers }: { carriers: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {carriers.map((carrier) => (
        <AirlineLogo carrier={carrier} key={carrier} />
      ))}
    </span>
  );
}

/**
 * One leg of the trip, in three lines: which direction and what day, then the
 * times that decide whether it works, then everything else in one quiet line
 * underneath. The airline is named here rather than once for the whole trip,
 * because a trip can change carrier one way and not the other.
 */
export function SliceRow({ slice, label }: { slice: FlightOfferSlice; label: string }) {
  const t = useTranslations("Flights");
  const locale = useLocale();
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  if (!first || !last) return null;
  const dayOffset = nightsBetween(
    first.departureLocal.slice(0, 10),
    last.arrivalLocal.slice(0, 10)
  );
  const viaAirports = slice.segments.slice(0, -1).map((segment) => segment.destinationAirport);

  return (
    <div className="grid gap-1.5">
      {/* Which way, and what day. The date belongs up here beside the label
          rather than buried in the small print: it is the second thing anyone
          checks after the direction. */}
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <AirlineLogos carriers={sliceCarriers(slice)} />
          <span className="eyebrow">{label}</span>
        </span>
        <span className="muted text-xs font-semibold">
          {formatDate(first.departureLocal.slice(0, 10), locale)}
        </span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span className="text-lg font-bold tracking-[-0.01em]">
          {first.departureLocal.slice(11, 16)}
        </span>
        <span className="muted font-mono text-xs">{first.originAirport}</span>
        <span aria-hidden="true" className="text-[color:var(--line-strong)]">
          →
        </span>
        <span className="text-lg font-bold tracking-[-0.01em]">
          {last.arrivalLocal.slice(11, 16)}
          {dayOffset > 0 ? <sup className="ml-0.5 text-xs font-bold">+{dayOffset}</sup> : null}
        </span>
        <span className="muted font-mono text-xs">{last.destinationAirport}</span>
      </p>
      {/* Airline, length, stops: everything that is worth knowing but not worth
          a line of its own. */}
      <p className="muted text-xs leading-5">
        {sliceAirlineNames(slice)} · {formatDuration(slice.durationMinutes)} ·{" "}
        {slice.segments.length === 1
          ? t("nonstop")
          : `${t("stops", { count: slice.segments.length - 1 })} · ${t("via", {
              airports: viaAirports.join(", ")
            })}`}
      </p>
    </div>
  );
}
