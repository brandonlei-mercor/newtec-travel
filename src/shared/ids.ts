import { randomBytes } from "node:crypto";

/** No I, O, 0 or 1: these are read back over the phone. */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createCaseReference() {
  const bytes = randomBytes(6);
  let value = "TV-";
  for (const byte of bytes) value += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return value;
}
