import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import {
  ADMIN_RESPONSE_HEADERS,
  ADMIN_SESSION_COOKIE,
  isAdminPath,
  isProtectedAdminPath,
  isValidSessionToken
} from "@/server/admin-auth";
import { ADMIN_LOGIN_PATH } from "@/shared/admin-routes";

const intlMiddleware = createIntlMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  /*
   * The first of two gates. Every /admin page and route re-checks the session
   * itself, because a matcher that ever stopped covering a path would otherwise
   * publish customer contact details with no other line of defence.
   */
  if (isAdminPath(pathname)) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (isProtectedAdminPath(pathname) && !(await isValidSessionToken(token))) {
      /*
       * A browser gets the sign-in form; anything calling the API gets a plain
       * 401, because a redirect to HTML is not an answer a fetch can use. The
       * target is fixed rather than carried in a query parameter: a redirect
       * destination a caller can choose is a redirect a caller can abuse.
       */
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "ADMIN_AUTHENTICATION_REQUIRED" },
          { status: 401, headers: ADMIN_RESPONSE_HEADERS }
        );
      }
      return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url), {
        status: 303,
        headers: ADMIN_RESPONSE_HEADERS
      });
    }
    return NextResponse.next({ headers: ADMIN_RESPONSE_HEADERS });
  }

  const isLocalizedPage =
    !pathname.startsWith("/api/") && !pathname.startsWith("/_next/") && !pathname.includes(".");
  return isLocalizedPage ? intlMiddleware(request) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"]
};
