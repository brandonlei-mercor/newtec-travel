"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Baby, CalendarDays, MapPin, Plane, Search, Ticket, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  SEARCH_CABINS,
  SEARCH_DEFAULT_ORIGIN,
  SEARCH_DESTINATIONS,
  SEARCH_HORIZON_DAYS,
  SEARCH_ORIGINS,
  type SearchCabin,
  type SearchDestination,
  type SearchOrigin
} from "@/shared/contracts/search";
import { addDaysIso, isoDate } from "@/shared/dates";

const cellClassName =
  "flex items-center gap-2.5 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--paper)] px-3.5 py-2.5 transition-colors focus-within:border-[var(--brand)] hover:border-[var(--line-strong)]";
const labelClassName = "eyebrow block";
const valueClassName =
  "w-full border-0 bg-transparent p-0 text-sm font-semibold text-[color:var(--ink)] outline-none";

/**
 * Compact Expedia-style search bar for the home hero. Submitting navigates to
 * /flights, where the same query loads results immediately.
 */
export function FlightSearchBar() {
  const t = useTranslations("Flights");
  const tInquiry = useTranslations("Inquiry");
  const router = useRouter();

  const today = useMemo(() => isoDate(new Date()), []);
  const maxDate = useMemo(() => addDaysIso(today, SEARCH_HORIZON_DAYS), [today]);

  const [origin, setOrigin] = useState<SearchOrigin>(SEARCH_DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<SearchDestination>("SGN");
  const [departureDate, setDepartureDate] = useState(() => addDaysIso(today, 30));
  const [returnDate, setReturnDate] = useState(() => addDaysIso(today, 44));
  /*
   * Who is going is part of the search, not a detail settled later: the airline
   * prices a seat per head and a lap infant differently again, so a party set
   * here is a different fare from the same party set on the results page.
   */
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabin, setCabin] = useState<SearchCabin>("ECONOMY");

  function onDepartureChange(value: string) {
    setDepartureDate(value);
    if (value && returnDate <= value) setReturnDate(addDaysIso(value, 14));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!departureDate || !returnDate || returnDate <= departureDate) return;
    const params = new URLSearchParams({
      origin,
      destination,
      departureDate,
      returnDate,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin
    });
    router.push(`/flights?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t("bar.search")}
      className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--paper)] p-3 shadow-[var(--shadow-sm)] sm:grid-cols-2"
    >
      <label className={cellClassName}>
        <Plane aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("bar.from")}</span>
          <select
            className={valueClassName}
            value={origin}
            onChange={(event) => setOrigin(event.target.value as SearchOrigin)}
          >
            {SEARCH_ORIGINS.map((code) => (
              <option key={code} value={code}>
                {t(`origins.${code}`)}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className={cellClassName}>
        <MapPin aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("bar.to")}</span>
          <select
            className={valueClassName}
            value={destination}
            onChange={(event) => setDestination(event.target.value as SearchDestination)}
          >
            {SEARCH_DESTINATIONS.map((code) => (
              <option key={code} value={code}>
                {tInquiry(`destinations.${code}`)}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className={cellClassName}>
        <CalendarDays aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("bar.depart")}</span>
          <input
            className={valueClassName}
            type="date"
            required
            min={today}
            max={maxDate}
            value={departureDate}
            onChange={(event) => onDepartureChange(event.target.value)}
          />
        </div>
      </label>

      <label className={cellClassName}>
        <CalendarDays aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("bar.return")}</span>
          <input
            className={valueClassName}
            type="date"
            required
            min={departureDate ? addDaysIso(departureDate, 1) : today}
            max={maxDate}
            value={returnDate}
            onChange={(event) => setReturnDate(event.target.value)}
          />
        </div>
      </label>

      <label className={cellClassName}>
        <Users aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("adults")}</span>
          <select
            className={valueClassName}
            value={adults}
            onChange={(event) => setAdults(Number(event.target.value))}
          >
            {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className={cellClassName}>
        <Users aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("children")}</span>
          <select
            className={valueClassName}
            value={children}
            onChange={(event) => setChildren(Number(event.target.value))}
          >
            {Array.from({ length: 9 }, (_, index) => index).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className={cellClassName}>
        <Baby aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("infants")}</span>
          <select
            className={valueClassName}
            value={infants}
            onChange={(event) => setInfants(Number(event.target.value))}
          >
            {Array.from({ length: 9 }, (_, index) => index).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </label>

      <label className={cellClassName}>
        <Ticket aria-hidden="true" className="shrink-0 text-[color:var(--brand)]" size={17} />
        <div className="min-w-0 flex-1">
          <span className={labelClassName}>{t("bar.cabin")}</span>
          <select
            className={valueClassName}
            value={cabin}
            onChange={(event) => setCabin(event.target.value as SearchCabin)}
          >
            {SEARCH_CABINS.map((value) => (
              <option key={value} value={value}>
                {t(`cabins.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </label>

      <button type="submit" className="button-primary sm:col-span-2">
        <Search aria-hidden="true" size={16} />
        {t("bar.search")}
      </button>
    </form>
  );
}
