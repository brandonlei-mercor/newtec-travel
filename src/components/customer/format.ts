const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A travel date is a calendar day, so it is read back in UTC: "2026-09-10" is
 * September 10 to a customer in California and to one in Hanoi.
 */
export function formatDate(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  const date = ISO_DATE.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
    ...options
  }).format(date);
}
