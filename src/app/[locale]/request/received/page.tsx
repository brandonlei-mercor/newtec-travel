import { AtSign, CheckCircle2, Mail, MessageSquareText } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Script from "next/script";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/shared/company";

export default async function RequestReceivedPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reference?: string; method?: string }>;
}) {
  const { locale } = await params;
  const { reference, method } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Received");
  const methodLabel = method === "PHONE" ? t("methodPhone") : t("methodEmail");

  const nextSteps = [
    { icon: Mail, title: t("emailTitle"), body: t("emailBody") },
    { icon: MessageSquareText, title: t("specialistTitle"), body: t("specialistBody") }
  ];

  return (
    <main id="main-content" className="flex-1 bg-[var(--ivory)] py-16 sm:py-20">
      {/*
       * Tells Google Ads a lead arrived. The checkout only navigates here after
       * the inquiry row is written, and the reference gate keeps a bare visit to
       * the URL from counting as one. The reference itself never enters the
       * script — it is user-controlled, and this string must stay static. The
       * dataLayer shim is Google's own pattern, so the event queues even when
       * this runs before the loader in the layout.
       */}
      {reference ? (
        <Script id="lead-conversion">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('event', 'conversion', {
              'send_to': 'AW-18382365177/0iqFCIebr-ccEPnDsr1E',
              'value': 1.0,
              'currency': 'USD'
            });`}
        </Script>
      ) : null}
      <div className="shell max-w-2xl">
        <span className="grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] text-[color:var(--brand)]">
          <CheckCircle2 aria-hidden="true" size={22} strokeWidth={1.8} />
        </span>
        <p className="eyebrow mt-6">{t("eyebrow")}</p>
        <h1 className="font-display mt-3 text-3xl tracking-[-0.02em] sm:text-4xl">{t("title")}</h1>
        <p className="muted mt-4 leading-7">{t("description", { method: methodLabel })}</p>

        {reference ? (
          <p className="mt-6 inline-flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 font-mono text-sm font-semibold">
            <span className="eyebrow">{t("reference")}</span>
            {reference}
          </p>
        ) : null}

        <div className="card mt-10 p-6 sm:p-8">
          <div className="grid gap-7">
            {nextSteps.map(({ icon: Icon, title, body }) => (
              <div className="grid grid-cols-[1.5rem_1fr] gap-4" key={title}>
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 text-[color:var(--brand)]"
                  size={20}
                  strokeWidth={1.6}
                />
                <div>
                  <h2 className="text-base font-bold tracking-[-0.01em]">{title}</h2>
                  <p className="muted mt-2 text-sm leading-6">{body}</p>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-[1.5rem_1fr] gap-4 border-t border-[var(--line)] pt-7">
              <AtSign
                aria-hidden="true"
                className="mt-0.5 text-[color:var(--brand)]"
                size={20}
                strokeWidth={1.6}
              />
              <div>
                <h2 className="text-base font-bold tracking-[-0.01em]">{t("askTitle")}</h2>
                <p className="muted mt-2 text-sm leading-6">{t("askBody")}</p>
                <a
                  className="mt-2 inline-block break-all font-bold text-[color:var(--brand)]"
                  href={COMPANY.email.href}
                >
                  {COMPANY.email.address}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link href="/" className="button-secondary">
            {t("homeCta")}
          </Link>
          <p className="muted text-xs leading-5">{t("notReserved")}</p>
        </div>
      </div>
    </main>
  );
}
