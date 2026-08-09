import { Globe, Menu, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/shared/company";
import { BrandLockup } from "./brand-lockup";

type SiteHeaderProps = {
  locale: string;
  labels: {
    home: string;
    flights: string;
    searchCta: string;
    reviews: string;
    language: string;
    menu: string;
    support: string;
  };
};

const navLinkClassName =
  "rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium text-[color:var(--ink-soft)] no-underline transition-colors hover:bg-[var(--ivory)] hover:text-[color:var(--ink)]";

export function SiteHeader({ locale, labels }: SiteHeaderProps) {
  const alternateLocale = locale === "vi" ? "en" : "vi";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)] text-[color:var(--ink)]">
      <div className="shell flex h-16 items-center justify-between gap-6 lg:gap-8">
        <Link href="/" className="shrink-0 no-underline" aria-label={labels.home}>
          <BrandLockup compact stock="var(--paper)" />
        </Link>

        {/* In flow rather than absolutely centred: centring it over the whole
            header pushed the last link into the phone number on narrower
            desktops. Centring it in the space left over always leaves a gap. */}
        <nav
          aria-label={labels.menu}
          className="hidden flex-1 items-center justify-center gap-1 lg:flex"
        >
          <Link className={navLinkClassName} href="/flights">
            {labels.flights}
          </Link>
          <a
            className={navLinkClassName}
            href={COMPANY.reviewsUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {labels.reviews}
          </a>
          <a className={navLinkClassName} href={COMPANY.email.href}>
            {labels.support}
          </a>
        </nav>

        <div className="hidden shrink-0 items-center gap-4 lg:flex">
          <a
            className="hidden items-center gap-2 text-sm font-semibold tabular-nums text-[color:var(--ink)] no-underline xl:flex"
            href={COMPANY.phone.href}
          >
            <Phone aria-hidden="true" className="text-[color:var(--brand)]" size={14} />
            {COMPANY.phone.display}
          </a>
          <Link
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--line)] px-3.5 text-xs font-semibold text-[color:var(--ink-soft)] no-underline transition-colors hover:border-[var(--brand)] hover:text-[color:var(--ink)]"
            href="/"
            locale={alternateLocale}
            aria-label={labels.language}
          >
            <Globe aria-hidden="true" size={13} />
            {labels.language}
          </Link>
          {/* A request always starts from a flight, so the call to action is
              the search rather than an empty form. */}
          <Link className="button-accent min-h-10 px-5 text-[0.82rem]" href="/flights">
            {labels.searchCta}
          </Link>
        </div>

        <details className="group relative lg:hidden">
          <summary
            aria-label={labels.menu}
            className="grid size-10 cursor-pointer list-none place-items-center rounded-[var(--radius-control)] border border-[var(--line)] [&::-webkit-details-marker]:hidden"
          >
            <Menu aria-hidden="true" size={18} />
          </summary>
          <div className="absolute right-0 top-[calc(100%+10px)] w-[min(20rem,calc(100vw-28px))] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--paper)] p-3 shadow-[var(--shadow-md)]">
            <nav aria-label={labels.menu} className="grid divide-y divide-[var(--line)]">
              <Link className="px-2 py-4 text-sm font-medium no-underline" href="/flights">
                {labels.flights}
              </Link>
              <a
                className="px-2 py-4 text-sm font-medium no-underline"
                href={COMPANY.reviewsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {labels.reviews}
              </a>
              <a className="px-2 py-4 text-sm font-medium no-underline" href={COMPANY.email.href}>
                {labels.support}
              </a>
            </nav>
            <div className="mt-2 grid gap-1 border-t border-[var(--line)] pt-3 text-sm text-[color:var(--ink-soft)]">
              <a className="flex items-center gap-2 px-2 py-2" href={COMPANY.phone.href}>
                <Phone aria-hidden="true" size={14} />
                {COMPANY.phone.display}
              </a>
              <Link
                className="flex items-center gap-2 px-2 py-2 no-underline"
                href="/"
                locale={alternateLocale}
              >
                <Globe aria-hidden="true" size={14} />
                {labels.language}
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
