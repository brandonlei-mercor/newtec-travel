-- Checkout now collects every traveler's legal name and date of birth, which is
-- what an airline holds a seat against. A table rather than columns on the
-- inquiry because a request carries up to nine of them, and cascading so
-- deleting a request takes its passport data with it. Existing requests simply
-- have no rows here: nothing to backfill, and nothing that needed a default.
CREATE TYPE "public"."passenger_type" AS ENUM('ADULT', 'CHILD', 'INFANT');--> statement-breakpoint
CREATE TABLE "inquiry_passengers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "passenger_type" NOT NULL,
	"given_name" varchar(80) NOT NULL,
	"family_name" varchar(80) NOT NULL,
	"date_of_birth" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_passengers_position_unique" UNIQUE("inquiry_id","position"),
	CONSTRAINT "inquiry_passengers_position_positive" CHECK ("inquiry_passengers"."position" >= 1)
);
--> statement-breakpoint
ALTER TABLE "inquiry_passengers" ADD CONSTRAINT "inquiry_passengers_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_passengers_inquiry_idx" ON "inquiry_passengers" USING btree ("inquiry_id");