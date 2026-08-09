import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { DatabaseTransaction } from "@/server/db";
import { idempotencyKeys } from "@/server/db/schema";
import { canonicalJson } from "./canonical-json";
import { DomainError } from "./errors";

export type ClaimedIdempotency =
  | { fresh: true; id: string }
  | { fresh: false; responseStatus: number; responseBody: Record<string, unknown> };

export async function claimIdempotency(
  tx: DatabaseTransaction,
  input: {
    actorId: string;
    scope: string;
    key: string;
    request: unknown;
    now?: Date;
  }
): Promise<ClaimedIdempotency> {
  const now = input.now ?? new Date();
  const requestHash = createHash("sha256").update(canonicalJson(input.request)).digest("hex");
  const [claimed] = await tx
    .insert(idempotencyKeys)
    .values({
      actorId: input.actorId,
      scope: input.scope,
      key: input.key,
      requestHash,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000)
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });
  if (claimed) return { fresh: true, id: claimed.id };

  const [existing] = await tx
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.actorId, input.actorId),
        eq(idempotencyKeys.scope, input.scope),
        eq(idempotencyKeys.key, input.key)
      )
    )
    .limit(1);
  if (!existing || existing.requestHash !== requestHash)
    throw new DomainError("IDEMPOTENCY_KEY_REUSED", 409);
  // Same key, same request, but the first attempt has not finished writing its
  // response yet. Retrying now would double-insert, so the caller waits.
  if (!existing.completedAt || !existing.responseBody || existing.responseStatus == null)
    throw new DomainError("REQUEST_IN_PROGRESS", 409);
  return {
    fresh: false,
    responseStatus: existing.responseStatus,
    responseBody: existing.responseBody
  };
}

export async function completeIdempotency(
  tx: DatabaseTransaction,
  id: string,
  responseStatus: number,
  responseBody: Record<string, unknown>,
  completedAt = new Date()
): Promise<void> {
  await tx
    .update(idempotencyKeys)
    .set({ responseStatus, responseBody, completedAt })
    .where(eq(idempotencyKeys.id, id));
}
