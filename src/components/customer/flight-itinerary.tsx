"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "./format";
import type { FlightOffer, FlightOfferSlice } from "@/shared/contracts/search";

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

/** Every flight number on the trip, both directions, in order. */
export function flightNumbers(offer: FlightOffer): string[] {
  return [...offer.outbound.segments, ...(offer.inbound?.segments ?? [])].map(
    (segment) => segment.flightNumber
  );
}

/** "Vietnam Airlines", or "Vietnam Airlines + EVA Air" when the trip mixes two. */
export function airlineNames(offer: FlightOffer): string {
  const names = new Set<string>();
  for (const segment of [...offer.outbound.segments, ...(offer.inbound?.segments ?? [])]) {
    names.add(segment.marketingCarrierName ?? segment.marketingCarrier);
  }
  return [...names].join(" + ");
}

/**
 * The airline's own mark. Decorative: the name is written beside it, so
 * announcing the logo too would just repeat it to a screen reader.
 */
export function AirlineLogo({ carrier }: { carrier: string }) {
  const source = CARRIER_LOGOS[carrier];
  if (!source) {
    return (
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)] font-mono text-xs font-bold text-[color:var(--brand-dark)]"
      >
        {carrier}
      </span>
    );
  }
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="h-8 w-auto shrink-0"
      height={32}
      // Static marks already sized for the web; the optimizer would only
      // rasterize them, and SVG through the optimizer needs it enabled globally.
      src={source}
      unoptimized
      width={48}
    />
  );
}

/**
 * One leg of the trip: the times that decide whether it works, then the date,
 * length, and stops underneath. Shared so a flight reads identically in the
 * results list and again on the page where the request is sent.
 */
export function SliceRow({
  slice,
  label,
  compact
}: {
  slice: FlightOfferSlice;
  label: string;
  compact?: boolean;
}) {
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
    <div
      className={
        compact
          ? "grid gap-1"
          : "grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-5"
      }
    >
      <p className="eyebrow">{label}</p>
      <div>
        <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="font-semibold">{first.departureLocal.slice(11, 16)}</span>
          <span className="muted text-sm">{first.originAirport}</span>
          <span aria-hidden="true" className="text-[color:var(--line-strong)]">
            →
          </span>
          <span className="font-semibold">
            {last.arrivalLocal.slice(11, 16)}
            {dayOffset > 0 ? (
              <sup className="ml-0.5 text-xs font-semibold">+{dayOffset}</sup>
            ) : null}
          </span>
          <span className="muted text-sm">{last.destinationAirport}</span>
        </p>
        <p className="muted mt-0.5 text-sm leading-6">
          {formatDate(first.departureLocal.slice(0, 10), locale)} ·{" "}
          {formatDuration(slice.durationMinutes)} ·{" "}
          {slice.segments.length === 1
            ? t("nonstop")
            : `${t("stops", { count: slice.segments.length - 1 })} · ${t("via", {
                airports: viaAirports.join(", ")
              })}`}
        </p>
      </div>
    </div>
  );
}
