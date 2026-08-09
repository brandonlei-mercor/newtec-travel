/**
 * The paths that make up the back office, in a module with no server imports —
 * the board and the sign-in form are client components, and anything they pull
 * in ships to the browser. Keeping these away from the module that reads
 * ADMIN_PASSWORD is what stops the password following them into the bundle.
 */

export const ADMIN_BOARD_PATH = "/admin";

/** The one page inside /admin that does not need a session: it is how you get one. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** POST to sign in, DELETE to sign out. */
export const ADMIN_SESSION_PATH = "/api/v1/admin/session";

export function adminInquiryStatusPath(inquiryId: string): string {
  return `/api/v1/admin/inquiries/${inquiryId}/status`;
}
