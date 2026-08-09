-- The back office became a board: NEW / PROCESSING / DONE.
--
-- Hand-written. drizzle-kit generates a drop-and-recreate for an enum change,
-- which casts every existing 'CONTACTED' row to a type that no longer has that
-- value — the migration fails on any real database, and would lose the status
-- of every request in flight if it did not. Two renames keep the rows, their
-- history, and the enum's position order exactly as they are.
--
-- "inquiries_contacted_at_matches_status" names only 'NEW', so it needs no edit.
ALTER TYPE "public"."inquiry_status" RENAME VALUE 'CONTACTED' TO 'PROCESSING';--> statement-breakpoint
ALTER TYPE "public"."inquiry_status" RENAME VALUE 'CLOSED' TO 'DONE';
