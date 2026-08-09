import { createInquiry } from "@/modules/inquiries/service";
import { getDatabase } from "@/server/db";
import { assertTrustedMutationOrigin, requireIdempotencyKey } from "@/server/http/request";
import { handleRouteError, ok } from "@/server/http/responses";
import { env } from "@/shared/env";

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const body: unknown = await request.json();
    const result = await createInquiry(getDatabase(), body, {
      idempotencyKey,
      notificationRecipient: env.INQUIRY_NOTIFICATION_EMAIL,
      sendNotificationEmail: env.INQUIRY_EMAIL_ENABLED
    });
    return ok(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
