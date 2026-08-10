import { getTranslations, setRequestLocale } from "next-intl/server";
import { FlightCheckout } from "@/components/customer/flight-checkout";
import { MoreOptionsNotice } from "@/components/customer/more-options-notice";
import type { FlightSelection } from "@/components/customer/types";
import { redirect } from "@/i18n/navigation";
import { findSelectedOffer } from "@/modules/search/service";
import { getDatabase } from "@/server/db";
import { createFlightSearchProvider } from "@/server/integrations";
import { encodeOfferSummary } from "@/shared/offer-summary";
import {
  SEARCH_CABINS,
  SEARCH_DESTINATIONS,
  SEARCH_ORIGINS,
  type SearchCabin,
  type SearchDestination,
  type SearchOrigin,
  type SearchTripType
} from "@/shared/contracts/search";
import { ISO_DATE, first, parseCount, type SearchParams } from "@/shared/search-params";

const flightSearch = createFlightSearchProvider();

const ORIGINS = new Set<SearchOrigin>(SEARCH_ORIGINS);
const DESTINATIONS = new Set<SearchDestination>(SEARCH_DESTINATIONS);
const CABINS = new Set<SearchCabin>(SEARCH_CABINS);
/** Provider offer identifiers are opaque; only the shape is ours to enforce. */
const OFFER_REF = /^[A-Za-z0-9_-]{8,64}$/;

/** The query the offer was priced under, or undefined if anything is off. */
function parseSelection(searchParams: SearchParams) {
  const origin = first(searchParams.origin) as SearchOrigin | undefined;
  const destination = first(searchParams.destination) as SearchDestination | undefined;
  const tripType = first(searchParams.tripType) as SearchTripType | undefined;
  const cabin = first(searchParams.cabin) as SearchCabin | undefined;
  const departureDate = first(searchParams.departureDate);
  const returnDate = first(searchParams.returnDate);
  const offerRef = first(searchParams.offerRef);
  const adults = parseCount(first(searchParams.adults), 1, 9);
  const children = parseCount(first(searchParams.children), 0, 8);
  const infants = parseCount(first(searchParams.infants), 0, 8);

  if (!origin || !ORIGINS.has(origin)) return undefined;
  if (!destination || !DESTINATIONS.has(destination)) return undefined;
  if (tripType !== "ROUND_TRIP" && tripType !== "ONE_WAY") return undefined;
  if (!cabin || !CABINS.has(cabin)) return undefined;
  if (!departureDate || !ISO_DATE.test(departureDate)) return undefined;
  if (!offerRef || !OFFER_REF.test(offerRef)) return undefined;
  if (adults === undefined || children === undefined || infants === undefined) return undefined;

  /*
   * A round trip is only a round trip with a return after departure, and a one
   * way must carry none: the same pairing the search key was built from, so a
   * half-written URL can never match a cached offer by accident.
   */
  if (tripType === "ROUND_TRIP") {
    if (!returnDate || !ISO_DATE.test(returnDate) || returnDate <= departureDate) return undefined;
  } else if (returnDate !== undefined) {
    return undefined;
  }

  return {
    offerRef,
    query: {
      origin,
      destination,
      tripType,
      departureDate,
      ...(tripType === "ROUND_TRIP" ? { returnDate } : {}),
      adults,
      children,
      infants,
      cabin
    }
  };
}

export default async function RequestPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Inquiry");

  /*
   * A request exists to book a flight someone chose, so there is no version of
   * this page without one. Anything incomplete goes back to the search rather
   * than opening a blank form nobody can act on; a customer who would rather
   * just talk it through calls the number in the header.
   */
  const selected = parseSelection(await searchParams);
  if (!selected) {
    redirect({ href: "/flights", locale });
    return null;
  }

  const offer = await findSelectedOffer(
    { db: getDatabase(), flightSearch },
    selected.query,
    selected.offerRef
  );
  // Gone from the cache means the fare is old enough that re-showing it would
  // be a guess. Send them back to live prices instead of a stale number.
  if (!offer) {
    redirect({ href: "/flights", locale });
    return null;
  }

  const selection: FlightSelection = {
    offer,
    origin: selected.query.origin,
    destination: selected.query.destination,
    tripType: selected.query.tripType,
    departureDate: selected.query.departureDate,
    ...(selected.query.returnDate ? { returnDate: selected.query.returnDate } : {}),
    adults: selected.query.adults,
    children: selected.query.children,
    infants: selected.query.infants,
    cabin: selected.query.cabin,
    summary: encodeOfferSummary(offer, selected.query.cabin),
    searchQuery: new URLSearchParams({
      origin: selected.query.origin,
      destination: selected.query.destination,
      tripType: selected.query.tripType,
      departureDate: selected.query.departureDate,
      ...(selected.query.returnDate ? { returnDate: selected.query.returnDate } : {}),
      adults: String(selected.query.adults),
      children: String(selected.query.children),
      infants: String(selected.query.infants),
      cabin: selected.query.cabin
    }).toString()
  };

  return (
    <main id="main-content" className="flex-1 bg-[var(--ivory)] pb-16 sm:pb-24">
      <section className="border-b border-[var(--line)] bg-[var(--paper)]">
        <div className="shell py-10 sm:py-12">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="font-display mt-3 max-w-2xl text-3xl tracking-[-0.02em] sm:text-4xl">
            {t("title")}
          </h1>
          <p className="muted mt-3 max-w-2xl leading-7">{t("description")}</p>
        </div>
      </section>

      {/* Above the form, not beside it: someone about to send a request for one
          economy seat is exactly who should know that a group booking or a
          business class fare is a phone call away. */}
      <MoreOptionsNotice />

      <section className="shell py-10 sm:py-12">
        <FlightCheckout selection={selection} />
      </section>
    </main>
  );
}
