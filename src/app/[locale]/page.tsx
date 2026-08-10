import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/shared/company";
import { FlightSearchBar } from "@/components/customer/flight-search-bar";
import { MoreOptionsNotice } from "@/components/customer/more-options-notice";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <main id="main-content" className="bg-[var(--paper)] text-[color:var(--ink)]">
      {/* One photograph carries the whole hero: the invitation and the search
          that acts on it sit straight on top of it, and nothing else. */}
      {/* 4rem of sticky header plus its hairline border: subtract both, or the
          strip at the foot of this section lands one pixel past the fold. */}
      <section className="relative isolate flex min-h-[calc(100svh-4rem-1px)] flex-col overflow-hidden">
        <Image
          alt="A beachfront resort on Bãi Kem, Phú Quốc, seen from above with swimmers in the turquoise shallows"
          className="-z-20 object-cover object-[62%_50%]"
          fill
          priority
          sizes="100vw"
          src="/images/travel/phu-quoc-bai-kem.jpg"
        />
        {/* Darkest where the words are, so the sea still reads on the right. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(9_23_43/88%),rgb(9_23_43/74%)_45%,rgb(9_23_43/34%))]"
        />
        {/* Centred in whatever is left once the strip below has taken its
            height, so both land on the first screen together. */}
        <div className="shell flex flex-1 flex-col justify-center py-8 sm:py-10">
          <div className="max-w-2xl text-white">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-white/70">
              {t("eyebrow")}
            </p>
            <h1 className="font-display mt-4 text-[clamp(2.4rem,4.4vw,3.9rem)] leading-[1.04] text-balance">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-xl leading-7 text-white/85">{t("description")}</p>
          </div>

          <div className="mt-6 max-w-3xl">
            <FlightSearchBar />
            {/* Right under the prices someone is about to go looking at, so no
                fare on this site is ever read as the seat on its own. */}
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80">{t("priceNote")}</p>
          </div>
        </div>

        {/* The last thing on the first screen rather than the first: the hero
            sells the trip, and this closes it by saying the published fares
            are not the whole catalogue. Inside the section so it rides the
            fold instead of falling a scroll below it. */}
        <MoreOptionsNotice />
      </section>

      <section className="border-b border-[var(--line)] bg-[var(--sand-soft)]">
        <div className="shell grid gap-10 py-16 sm:py-20 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16">
          <div>
            <p className="eyebrow">{t("specialistEyebrow")}</p>
            <h2 className="font-display mt-4 text-3xl leading-[1.12] tracking-[-0.02em]">
              {t("specialistTitle")}
            </h2>
            <p className="mt-6 text-sm font-bold">{COMPANY.owner.name}</p>
            <p className="muted text-sm">{COMPANY.owner.title}</p>
          </div>

          <div>
            <p className="leading-8">{t("specialistBody")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a className="button-primary" href={COMPANY.email.href}>
                {t("specialistCta")}
                <span className="break-all">{COMPANY.email.address}</span>
              </a>
              <p className="muted text-sm font-semibold">{COMPANY.locality}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative isolate flex min-h-[24rem] items-center overflow-hidden bg-[var(--ink)]">
        <Image
          alt="A panoramic view of limestone islands across Hạ Long Bay"
          className="-z-20 object-cover"
          fill
          sizes="100vw"
          src="/images/travel/halong-bay-panorama.jpg"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[rgb(16_35_63/68%)]" />
        <div className="shell py-16">
          <div className="max-w-xl text-white">
            <h2 className="font-display text-[clamp(1.9rem,3.4vw,2.8rem)] leading-[1.1]">
              {t("closingTitle")}
            </h2>
            <Link className="button-accent mt-8" href="/flights">
              {t("cta")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
