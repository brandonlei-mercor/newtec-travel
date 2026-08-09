/**
 * A rate limit on password guessing, held in this process's memory.
 *
 * In-memory is the honest fit for what this guards: one password, one small
 * server. It resets on deploy and does not coordinate across instances, so it
 * is a brake on automated guessing rather than a guarantee — the password's own
 * length is what actually makes guessing hopeless. Nothing here is logged or
 * persisted: the map holds a count and a timestamp, never an attempt.
 */

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

/** Bounded so a flood of distinct callers cannot grow this without limit. */
const MAX_TRACKED_CALLERS = 10_000;

type Attempts = { failures: number; firstFailureAt: number };

const attemptsByCaller = new Map<string, Attempts>();

function current(caller: string, now: number): Attempts | undefined {
  const attempts = attemptsByCaller.get(caller);
  if (!attempts) return undefined;
  if (now - attempts.firstFailureAt >= WINDOW_MS) {
    attemptsByCaller.delete(caller);
    return undefined;
  }
  return attempts;
}

/** Seconds the caller must wait, or undefined if they may try now. */
export function signInRetryAfterSeconds(caller: string, now = Date.now()): number | undefined {
  const attempts = current(caller, now);
  if (!attempts || attempts.failures < MAX_FAILURES) return undefined;
  return Math.max(1, Math.ceil((attempts.firstFailureAt + WINDOW_MS - now) / 1000));
}

export function recordFailedSignIn(caller: string, now = Date.now()): void {
  const attempts = current(caller, now);
  if (attempts) {
    attempts.failures += 1;
    return;
  }
  /*
   * Expiries are only swept when their own caller comes back, so a map that has
   * grown past the cap is cleared wholesale. Losing counts costs at most one
   * window of protection; leaking memory on a long-lived server costs the site.
   */
  if (attemptsByCaller.size >= MAX_TRACKED_CALLERS) attemptsByCaller.clear();
  attemptsByCaller.set(caller, { failures: 1, firstFailureAt: now });
}

/** A correct password ends the streak: the person at the keyboard is the owner. */
export function clearFailedSignIns(caller: string): void {
  attemptsByCaller.delete(caller);
}
