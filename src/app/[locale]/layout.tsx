import { NextIntlClientProvider, hasLocale } from "next-intl";
import type { Metadata } from "next";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteFooter } from "@/components/shared/site-footer";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const nav = await getTranslations("Nav");
  const footer = await getTranslations("Footer");

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider messages={messages}>
          <a
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
            href="#main-content"
          >
            {nav("skip")}
          </a>
          <SiteHeader
            locale={locale}
            labels={{
              home: nav("home"),
              flights: nav("flights"),
              searchCta: nav("searchCta"),
              reviews: nav("reviews"),
              language: nav("language"),
              menu: nav("menu"),
              support: nav("support")
            }}
          />
          {children}
          <SiteFooter
            labels={{
              specialistLine: footer("specialistLine"),
              tagline: footer("tagline"),
              privacy: footer("privacy"),
              terms: footer("terms"),
              disclaimer: footer("disclaimer"),
              navigation: footer("navigation"),
              reviews: footer("reviews")
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
