"use client";

import { Check, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SliceRow } from "./flight-itinerary";
import type { FlightSelection } from "./types";
import { customerTotalMinor, formatFare } from "@/shared/pricing";

/**
 * The flight being requested, held beside the form from the first field to the
 * last. A request only exists because of a flight someone picked, so it stays
 * on screen the whole way through rather than being something they have to
 * remember. Read-only by design: the price was quoted for exactly this trip.
 */
export function SelectedFlightCard({ selection }: { selection: FlightSelection }) {
  const t = useTranslations("Inquiry.selected");
  const flights = useTranslations("Flights");
  const { offer } = selection;
  const travelerCount = selection.adults + selection.children + selection.infants;

  return (
    <section className="card grid gap-5 p-5 sm:p-6" aria-labelledby="selected-flight-heading">
      <div className="flex items-center justify-between gap-4">
        {/* The cabin rides along with the title as a chip: it is one word, and
            it never deserved a block of its own above the itinerary. */}
        <div className="flex items-center gap-2.5">
          <h2 className="eyebrow" id="selected-flight-heading">
            {t("title")}
          </h2>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--sand-soft)] px-2 py-0.5 text-[0.7rem] font-semibold leading-4">
            {flights(`cabins.${selection.cabin}`)}
          </span>
        </div>
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--brand-dark)]"
          href={`/flights?${selection.searchQuery}`}
        >
          <PenLine aria-hidden="true" size={13} />
          {t("change")}
        </Link>
      </div>

      <div className="grid gap-5 border-y border-[var(--line)] py-5">
        <SliceRow slice={offer.outbound} label={flights("outbound")} />
        {offer.inbound ? <SliceRow slice={offer.inbound} label={flights("inbound")} /> : null}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-semibold">{t("total", { travelers: travelerCount })}</p>
          <p className="text-2xl font-bold tabular-nums tracking-[-0.02em]">
            {formatFare(customerTotalMinor(offer.priceTotalMinor))}
          </p>
        </div>
        {/* The same badge as the row this flight was picked from, so the price
            does not quietly turn back into an airfare on the way here. */}
        <p className="mt-2 flex w-fit max-w-full items-start gap-1.5 rounded-[var(--radius-control)] bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-semibold leading-5 text-[color:var(--brand-dark)]">
          <Check aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
          {flights("includedBadge")}
        </p>
        <p className="muted mt-2 text-xs leading-5">{t("estimateNote")}</p>
      </div>
    </section>
  );
}
