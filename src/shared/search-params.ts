/**
 * Reading a query string that a browser — or anyone with a keyboard — wrote.
 * Every value here is untrusted: these helpers only narrow it to a shape, and
 * each caller still has to check the value against a closed set before it
 * reaches a search, a database row, or an email.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `?adults=2&adults=9` is one parameter, not two: the first wins. */
export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A traveler count, or undefined for anything that is not one in range. */
export function parseCount(
  value: string | undefined,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || !/^\d{1,2}$/.test(value)) return undefined;
  const count = Number(value);
  return count >= min && count <= max ? count : undefined;
}
