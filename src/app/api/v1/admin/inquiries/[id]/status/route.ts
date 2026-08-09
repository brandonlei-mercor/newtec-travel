import { NextResponse } from "next/server";
import { z } from "zod";
import { setInquiryStatus } from "@/modules/inquiries/queries";
import { ADMIN_RESPONSE_HEADERS, hasValidSessionCookie } from "@/server/admin-auth";
import { getDatabase } from "@/server/db";
import { assertTrustedMutationOrigin } from "@/server/http/request";
import { handleRouteError, ok } from "@/server/http/responses";
import { INQUIRY_STATUSES } from "@/shared/contracts/inquiry";

/*
 * A column, re-validated. The board sends the status a card was dropped into;
 * the enum below is the same list the database column allows, so a request
 * naming anything else is rejected before it reaches a row.
 */
const requestSchema = z.object({ status: z.enum(INQUIRY_STATUSES) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  /*
   * The second of two gates; the proxy holds the first. A route that trusted
   * the matcher alone would let a path-normalisation quirk rewrite customer
   * records anonymously.
   */
  if (!(await hasValidSessionCookie(request.headers.get("cookie")))) {
    return NextResponse.json(
      { error: { code: "ADMIN_AUTHENTICATION_REQUIRED", message: "Sign in to continue" } },
      { status: 401, headers: ADMIN_RESPONSE_HEADERS }
    );
  }
  try {
    assertTrustedMutationOrigin(request);
    const { id } = await context.params;
    const inquiryId = z.uuid().parse(id);
    const { status } = requestSchema.parse(await request.json());
    const updated = await setInquiryStatus(getDatabase(), inquiryId, status, new Date());
    return ok({ id: updated.id, status: updated.status }, { headers: ADMIN_RESPONSE_HEADERS });
  } catch (error) {
    return handleRouteError(error);
  }
}
