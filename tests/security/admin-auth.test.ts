import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  clearedSessionCookie,
  createSessionCookie,
  hasValidSessionCookie,
  isAdminPath,
  isProtectedAdminPath,
  isValidSessionToken,
  verifyAdminPassword
} from "@/server/admin-auth";
import { ADMIN_LOGIN_PATH, ADMIN_SESSION_PATH } from "@/shared/admin-routes";
import { env } from "@/shared/env";

/** The token out of a Set-Cookie string, which is what a browser would send back. */
function tokenFrom(setCookie: string): string {
  return setCookie.slice(`${ADMIN_SESSION_COOKIE}=`.length).split(";")[0] ?? "";
}

const NOW_SECONDS = 1_800_000_000;

describe("admin password", () => {
  it("accepts only the configured password", async () => {
    await expect(verifyAdminPassword(env.ADMIN_PASSWORD)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong")).resolves.toBe(false);
    await expect(verifyAdminPassword("")).resolves.toBe(false);
  });

  it("treats a prefix or a suffix as wrong rather than partially right", async () => {
    await expect(verifyAdminPassword(env.ADMIN_PASSWORD.slice(0, -1))).resolves.toBe(false);
    await expect(verifyAdminPassword(`${env.ADMIN_PASSWORD}x`)).resolves.toBe(false);
  });
});

describe("admin session token", () => {
  it("accepts a token this server signed", async () => {
    const token = tokenFrom(await createSessionCookie(NOW_SECONDS));
    await expect(isValidSessionToken(token, NOW_SECONDS)).resolves.toBe(true);
  });

  it("rejects a missing, empty, or malformed token", async () => {
    for (const token of [null, undefined, "", "nonsense", "v1.123", "v1.123.abc.def"]) {
      await expect(isValidSessionToken(token, NOW_SECONDS)).resolves.toBe(false);
    }
  });

  it("rejects a token whose signature was edited", async () => {
    const token = tokenFrom(await createSessionCookie(NOW_SECONDS));
    const [version, expiry, signature] = token.split(".") as [string, string, string];
    const tampered = `${version}.${expiry}.${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
    await expect(isValidSessionToken(tampered, NOW_SECONDS)).resolves.toBe(false);
  });

  it("rejects an extended expiry, because the signature covers it", async () => {
    const token = tokenFrom(await createSessionCookie(NOW_SECONDS));
    const [version, expiry, signature] = token.split(".") as [string, string, string];
    const extended = `${version}.${Number(expiry) + 86_400}.${signature}`;
    await expect(isValidSessionToken(extended, NOW_SECONDS)).resolves.toBe(false);
  });

  it("stops accepting a token once it expires", async () => {
    const token = tokenFrom(await createSessionCookie(NOW_SECONDS));
    /* Well past the eight-hour lifetime, with the signature still intact. */
    await expect(isValidSessionToken(token, NOW_SECONDS + 9 * 60 * 60)).resolves.toBe(false);
  });

  it("reads the token out of a cookie header and ignores the others", async () => {
    const token = tokenFrom(await createSessionCookie());
    await expect(
      hasValidSessionCookie(`other=1; ${ADMIN_SESSION_COOKIE}=${token}; another=2`)
    ).resolves.toBe(true);
    await expect(hasValidSessionCookie("other=1; another=2")).resolves.toBe(false);
    await expect(hasValidSessionCookie(null)).resolves.toBe(false);
  });
});

describe("admin session cookie", () => {
  it("is HttpOnly, same-site, and scoped to the whole app", async () => {
    const cookie = await createSessionCookie(NOW_SECONDS);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it("signs out by replacing itself with an already-expired cookie", () => {
    const cookie = clearedSessionCookie();
    expect(cookie.startsWith(`${ADMIN_SESSION_COOKIE}=;`)).toBe(true);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
  });
});

describe("admin paths", () => {
  it("covers every admin page and route", () => {
    for (const pathname of [
      "/admin",
      "/admin/",
      "/admin/anything",
      ADMIN_LOGIN_PATH,
      ADMIN_SESSION_PATH,
      "/api/v1/admin/inquiries/x/status"
    ]) {
      expect(isAdminPath(pathname)).toBe(true);
    }
    for (const pathname of ["/", "/en/flights", "/api/v1/inquiries", "/adminimposter"]) {
      expect(isAdminPath(pathname)).toBe(false);
    }
  });

  it("requires a session everywhere except signing in", () => {
    for (const pathname of ["/admin", "/admin/", "/api/v1/admin/inquiries/x/status"]) {
      expect(isProtectedAdminPath(pathname)).toBe(true);
    }
    for (const pathname of [ADMIN_LOGIN_PATH, ADMIN_SESSION_PATH, "/", "/adminimposter"]) {
      expect(isProtectedAdminPath(pathname)).toBe(false);
    }
  });
});
