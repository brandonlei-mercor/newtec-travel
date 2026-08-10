import { eq, sql } from "drizzle-orm";
import { composeInquiryWelcome } from "../../modules/inquiries/notification";
import { getInquiryForNotification } from "../../modules/inquiries/queries";
import type { Database } from "../db";
import { inquiryNotifications } from "../db/schema";
import type { Clock, EmailSender } from "../integrations";
import type { JobHandlers } from "./contracts";

export type JobHandlerDependencies = {
  db: Database;
  emailSender: EmailSender;
  clock: Clock;
  appUrl: string;
};

export function createJobHandlers(dependencies: JobHandlerDependencies): JobHandlers {
  return {
    async notify_inquiry(payload) {
      await welcomeInquiry(dependencies, payload.notificationId);
    }
  };
}

/**
 * Drains one outbox row: the welcome email to the customer, copying the agency
 * mailbox held in `recipient`. Delivery state is recorded whether the send
 * succeeds or not, so /admin can show that a request arrived but its email did
 * not, and a throw hands the retry back to the worker rather than swallowing
 * the failure.
 */
async function welcomeInquiry(
  dependencies: JobHandlerDependencies,
  notificationId: string
): Promise<void> {
  const { db, emailSender, clock } = dependencies;
  const row = await getInquiryForNotification(db, notificationId);
  if (!row) throw new Error(`INQUIRY_NOTIFICATION_NOT_FOUND: ${notificationId}`);
  if (row.state === "SENT") return;

  try {
    const delivery = await emailSender.send(composeInquiryWelcome(row.inquiry, row.recipient));
    if (delivery.accepted.length === 0) {
      throw new Error(`The mail server accepted no recipients: ${delivery.rejected.join(", ")}`);
    }
    await db
      .update(inquiryNotifications)
      .set({
        state: "SENT",
        sentAt: clock.now(),
        providerMessageId: delivery.providerMessageId,
        lastError: null
      })
      .where(eq(inquiryNotifications.id, notificationId));
  } catch (error) {
    /*
     * Recorded outside the failing transaction and then rethrown: the row keeps
     * the reason a human can read, and graphile-worker keeps the backoff.
     */
    await db
      .update(inquiryNotifications)
      .set({
        state: "FAILED",
        attempts: sql`${inquiryNotifications.attempts} + 1`,
        lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error"
      })
      .where(eq(inquiryNotifications.id, notificationId));
    throw error;
  }
}
