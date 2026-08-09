import { NextIntlClientProvider, hasLocale } from "next-intl";
import type { Metadata } from "next";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/shared/site-header";
import { SiteFooter } from "@/components/shared/site-footer";
import { COMPANY } from "@/shared/company";
import { SOCIAL_PREVIEW_IMAGE } from "@/shared/social-preview";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * What a scraper reads. Open Graph tags in the two languages the site is
 * written in, so a link pasted into Messages, Slack, or Facebook shows the
 * agency's name and a photo instead of the reader's guess at both.
 */
const OPEN_GRAPH_LOCALES = { en: "en_US", vi: "vi_VN" } as const;

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  /*
   * The layout below rejects an unknown locale, but this function runs first
   * and independently, and everything it returns is written into the document
   * head. Validating here keeps an arbitrary path segment from being reflected
   * into a canonical link or an og:locale.
   */
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const title = t("title");
  const description = t("description");
  const canonicalPath = `/${locale}`;

  return {
    title,
    description,
    /* Resolves the relative paths below, and any relative preview image. */
    metadataBase: new URL(COMPANY.siteUrl),
    alternates: {
      canonical: canonicalPath,
      /*
       * The same page in the other language, so a search engine treats the two
       * as translations rather than as duplicates competing with each other.
       */
      languages: Object.fromEntries(
        routing.locales.map((available) => [available, `/${available}`])
      )
    },
    openGraph: {
      type: "website",
      siteName: COMPANY.name,
      title,
      description,
      url: canonicalPath,
      locale: OPEN_GRAPH_LOCALES[locale],
      images: [SOCIAL_PREVIEW_IMAGE]
    },
    twitter: {
      /* The wide card. Without this the same image renders as a thumbnail. */
      card: "summary_large_image",
      title,
      description,
      images: [SOCIAL_PREVIEW_IMAGE.url]
    }
  };
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
