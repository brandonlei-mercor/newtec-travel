import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_RESPONSE_HEADERS,
  clearedSessionCookie,
  createSessionCookie,
  verifyAdminPassword
} from "@/server/admin-auth";
import { assertTrustedMutationOrigin } from "@/server/http/request";
import { handleRouteError } from "@/server/http/responses";
import {
  clearFailedSignIns,
  recordFailedSignIn,
  signInRetryAfterSeconds
} from "@/server/sign-in-throttle";

/*
 * The one endpoint inside /admin that anonymous callers may reach, because it
 * is how you stop being anonymous. Everything else is behind a session.
 */

export const dynamic = "force-dynamic";

const signInSchema = z.object({ password: z.string().min(1).max(200) }).strict();

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);

    const caller = callerKey(request);
    const retryAfter = signInRetryAfterSeconds(caller);
    if (retryAfter !== undefined) {
      return NextResponse.json(
        { error: { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Try again shortly." } },
        {
          status: 429,
          headers: { ...ADMIN_RESPONSE_HEADERS, "Retry-After": String(retryAfter) }
        }
      );
    }

    const { password } = signInSchema.parse(await request.json());
    if (!(await verifyAdminPassword(password))) {
      recordFailedSignIn(caller);
      /*
       * One message for every kind of wrong, and nothing logged: the password is
       * the only secret here, and a response that distinguished "too short" from
       * "wrong" would be a place to probe it from.
       */
      return NextResponse.json(
        { error: { code: "INVALID_PASSWORD", message: "Incorrect password" } },
        { status: 401, headers: ADMIN_RESPONSE_HEADERS }
      );
    }

    clearFailedSignIns(caller);
    return new NextResponse(null, {
      status: 204,
      headers: { ...ADMIN_RESPONSE_HEADERS, "Set-Cookie": await createSessionCookie() }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Signing out. No session to look up: replacing the cookie is the whole job. */
export async function DELETE(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
    return new NextResponse(null, {
      status: 204,
      headers: { ...ADMIN_RESPONSE_HEADERS, "Set-Cookie": clearedSessionCookie() }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Who is guessing, as far as the throttle is concerned. The left-most
 * x-forwarded-for entry is the client the proxy saw; when there is no header at
 * all everyone shares one bucket, which throttles harder rather than softer.
 */
function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
