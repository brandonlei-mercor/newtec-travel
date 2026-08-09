const PACIFIC_ZONE = "America/Los_Angeles";

export const DAY_MS = 86_400_000;

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute")
  };
}

/**
 * Today where the agency actually is. The server may run anywhere, but "the
 * earliest date you can fly" is a Pacific-time question.
 */
export function currentPacificDate(now = new Date()) {
  const { year, month, day } = zonedParts(now, PACIFIC_ZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/*
 * Travel dates are calendar days, never instants: a departure is "2026-09-10"
 * to everyone involved, whatever their clock says. So the helpers below work on
 * YYYY-MM-DD strings pinned to UTC midnight, where day arithmetic cannot drift
 * across a daylight-saving boundary.
 */

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(dateIso: string, days: number) {
  return isoDate(new Date(Date.parse(`${dateIso}T00:00:00Z`) + days * DAY_MS));
}

/** Whole days from one calendar date to another — nights, for a stay. */
export function daysBetweenIso(fromIso: string, toIso: string) {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS
  );
}
