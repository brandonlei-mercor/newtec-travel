/**
 * Deterministic JSON, so hashing the same request twice always agrees. Object
 * keys are emitted in sorted order and `undefined` members are dropped; arrays
 * keep their order, because order is meaningful there.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const member = source[key];
    if (member !== undefined) result[key] = canonicalize(member);
  }
  return result;
}
