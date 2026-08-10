"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { COMPANY } from "@/shared/company";

export function LegalPage({ kind }: { kind: "privacy" | "terms" | "accessibility" }) {
  const t = useTranslations(`Legal.${kind}`);
  const common = useTranslations("Legal.common");

  return (
    <main id="main-content" className="flex-1 bg-[var(--paper)]">
      <div className="shell max-w-3xl py-16 sm:py-20">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="font-display mt-4 text-3xl tracking-[-0.02em] sm:text-4xl">{t("title")}</h1>
        <p className="muted mt-4 leading-7">{t("intro")}</p>

        <div className="mt-10 border-t border-[var(--line)]">
          {[1, 2, 3].map((section) => (
            <section className="border-b border-[var(--line)] py-8" key={section}>
              <h2 className="text-lg font-bold tracking-[-0.01em]">
                {t(`section${section}Title`)}
              </h2>
              <p className="muted mt-3 leading-7">{t(`section${section}Body`)}</p>
            </section>
          ))}
        </div>

        {/* A policy page that ends with a wall of text and no way to reply reads
            as boilerplate. Every one of these pages tells the customer to ask,
            so the ask is right here rather than a scroll away in the footer. */}
        <section className="mt-10 rounded-[var(--radius-card)] border border-[var(--line)] bg-white p-6 sm:p-8">
          <h2 className="text-lg font-bold tracking-[-0.01em]">{common("contactTitle")}</h2>
          <p className="muted mt-3 leading-7">{common("contactBody")}</p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold">
            <a
              className="inline-flex items-center gap-2 break-all text-[color:var(--brand-dark)]"
              href={COMPANY.email.href}
            >
              <Mail aria-hidden="true" size={16} />
              {COMPANY.email.address}
            </a>
          </div>
        </section>

        <p className="muted mt-8 text-sm">{common("updated")}</p>
      </div>
    </main>
  );
}
