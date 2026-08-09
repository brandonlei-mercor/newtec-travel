import { desc, eq } from "drizzle-orm";
import type { Database } from "@/server/db";
import { inquiries, inquiryNotifications } from "@/server/db/schema";
import { NotFoundError } from "@/shared/errors";
import type { InquiryStatus } from "@/shared/contracts/inquiry";

export type InquiryRecord = typeof inquiries.$inferSelect;

export type InquiryListRow = InquiryRecord & {
  notificationState: "PENDING" | "SENT" | "FAILED" | null;
};

/**
 * The whole back office. Newest first, with the notification's state alongside
 * so a staff member can see at a glance whether the alerting email actually
 * went out or whether this page is the only place the request exists.
 */
export async function listInquiries(db: Database, limit = 200): Promise<InquiryListRow[]> {
  const rows = await db
    .select({ inquiry: inquiries, notificationState: inquiryNotifications.state })
    .from(inquiries)
    .leftJoin(inquiryNotifications, eq(inquiryNotifications.inquiryId, inquiries.id))
    .orderBy(desc(inquiries.submittedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row.inquiry, notificationState: row.notificationState }));
}

export async function getInquiryForNotification(
  db: Database,
  notificationId: string
): Promise<{ inquiry: InquiryRecord; recipient: string; state: string } | undefined> {
  const [row] = await db
    .select({
      inquiry: inquiries,
      recipient: inquiryNotifications.recipient,
      state: inquiryNotifications.state
    })
    .from(inquiryNotifications)
    .innerJoin(inquiries, eq(inquiries.id, inquiryNotifications.inquiryId))
    .where(eq(inquiryNotifications.id, notificationId))
    .limit(1);
  return row;
}

export async function setInquiryStatus(
  db: Database,
  inquiryId: string,
  status: InquiryStatus,
  now = new Date()
): Promise<InquiryRecord> {
  const [updated] = await db
    .update(inquiries)
    .set({
      status,
      // The column check keeps these two in step; NEW means nobody has called yet.
      contactedAt: status === "NEW" ? null : now,
      updatedAt: now
    })
    .where(eq(inquiries.id, inquiryId))
    .returning();
  if (!updated) throw new NotFoundError("That request no longer exists");
  return updated;
}
