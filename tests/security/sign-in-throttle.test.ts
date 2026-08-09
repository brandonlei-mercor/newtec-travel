import { describe, expect, it } from "vitest";
import {
  clearFailedSignIns,
  recordFailedSignIn,
  signInRetryAfterSeconds
} from "@/server/sign-in-throttle";

const START = 1_800_000_000_000;
const WINDOW_MS = 15 * 60 * 1000;

/** Each test uses its own caller key, since the throttle is process-wide state. */
function caller(name: string): string {
  return `test-${name}`;
}

describe("sign-in throttle", () => {
  it("lets a caller through until they have missed ten times", () => {
    const key = caller("ten");
    for (let attempt = 0; attempt < 9; attempt += 1) {
      recordFailedSignIn(key, START);
      expect(signInRetryAfterSeconds(key, START)).toBeUndefined();
    }
    recordFailedSignIn(key, START);
    expect(signInRetryAfterSeconds(key, START)).toBeGreaterThan(0);
  });

  it("forgets the streak once the window has passed", () => {
    const key = caller("window");
    for (let attempt = 0; attempt < 10; attempt += 1) recordFailedSignIn(key, START);
    expect(signInRetryAfterSeconds(key, START + WINDOW_MS - 1)).toBeGreaterThan(0);
    expect(signInRetryAfterSeconds(key, START + WINDOW_MS)).toBeUndefined();
  });

  it("forgets the streak as soon as the right password arrives", () => {
    const key = caller("success");
    for (let attempt = 0; attempt < 10; attempt += 1) recordFailedSignIn(key, START);
    clearFailedSignIns(key);
    expect(signInRetryAfterSeconds(key, START)).toBeUndefined();
  });

  it("throttles each caller separately", () => {
    const blocked = caller("blocked");
    const other = caller("other");
    for (let attempt = 0; attempt < 10; attempt += 1) recordFailedSignIn(blocked, START);
    expect(signInRetryAfterSeconds(blocked, START)).toBeGreaterThan(0);
    expect(signInRetryAfterSeconds(other, START)).toBeUndefined();
  });
});
