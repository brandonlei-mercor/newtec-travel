import { ADMIN_LOGIN_PATH, ADMIN_SESSION_PATH } from "@/shared/admin-routes";
import { env } from "@/shared/env";

/**
 * The one credential guarding /admin, which lists customer names, phone
 * numbers, and email addresses. There is no username and no user table: the
 * agency holds a single password, set in the environment, and signing in
 * exchanges it for a signed cookie so the password is not re-sent on every
 * request.
 *
 * Rotating ADMIN_PASSWORD is the revocation mechanism. The signing key is
 * derived from the password, so every outstanding session stops verifying the
 * moment it changes — which is the behaviour you want from "someone left" or
 * "the laptop is gone", and is why there is no session table to sweep.
 */

export const ADMIN_SESSION_COOKIE = "newtec_admin";

/** Long enough for a working day, short enough that a forgotten tab expires. */
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

const SESSION_VERSION = "v1";

/*
 * Web Crypto rather than node:crypto because this runs in the proxy as well as
 * in route handlers, and the proxy may execute outside the Node runtime.
 */
function digestBuffer(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await digestBuffer(value));
}

/**
 * Compares two byte strings without leaking their contents through response
 * time. Both operands are 32-byte digests, so the loop always runs the same
 * number of iterations and reveals nothing about length either.
 */
function bytesMatch(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** Whether a submitted password is the agency's, compared in constant time. */
export async function verifyAdminPassword(supplied: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(supplied), digest(env.ADMIN_PASSWORD)]);
  return bytesMatch(left, right);
}

/*
 * The password itself is never the HMAC key: a prefix keeps this derivation
 * distinct from any other use of the same secret, so a signature can only ever
 * mean "this session was issued by this server".
 */
let signingKey: Promise<CryptoKey> | undefined;

function getSigningKey(): Promise<CryptoKey> {
  signingKey ??= (async () => {
    const material = await digestBuffer(
      `newtec-admin-session-${SESSION_VERSION}|${env.ADMIN_PASSWORD}`
    );
    return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign"
    ]);
  })();
  return signingKey;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(payload: string): Promise<Uint8Array> {
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

/**
 * A session token: `v1.<expiry epoch seconds>.<signature>`.
 *
 * The expiry travels in the clear because the signature covers it — a browser
 * that edits it invalidates it. Nothing else is in the token: there is one
 * account, so there is nothing to identify.
 */
async function issueToken(nowSeconds: number): Promise<string> {
  const payload = `${SESSION_VERSION}.${nowSeconds + SESSION_LIFETIME_SECONDS}`;
  return `${payload}.${base64url(await sign(payload))}`;
}

/** Whether a cookie value is a signature this server wrote and has not expired. */
export async function isValidSessionToken(
  token: string | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expiry, signature] = parts as [string, string, string];
  if (version !== SESSION_VERSION || !/^\d{1,15}$/.test(expiry)) return false;
  /*
   * Signature first, expiry second. Checking the claim before trusting it means
   * an unsigned token is rejected as forged rather than as merely stale.
   */
  const expected = base64url(await sign(`${version}.${expiry}`));
  if (!bytesMatch(new TextEncoder().encode(signature), new TextEncoder().encode(expected))) {
    return false;
  }
  return Number(expiry) > nowSeconds;
}

/**
 * The same check against a raw Cookie header, for route handlers that hold a
 * plain Request rather than a NextRequest.
 */
export async function hasValidSessionCookie(
  cookieHeader: string | null | undefined
): Promise<boolean> {
  const prefix = `${ADMIN_SESSION_COOKIE}=`;
  const token = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return isValidSessionToken(token);
}

/*
 * Secure is conditional because `pnpm dev` serves plain http on localhost, and
 * a Secure cookie there is simply never sent — sign-in would appear to succeed
 * and then bounce straight back to the form.
 */
const cookieIsSecure = env.APP_URL.startsWith("https://");

function cookieAttributes(maxAgeSeconds: number): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
    cookieIsSecure ? "Secure" : undefined
  ]
    .filter(Boolean)
    .join("; ");
}

/** The Set-Cookie that signs in, ready for a response header. */
export async function createSessionCookie(
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  const token = await issueToken(nowSeconds);
  return `${ADMIN_SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_LIFETIME_SECONDS)}`;
}

/** The Set-Cookie that signs out. Same attributes, so the browser replaces it. */
export function clearedSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; ${cookieAttributes(0)}`;
}

/**
 * Headers every admin surface carries. no-store keeps customer contact details
 * out of shared caches and back-button restores; the robots tag keeps a leaked
 * URL out of search results.
 */
export const ADMIN_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow, noarchive"
} as const;

/**
 * True for anything under the admin surface, sign-in included. The admin pages
 * are not translated and live outside the locale segment, so this is also what
 * keeps the locale router from rewriting /admin to /en/admin.
 *
 * Exact segments only: /adminimposter is somebody else's path.
 */
export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/v1/admin/")
  );
}

/** True for the admin paths a session is required for — sign-in itself excepted. */
export function isProtectedAdminPath(pathname: string): boolean {
  if (pathname === ADMIN_LOGIN_PATH || pathname === ADMIN_SESSION_PATH) return false;
  return isAdminPath(pathname);
}
