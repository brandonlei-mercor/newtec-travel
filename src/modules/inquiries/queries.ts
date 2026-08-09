import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db";
import { inquiries, inquiryNotifications, inquiryPassengers } from "@/server/db/schema";
import { NotFoundError } from "@/shared/errors";
import type { InquiryStatus } from "@/shared/contracts/inquiry";

export type InquiryRecord = typeof inquiries.$inferSelect;
export type InquiryPassengerRecord = typeof inquiryPassengers.$inferSelect;

/**
 * A request together with who is on it. Every reader of an inquiry wants the
 * manifest — the agency email retypes it into Sabre and the board shows it —
 * so the two travel together rather than being fetched separately at each
 * call site and occasionally forgotten.
 */
export type InquiryWithPassengers = InquiryRecord & { passengers: InquiryPassengerRecord[] };

export type InquiryListRow = InquiryWithPassengers & {
  notificationState: "PENDING" | "SENT" | "FAILED" | null;
};

/**
 * The manifests for a page of requests, in one query rather than one per row.
 * Grouped by request and left in collection order, which is the order the
 * airline lists a booking in.
 */
async function passengersByInquiry(
  db: Database,
  inquiryIds: string[]
): Promise<Map<string, InquiryPassengerRecord[]>> {
  const grouped = new Map<string, InquiryPassengerRecord[]>();
  /* `in ()` is not valid SQL, and an empty page has nothing to look up anyway. */
  if (inquiryIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(inquiryPassengers)
    .where(inArray(inquiryPassengers.inquiryId, inquiryIds))
    .orderBy(asc(inquiryPassengers.inquiryId), asc(inquiryPassengers.position));
  for (const row of rows) {
    const existing = grouped.get(row.inquiryId);
    if (existing) existing.push(row);
    else grouped.set(row.inquiryId, [row]);
  }
  return grouped;
}

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
  const passengers = await passengersByInquiry(
    db,
    rows.map((row) => row.inquiry.id)
  );
  return rows.map((row) => ({
    ...row.inquiry,
    passengers: passengers.get(row.inquiry.id) ?? [],
    notificationState: row.notificationState
  }));
}

export async function getInquiryForNotification(
  db: Database,
  notificationId: string
): Promise<{ inquiry: InquiryWithPassengers; recipient: string; state: string } | undefined> {
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
  if (!row) return undefined;
  const passengers = await db
    .select()
    .from(inquiryPassengers)
    .where(eq(inquiryPassengers.inquiryId, row.inquiry.id))
    .orderBy(asc(inquiryPassengers.position));
  return { ...row, inquiry: { ...row.inquiry, passengers } };
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
