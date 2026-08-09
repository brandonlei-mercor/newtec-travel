import { Mail, MapPin, Phone, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/shared/company";
import { BrandLockup } from "./brand-lockup";

type SiteFooterProps = {
  labels: {
    specialistLine: string;
    tagline: string;
    privacy: string;
    terms: string;
    disclaimer: string;
    navigation: string;
    reviews: string;
  };
};

export function SiteFooter({ labels }: SiteFooterProps) {
  return (
    <footer className="mt-auto border-t border-[var(--sand)] bg-[var(--sand-soft)]">
      <div className="shell grid gap-12 py-16 md:grid-cols-[1.2fr_0.9fr_auto] lg:gap-20 lg:py-20">
        <div className="max-w-md">
          <BrandLockup />
          <p className="mt-7 max-w-sm text-xl font-medium leading-snug tracking-[-0.01em] text-[color:var(--ink)]">
            {labels.tagline}
          </p>
          {/* Signed like a letter: the agency is one person, and the footer is
              where she puts her name to it. */}
          <div className="muted mt-7 text-sm leading-6">
            <p>{labels.specialistLine}</p>
            <p className="font-display mt-3 text-2xl italic leading-none text-[color:var(--brand)]">
              {COMPANY.owner.name}
            </p>
            <p className="mt-2">
              {COMPANY.owner.title}, {COMPANY.name}
            </p>
          </div>
        </div>

        <address className="grid content-start gap-4 text-sm not-italic text-[color:var(--ink-soft)]">
          <p className="eyebrow mb-1">{COMPANY.address.line2}</p>
          <a
            className="flex items-start gap-3 transition-colors hover:text-[color:var(--ink)]"
            href={COMPANY.mapsUrl}
            rel="noreferrer"
            target="_blank"
          >
            <MapPin
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[color:var(--brand)]"
              size={15}
            />
            <span>
              {COMPANY.address.line1}
              <br />
              {COMPANY.address.line2}
            </span>
          </a>
          <a
            className="flex items-center gap-3 hover:text-[color:var(--ink)]"
            href={COMPANY.phone.href}
          >
            <Phone aria-hidden="true" className="text-[color:var(--accent)]" size={15} /> Tel{" "}
            {COMPANY.phone.display}
          </a>
          <a
            className="flex items-center gap-3 hover:text-[color:var(--ink)]"
            href={COMPANY.email.href}
          >
            <Mail aria-hidden="true" className="text-[color:var(--brand)]" size={15} />
            {COMPANY.email.address}
          </a>
          <a
            className="flex items-center gap-3 hover:text-[color:var(--ink)]"
            href={COMPANY.reviewsUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Star aria-hidden="true" className="text-[color:var(--accent)]" size={15} />
            {labels.reviews}
          </a>
        </address>

        <nav aria-label={labels.navigation} className="grid content-start gap-4 text-sm">
          <p className="eyebrow mb-1">{labels.navigation}</p>
          <Link
            className="text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
            href="/privacy"
          >
            {labels.privacy}
          </Link>
          <Link
            className="text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
            href="/terms"
          >
            {labels.terms}
          </Link>
        </nav>
      </div>

      <div className="border-t border-[var(--sand)]">
        <div className="shell flex flex-col gap-3 py-6 text-xs leading-5 text-[color:var(--ink-soft)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {COMPANY.name}
          </p>
          <p className="max-w-2xl sm:text-right">{labels.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
