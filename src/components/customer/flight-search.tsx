"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "./api";
import { AirlineLogos, formatDuration, sliceAirlineNames, sliceCarriers } from "./flight-itinerary";
import { formatDate } from "./format";
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SelectControl
} from "@/components/shared/customer-ui";
import { cn } from "@/shared/utils";
import { COMPANY } from "@/shared/company";
import { customerTotalMinor, formatFare } from "@/shared/pricing";
import { addDaysIso, isoDate, daysBetweenIso } from "@/shared/dates";
import {
  SEARCH_CABINS,
  SEARCH_DEFAULT_ORIGIN,
  SEARCH_DESTINATIONS,
  SEARCH_HORIZON_DAYS,
  SEARCH_MAX_STAY_NIGHTS,
  SEARCH_ORIGINS,
  SEARCH_TRIP_TYPES,
  type FlightOffer,
  type FlightOfferSlice,
  type FlightOffersResult,
  type SearchCabin,
  type SearchDestination,
  type SearchOrigin,
  type SearchTripType
} from "@/shared/contracts/search";

/** How many stops a customer will put up with, as a filter over the results. */
type StopsFilter = "ANY" | "NONSTOP" | "MAX_ONE";
/*
 * Fifty results is a wall of near-identical rows. Show a handful at a time so
 * the cheapest options get read, and let anyone who wants more ask for it.
 */
const RESULTS_PAGE_SIZE = 5;

function addMonths(month: string, delta: number) {
  const [year = 0, monthIndex = 1] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return next.toISOString().slice(0, 7);
}

type SearchResult = { key: string; result?: FlightOffersResult; error?: boolean };

export type FlightSearchInitialValues = {
  origin?: SearchOrigin;
  destination?: SearchDestination;
  tripType?: SearchTripType;
  departureDate?: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  infants?: number;
  cabin?: SearchCabin;
};

