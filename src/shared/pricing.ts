/**
 * What the airline charges for the seat is not what the customer pays us. Every
 * fare on this site is quoted as a finished trip — the booking, seat selection,
 * the visa, and everything else the agency handles — so the service is part of
 * the number from the first screen rather than a line item found later on.
 *
 * Minor units throughout, like every other amount in the codebase, so the
 * arithmetic stays in integers.
 */
const SERVICE_FEE_MINOR = 20_000;

/** The price a customer is shown and quoted, from an airline total. */
export function customerTotalMinor(airlineTotalMinor: number) {
  return airlineTotalMinor + SERVICE_FEE_MINOR;
}

/**
 * Fares are always US dollars quoted to a Bay Area customer, so they read as
 * "$1,284" in both languages rather than switching to "1.284,00 US$" in
 * Vietnamese. Cents are dropped: every price on this site is an estimate, and
 * a whole dollar is the number a customer can actually compare.
 */
export function formatFare(amountMinor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
}

/** The exact amount, cents included, for the internal notification email. */
export function formatMoney(amountMinor: number, currency: string, locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
