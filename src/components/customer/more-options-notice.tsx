"use client";

import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { COMPANY } from "@/shared/company";

/*
 * The search only returns what the airlines publish. Group fares and the
 * agency's own business-class contracts are quoted by hand, so anywhere a
 * customer is looking at prices we say so rather than letting a list of
 * economy seats imply that is everything on offer.
 *
 * A band across the page rather than a card in a column: it belongs to the
 * page, not to whatever section it happens to sit beside, and it reads at a
 * glance on the way past instead of waiting at the bottom to be found.
 */
export function MoreOptionsNotice() {
  const t = useTranslations("Flights");
  return (
    <aside className="border-y border-[var(--line)] bg-[var(--brand-soft)]">
      <div className="shell flex flex-wrap items-center justify-between gap-x-10 gap-y-3 py-4 sm:py-5">
        <p className="max-w-3xl text-sm font-semibold leading-6 sm:text-[0.95rem]">
          {t("moreOptionsBody")}
        </p>
        {/* The number is the whole point of the band, so it is a tap target and
            not a phrase inside a sentence. */}
        <a
          className="inline-flex items-center gap-2 whitespace-nowrap text-base font-bold tabular-nums text-[color:var(--brand-dark)]"
          href={COMPANY.phone.href}
        >
          <Phone aria-hidden="true" size={17} />
          {COMPANY.phone.display}
        </a>
      </div>
    </aside>
  );
}
