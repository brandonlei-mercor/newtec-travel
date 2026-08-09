import { getTranslations, setRequestLocale } from "next-intl/server";
import { FlightSearch, type FlightSearchInitialValues } from "@/components/customer/flight-search";
import { MoreOptionsNotice } from "@/components/customer/more-options-notice";
import {
  SEARCH_DESTINATIONS,
  SEARCH_HORIZON_DAYS,
  SEARCH_ORIGINS,
  searchCabinSchema,
  searchTripTypeSchema,
  type SearchDestination,
  type SearchOrigin
} from "@/shared/contracts/search";
import { addDaysIso, currentPacificDate } from "@/shared/dates";
import { ISO_DATE, first, parseCount, type SearchParams } from "@/shared/search-params";

/** Whitelist-sanitizes search-bar params; anything invalid is dropped. */
function parseInitialValues(searchParams: SearchParams): FlightSearchInitialValues {
  const values: FlightSearchInitialValues = {};
  const today = currentPacificDate(new Date());
  const horizonEnd = addDaysIso(today, SEARCH_HORIZON_DAYS);

  const origin = first(searchParams.origin) as SearchOrigin | undefined;
  if (origin && SEARCH_ORIGINS.includes(origin)) values.origin = origin;

  const destination = first(searchParams.destination) as SearchDestination | undefined;
  if (destination && SEARCH_DESTINATIONS.includes(destination)) values.destination = destination;

  const tripType = searchTripTypeSchema.safeParse(first(searchParams.tripType));
  if (tripType.success) values.tripType = tripType.data;

  const departureDate = first(searchParams.departureDate);
  if (
    departureDate &&
    ISO_DATE.test(departureDate) &&
    departureDate >= today &&
    departureDate <= horizonEnd
  ) {
    values.departureDate = departureDate;
  }
  // A one-way search has no return leg, so a stray param is dropped rather
  // than restored into a form that cannot show it.
  const returnDate = values.tripType === "ONE_WAY" ? undefined : first(searchParams.returnDate);
  if (
    returnDate &&
    values.departureDate &&
    ISO_DATE.test(returnDate) &&
    returnDate > values.departureDate
  ) {
    values.returnDate = returnDate;
  }

  const cabin = searchCabinSchema.safeParse(first(searchParams.cabin));
  if (cabin.success) values.cabin = cabin.data;

  const adults = parseCount(first(searchParams.adults), 1, 9);
  if (adults !== undefined) values.adults = adults;
  const children = parseCount(first(searchParams.children), 0, 8);
  if (children !== undefined) values.children = children;
  const infants = parseCount(first(searchParams.infants), 0, 8);
  if (infants !== undefined) values.infants = infants;

  return values;
}

export default async function FlightsPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Flights");
  const initialValues = parseInitialValues(await searchParams);

  return (
    <main id="main-content" className="flex-1 bg-[var(--ivory)] pb-16 sm:pb-24">
      {/* Compact and photo-free on purpose: the search form is the reason for
          this page and must stay above the fold on a laptop. */}
      <section className="border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="shell py-10 sm:py-12">
          <h1 className="font-display max-w-2xl text-3xl tracking-[-0.02em] sm:text-4xl">
            {t("title")}
          </h1>
          <p className="muted mt-3 max-w-2xl leading-7">{t("description")}</p>
        </div>
      </section>

      {/* Above the results, where someone still deciding whether this list has
          what they need can see that it is not everything the agency sells. */}
      <MoreOptionsNotice />

      <section className="shell py-8 sm:py-10">
        <FlightSearch initialValues={initialValues} />
      </section>
    </main>
  );
}