export function FlightSearch({
  initialValues
}: {
  initialValues?: FlightSearchInitialValues;
} = {}) {
  const t = useTranslations("Flights");
  const tInquiry = useTranslations("Inquiry");
  const locale = useLocale();
  const router = useRouter();

  const today = useMemo(() => isoDate(new Date()), []);
  const maxDate = useMemo(() => addDaysIso(today, SEARCH_HORIZON_DAYS), [today]);

  const [origin, setOrigin] = useState<SearchOrigin>(
    initialValues?.origin ?? SEARCH_DEFAULT_ORIGIN
  );
  const [destination, setDestination] = useState<SearchDestination>(
    initialValues?.destination ?? "SGN"
  );
  const [tripType, setTripType] = useState<SearchTripType>(initialValues?.tripType ?? "ROUND_TRIP");
  const [adults, setAdults] = useState(initialValues?.adults ?? 1);
  const [children, setChildren] = useState(initialValues?.children ?? 0);
  const [infants, setInfants] = useState(initialValues?.infants ?? 0);
  const [cabin, setCabin] = useState<SearchCabin>(initialValues?.cabin ?? "ECONOMY");
  const [departureDate, setDepartureDate] = useState(initialValues?.departureDate ?? "");
  const [returnDate, setReturnDate] = useState(initialValues?.returnDate ?? "");
  const [visibleMonth, setVisibleMonth] = useState(() =>
    (initialValues?.departureDate ?? today).slice(0, 7)
  );
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [stopsFilter, setStopsFilter] = useState<StopsFilter>("ANY");
  const [airlineFilter, setAirlineFilter] = useState("ALL");
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);

  const oneWay = tripType === "ONE_WAY";

  const datesReady = departureDate !== "" && (oneWay || returnDate !== "");
  const searchKey = datesReady
    ? [
        origin,
        destination,
        tripType,
        departureDate,
        oneWay ? "" : returnDate,
        adults,
        children,
        infants,
        cabin,
        retryToken
      ].join("|")
    : null;

  useEffect(() => {
    if (!searchKey || !departureDate) return;
    let cancelled = false;
    const params = new URLSearchParams({
      origin,
      destination,
      tripType,
      departureDate,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin
    });
    if (!oneWay) params.set("returnDate", returnDate);
    apiRequest<FlightOffersResult>(`/api/v1/search/offers?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setSearchResult({ key: searchKey, result });
      })
      .catch(() => {
        if (!cancelled) setSearchResult({ key: searchKey, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [
    searchKey,
    origin,
    destination,
    tripType,
    oneWay,
    departureDate,
    returnDate,
    adults,
    children,
    infants,
    cabin
  ]);

  const offersStatus: "idle" | "loading" | "error" | "ready" = !searchKey
    ? "idle"
    : searchResult?.key !== searchKey
      ? "loading"
      : searchResult.error
        ? "error"
        : "ready";
  const offersResult = offersStatus === "ready" ? searchResult?.result : undefined;

  function chooseTripType(value: SearchTripType) {
    setTripType(value);
    // A stale return date would keep pricing a round trip after the switch.
    if (value === "ONE_WAY") setReturnDate("");
  }

  function onDayClick(dateIso: string) {
    if (oneWay) {
      setDepartureDate(dateIso);
      return;
    }
    if (!departureDate || returnDate || dateIso <= departureDate) {
      setDepartureDate(dateIso);
      setReturnDate("");
      return;
    }
    if (daysBetweenIso(departureDate, dateIso) > SEARCH_MAX_STAY_NIGHTS) {
      setDepartureDate(dateIso);
      setReturnDate("");
      return;
    }
    setReturnDate(dateIso);
  }

  const monthDays = useMemo(() => {
    const [year = 0, monthIndex = 1] = visibleMonth.split("-").map(Number);
    const first = new Date(Date.UTC(year, monthIndex - 1, 1));
    const count = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
    return { leadingBlanks: first.getUTCDay(), count };
  }, [visibleMonth]);

  const weekdayLabels = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    // 2023-01-01 was a Sunday; grid weeks start on Sunday.
    return Array.from({ length: 7 }, (_, index) =>
      format.format(new Date(Date.UTC(2023, 0, 1 + index)))
    );
  }, [locale]);

  const monthTitle = useMemo(() => {
    const [year = 0, monthIndex = 1] = visibleMonth.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(year, monthIndex - 1, 1)));
  }, [locale, visibleMonth]);

  /*
   * The airlines actually present in this result set, so the filter can never
   * offer a carrier that would empty the list on its own.
   */
  const airlineOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const offer of offersResult?.offers ?? []) {
      for (const segment of [...offer.outbound.segments, ...(offer.inbound?.segments ?? [])]) {
        names.set(
          segment.marketingCarrier,
          segment.marketingCarrierName ?? segment.marketingCarrier
        );
      }
    }
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [offersResult]);

  const offers = useMemo(() => {
    let list = offersResult?.offers ?? [];
    if (stopsFilter !== "ANY") {
      const limit = stopsFilter === "NONSTOP" ? 0 : 1;
      list = list.filter(
        (offer) =>
          offer.outbound.segments.length - 1 <= limit &&
          (offer.inbound ? offer.inbound.segments.length - 1 <= limit : true)
      );
    }
    if (airlineFilter !== "ALL") {
      list = list.filter((offer) =>
        [...offer.outbound.segments, ...(offer.inbound?.segments ?? [])].some(
          (segment) => segment.marketingCarrier === airlineFilter
        )
      );
    }
    return [...list].sort((a, b) =>
      sort === "price"
        ? a.priceTotalMinor - b.priceTotalMinor
        : a.outbound.durationMinutes +
          (a.inbound?.durationMinutes ?? 0) -
          (b.outbound.durationMinutes + (b.inbound?.durationMinutes ?? 0))
    );
  }, [offersResult, sort, stopsFilter, airlineFilter]);

  /*
   * Any change to what is being listed starts the reader back at the top page.
   * Adjusted during render rather than in an effect: React discards this pass
   * and re-runs it before painting, so no one sees page four of a new list.
   */
  /*
   * A carrier chosen for one search may not fly the next one, which would leave
   * an empty list and no obvious reason why. A new search starts unfiltered.
   */
  const [filteredSearchKey, setFilteredSearchKey] = useState(searchKey);
  if (filteredSearchKey !== searchKey) {
    setFilteredSearchKey(searchKey);
    setAirlineFilter("ALL");
  }

  const listKey = `${searchKey}|${sort}|${stopsFilter}|${airlineFilter}`;
  const [pagedListKey, setPagedListKey] = useState(listKey);
  if (pagedListKey !== listKey) {
    setPagedListKey(listKey);
    setVisibleCount(RESULTS_PAGE_SIZE);
  }

  const travelerCount = adults + children + infants;
  const remainingCount = Math.max(offers.length - visibleCount, 0);
  const filtersActive = stopsFilter !== "ANY" || airlineFilter !== "ALL";

  function clearFilters() {
    setStopsFilter("ANY");
    setAirlineFilter("ALL");
  }

  /*
   * Only the search and which offer was picked travel in the URL. The itinerary
   * and the price are read back from our own cache on the next page, so what the
   * agency is told is what we quoted rather than whatever an address bar claims.
   */
  function selectOffer(offer: FlightOffer) {
    const params = new URLSearchParams({
      origin,
      destination,
      tripType,
      departureDate,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin,
      offerRef: offer.offerRef
    });
    if (!oneWay) params.set("returnDate", returnDate);
    router.push(`/request?${params.toString()}`);
  }

  const previousDisabled = visibleMonth <= today.slice(0, 7);
  const nextDisabled = visibleMonth >= maxDate.slice(0, 7);

  return (
    <div className="grid gap-6">
      {/* Trip type, departure city, and destination decide what every price
          underneath means, so they run across the top as one bar. What is left —
          the party, the cabin, the dates — then fits a card the same height as
          the calendar. */}
      <section className="card flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:gap-8">
        <div className="lg:w-72 lg:shrink-0">
          <span className="eyebrow mb-2 block">{t("tripTypeLabel")}</span>
          <div
            className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-[var(--ivory)] p-1"
            role="group"
            aria-label={t("tripTypeLabel")}
          >
            {SEARCH_TRIP_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tripType === value}
                onClick={() => chooseTripType(value)}
                className={cn(
                  "min-h-9 rounded-[calc(var(--radius-control)-2px)] text-sm font-semibold transition-colors",
                  tripType === value
                    ? "bg-[var(--paper)] text-[color:var(--ink)] shadow-[var(--shadow-sm)]"
                    : "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
                )}
              >
                {t(`tripTypes.${value}`)}
              </button>
            ))}
          </div>
        </div>

        {/* A list rather than buttons: four cities already crowd the row, and
            the agency adds a departure city far more often than a Vietnam one. */}
        <div className="lg:w-56 lg:shrink-0">
          <span className="eyebrow mb-2 block">{t("originLabel")}</span>
          <SelectControl
            label={t("originLabel")}
            value={origin}
            onChange={(value) => setOrigin(value as SearchOrigin)}
          >
            {SEARCH_ORIGINS.map((code) => (
              <option key={code} value={code}>
                {t(`origins.${code}`)}
              </option>
            ))}
          </SelectControl>
        </div>

        <div className="min-w-0 flex-1">
          <span className="eyebrow mb-2 block">{t("destinationLabel")}</span>
          <div
            className="grid gap-2 sm:grid-cols-3"
            role="group"
            aria-label={t("destinationLabel")}
          >
            {SEARCH_DESTINATIONS.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={destination === code}
                onClick={() => setDestination(code)}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3.5 text-sm font-semibold transition-colors",
                  destination === code
                    ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[color:var(--brand-dark)]"
                    : "border-[var(--line)] bg-[var(--paper)] text-[color:var(--ink-soft)] hover:border-[var(--brand)]"
                )}
              >
                {tInquiry(`destinations.${code}`)}
                <span className="font-mono text-xs tracking-[0.08em]">{code}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* The remaining controls on the left, calendar on the right, both
          stretched to one height so the pair reads as a single panel. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-5">
        <section className="card flex flex-col gap-6 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Field label={t("adults")}>
              <SelectControl value={adults} onChange={(value) => setAdults(Number(value))}>
                {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectControl>
            </Field>
            <Field label={t("children")}>
              <SelectControl value={children} onChange={(value) => setChildren(Number(value))}>
                {Array.from({ length: 9 }, (_, index) => index).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectControl>
            </Field>
            <Field label={t("infants")}>
              <SelectControl value={infants} onChange={(value) => setInfants(Number(value))}>
                {Array.from({ length: 9 }, (_, index) => index).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectControl>
            </Field>
            <Field label={t("cabinLabel")}>
              <SelectControl value={cabin} onChange={(value) => setCabin(value as SearchCabin)}>
                {SEARCH_CABINS.map((value) => (
                  <option key={value} value={value}>
                    {t(`cabins.${value}`)}
                  </option>
                ))}
              </SelectControl>
            </Field>
          </div>

          <div className="mt-auto grid gap-2 border-t border-[var(--line)] pt-5 text-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="eyebrow">{t("departure")}</span>
              <span className="font-semibold">
                {departureDate ? formatDate(departureDate, locale) : "—"}
              </span>
            </p>
            {oneWay ? null : (
              <p className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">{t("return")}</span>
                <span className="font-semibold">
                  {returnDate ? formatDate(returnDate, locale) : "—"}
                </span>
              </p>
            )}
            {departureDate ? (
              <button
                type="button"
                className="mt-1 justify-self-start text-sm font-semibold text-[color:var(--brand-dark)] underline"
                onClick={() => {
                  setDepartureDate("");
                  setReturnDate("");
                }}
              >
                {t("clearDates")}
              </button>
            ) : null}
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              className="grid size-11 place-items-center rounded-[var(--radius-control)] border border-[var(--line)] transition-colors hover:border-[var(--brand)] disabled:opacity-35"
              onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
              disabled={previousDisabled}
              aria-label={t("previousMonth")}
            >
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
            <h2 className="text-lg font-bold capitalize tracking-[-0.01em]">{monthTitle}</h2>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-[var(--radius-control)] border border-[var(--line)] transition-colors hover:border-[var(--brand)] disabled:opacity-35"
              onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
              disabled={nextDisabled}
              aria-label={t("nextMonth")}
            >
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdayLabels.map((label) => (
              <span key={label} className="muted py-1 text-xs font-semibold uppercase">
                {label}
              </span>
            ))}
            {Array.from({ length: monthDays.leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {Array.from({ length: monthDays.count }, (_, index) => {
              const day = index + 1;
              const dateIso = `${visibleMonth}-${String(day).padStart(2, "0")}`;
              const disabled = dateIso < today || dateIso > maxDate;
              const isDeparture = dateIso === departureDate;
              const isReturn = dateIso === returnDate;
              const inRange =
                departureDate && returnDate && dateIso > departureDate && dateIso < returnDate;
              return (
                <button
                  key={dateIso}
                  type="button"
                  disabled={disabled}
                  onClick={() => onDayClick(dateIso)}
                  aria-pressed={isDeparture || isReturn}
                  aria-label={formatDate(dateIso, locale)}
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-transparent p-1 text-sm transition-colors",
                    disabled
                      ? "cursor-not-allowed text-[color:var(--line-strong)]"
                      : "hover:border-[var(--brand-dark)]",
                    inRange && "bg-[var(--brand-soft)]",
                    (isDeparture || isReturn) && "bg-[var(--brand)] text-white"
                  )}
                >
                  <span className="font-semibold">{day}</span>
                </button>
              );
            })}
          </div>
          <p className="muted mt-4 text-xs leading-5">
            {oneWay ? t("calendarOneWayHint") : t("calendarHint")}
          </p>
        </section>
      </div>

      <section aria-live="polite">
        {offersStatus === "idle" ? (
          <EmptyState
            title={t("pickDatesTitle")}
            description={oneWay ? t("pickDepartureBody") : t("pickDatesBody")}
          />
        ) : offersStatus === "loading" ? (
          <LoadingState label={t("loading")} />
        ) : offersStatus === "error" ? (
          <ErrorState
            title={t("errorTitle")}
            description={t("errorBody")}
            retryLabel={t("retry")}
            onRetry={() => setRetryToken((token) => token + 1)}
          />
        ) : offers.length === 0 && !filtersActive ? (
          /* Nothing to pick means nothing to request, so the way forward is a
             call rather than a form with no flight in it. */
          <EmptyState
            title={t("noOffersTitle")}
            description={t("noOffersBody")}
            action={
              <a className="button-secondary" href={COMPANY.phone.href}>
                <Phone aria-hidden="true" size={15} />
                {COMPANY.phone.display}
              </a>
            }
          />
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <h2 className="text-xl font-bold tracking-[-0.02em]">
                {t("resultsTitle")}{" "}
                <span className="muted font-medium">
                  {t("resultsCount", { count: offers.length })}
                </span>
              </h2>
              {/* Read in the same order as a row: how it flies, who flies it,
                  then what belongs at the top. */}
              <div className="flex flex-wrap items-center gap-2">
                <FilterChip
                  label={t("stopsLabel")}
                  value={stopsFilter}
                  onChange={(value) => setStopsFilter(value as StopsFilter)}
                >
                  <option value="ANY">{t("stopsAny")}</option>
                  <option value="NONSTOP">{t("nonstop")}</option>
                  <option value="MAX_ONE">{t("stopsMaxOne")}</option>
                </FilterChip>
                <FilterChip
                  label={t("airlineLabel")}
                  value={airlineFilter}
                  onChange={setAirlineFilter}
                >
                  <option value="ALL">{t("airlineAll")}</option>
                  {airlineOptions.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </FilterChip>
                <FilterChip
                  label={t("sortLabel")}
                  value={sort}
                  onChange={(value) => setSort(value as "price" | "duration")}
                >
                  <option value="price">{t("sortPrice")}</option>
                  <option value="duration">{t("sortDuration")}</option>
                </FilterChip>
              </div>
            </div>

            {/* Said once, above the list, so no one reads a price here as a bare
                airfare and finds out later what it does not cover. */}
            <p className="muted -mt-1 max-w-3xl text-sm leading-6">{t("priceIncludes")}</p>

            {offers.length === 0 ? (
              /* The dates are fine; the filters are what emptied the list, so
                 the way out is to widen them rather than to call. */
              <EmptyState
                title={t("noMatchTitle")}
                description={t("noMatchBody")}
                action={
                  <button type="button" className="button-secondary" onClick={clearFilters}>
                    {t("clearFilters")}
                  </button>
                }
              />
            ) : (
              <ul className="grid list-none gap-2 p-0">
                {offers.slice(0, visibleCount).map((offer) => (
                  <li key={offer.offerRef}>
                    <OfferRow
                      offer={offer}
                      travelerCount={travelerCount}
                      onSelect={() => selectOffer(offer)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {remainingCount > 0 ? (
              <button
                type="button"
                className="button-secondary justify-self-center"
                onClick={() => setVisibleCount((count) => count + RESULTS_PAGE_SIZE)}
              >
                {t("showMore", {
                  count: Math.min(RESULTS_PAGE_SIZE, remainingCount),
                  remaining: remainingCount
                })}
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

/** A labelled <select> that reads as a filter pill rather than a form field. */
function FilterChip({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper)] py-1 pl-3.5 pr-2 text-sm transition-colors focus-within:border-[var(--brand)] hover:border-[var(--line-strong)]">
      <span className="muted font-semibold">{label}</span>
      <select
        className="max-w-[9.5rem] cursor-pointer truncate border-0 bg-transparent p-0 text-sm font-semibold text-[color:var(--ink)] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

/**
 * One leg on a single line, the way a flight search is normally scanned: the
 * times first, then how long it takes, then what it costs you in stops.
 */
function LegLine({ slice, label }: { slice: FlightOfferSlice; label: string }) {
  const t = useTranslations("Flights");
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  if (!first || !last) return null;

  const stops = slice.segments.length - 1;
  const dayOffset = daysBetweenIso(
    first.departureLocal.slice(0, 10),
    last.arrivalLocal.slice(0, 10)
  );
  /*
   * Both sides of a connection are local to the same airport, so the difference
   * is the wait on the ground whatever the offset on the strings.
   */
  const layovers = slice.segments.slice(0, -1).map((segment, index) => {
    const next = slice.segments[index + 1];
    const minutes = next
      ? Math.round((Date.parse(next.departureLocal) - Date.parse(segment.arrivalLocal)) / 60_000)
      : NaN;
    return Number.isFinite(minutes) && minutes > 0
      ? `${formatDuration(minutes)} ${segment.destinationAirport}`
      : segment.destinationAirport;
  });

  /*
   * Centred, not baselined: the times cell carries a second line for the
   * airline, so aligning everything to the first baseline would leave the mark
   * and the direction floating above the row they belong to.
   */
  return (
    <div className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[minmax(0,7.5rem)_minmax(0,9.5rem)_minmax(0,7.5rem)_minmax(0,1fr)] sm:items-center">
      {/* Its own marks on its own row: an itinerary that flies out on one
          airline and home on another has to say so where the direction is
          written, not once for the whole trip underneath. */}
      <span className="flex items-center gap-2">
        <AirlineLogos carriers={sliceCarriers(slice)} />
        <span className="eyebrow">{label}</span>
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5 font-semibold tabular-nums">
          <span>{first.departureLocal.slice(11, 16)}</span>
          <span aria-hidden="true" className="text-[color:var(--line-strong)]">
            –
          </span>
          <span>
            {last.arrivalLocal.slice(11, 16)}
            {dayOffset > 0 ? <sup className="ml-0.5 text-[0.65rem]">+{dayOffset}</sup> : null}
          </span>
        </p>
        {/* Named as well as drawn: two marks side by side do not tell anyone
            which airline is which, and one of them may have no mark at all. */}
        <p className="muted truncate text-xs leading-5">{sliceAirlineNames(slice)}</p>
      </div>
      <p className="tabular-nums">
        <span className="font-semibold">{formatDuration(slice.durationMinutes)}</span>{" "}
        <span className="muted font-mono text-xs">
          {first.originAirport}–{last.destinationAirport}
        </span>
      </p>
      <p className="muted truncate">
        {stops === 0 ? t("nonstop") : `${t("stops", { count: stops })} · ${layovers.join(", ")}`}
      </p>
    </div>
  );
}

/**
 * One offer as a single scannable row: times, length, and stops for each leg on
 * the left, price and the way forward on the right. Everything that decides a
 * flight is on the row itself, so nothing here folds open — the full itinerary
 * waits on the request page, where the flight has actually been chosen.
 */
function OfferRow({
  offer,
  travelerCount,
  onSelect
}: {
  offer: FlightOffer;
  travelerCount: number;
  onSelect: () => void;
}) {
  const t = useTranslations("Flights");

  return (
    <article className="card overflow-hidden p-0">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div className="grid min-w-0 flex-1 gap-2">
            {/* Each direction carries its own airline now, so the line under
                them has nothing left to say but the cabin. */}
            <LegLine slice={offer.outbound} label={t("outbound")} />
            {offer.inbound ? <LegLine slice={offer.inbound} label={t("inbound")} /> : null}
            <p className="muted text-xs">
              {t(`cabins.${offer.outbound.segments[0]?.cabin ?? "ECONOMY"}`)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-[var(--line)] pt-4 lg:flex-nowrap lg:justify-end lg:border-0 lg:pt-0">
          {/* The price, then what the price covers, and only then the way
              forward. The pill belongs to the number above it, not to the
              button beside it. */}
          <div className="grid gap-1.5 lg:justify-items-end">
            <p className="lg:text-right">
              <span className="block text-xl font-bold tabular-nums tracking-[-0.02em]">
                {formatFare(customerTotalMinor(offer.priceTotalMinor))}
              </span>
              <span className="muted block text-[0.7rem] leading-4">
                {t("estimatedTotal", { travelers: travelerCount })}
              </span>
            </p>
            {/* On every row, not only once above the list: a price read on its
                own has to say what it buys, or it reads as bare airfare. */}
            <p className="flex w-fit items-center gap-1.5 rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[0.7rem] font-semibold leading-4 text-[color:var(--brand-dark)]">
              <Check aria-hidden="true" className="shrink-0" size={12} />
              {t("includedBadge")}
            </p>
          </div>
          <button
            type="button"
            className="button-primary min-h-10 shrink-0 px-4 text-[0.82rem]"
            onClick={onSelect}
          >
            {t("select")}
          </button>
        </div>
      </div>
    </article>
  );
}
