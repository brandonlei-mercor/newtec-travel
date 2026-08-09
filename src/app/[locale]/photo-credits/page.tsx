import { setRequestLocale } from "next-intl/server";

/** Only the photographs actually shipped on the site, in the order they appear. */
const credits = [
  {
    title: "Ha Long Bay, sunset",
    creator: "Andrew Crump",
    license: "CC BY 2.0",
    href: "https://commons.wikimedia.org/wiki/File:Ha_Long_Bay,_sunset.jpg"
  },
  {
    title: "Halongbay panorama",
    creator: "Stephen Obermeier",
    license: "Public domain",
    href: "https://commons.wikimedia.org/wiki/File:Halongbay_panorama.jpg"
  }
] as const;

export default async function PhotoCreditsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isVietnamese = locale === "vi";

  return (
    <main id="main-content" className="flex-1 bg-[var(--paper)] text-[color:var(--ink)]">
      <div className="shell max-w-3xl py-16 sm:py-20">
        <p className="eyebrow">NEWTEC TRAVEL AND TOURS</p>
        <h1 className="font-display mt-4 text-3xl tracking-[-0.02em] sm:text-4xl">
          {isVietnamese ? "Nguồn ảnh" : "Photography credits"}
        </h1>
        <p className="muted mt-4 max-w-2xl leading-7">
          {isVietnamese
            ? "Các hình ảnh du lịch trên trang này được lưu cục bộ, đổi kích thước và nén lại để hiển thị trên web."
            : "Travel photographs on this site are stored locally, resized, and recompressed for web delivery."}
        </p>

        <ul className="mt-10 border-t border-[var(--line)] p-0">
          {credits.map((credit) => (
            <li
              className="grid list-none gap-2 border-b border-[var(--line)] py-5 sm:grid-cols-[1fr_auto] sm:items-center"
              key={credit.href}
            >
              <div>
                <h2 className="text-base font-bold tracking-[-0.01em]">{credit.title}</h2>
                <p className="muted mt-1 text-sm">{credit.creator}</p>
              </div>
              <a
                className="text-sm font-semibold text-[color:var(--brand)] underline-offset-4 hover:underline"
                href={credit.href}
                rel="noreferrer"
                target="_blank"
              >
                {credit.license}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
