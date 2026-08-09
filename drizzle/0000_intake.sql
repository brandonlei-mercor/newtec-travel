CREATE TYPE "public"."cabin" AS ENUM('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'NO_PREFERENCE');--> statement-breakpoint
CREATE TYPE "public"."contact_method" AS ENUM('EMAIL', 'PHONE');--> statement-breakpoint
CREATE TYPE "public"."date_flexibility" AS ENUM('EXACT', 'PLUS_MINUS_1', 'PLUS_MINUS_3');--> statement-breakpoint
CREATE TYPE "public"."destination" AS ENUM('SGN', 'HAN', 'DAD', 'FLEXIBLE');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('NEW', 'CONTACTED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'vi');--> statement-breakpoint
CREATE TYPE "public"."notification_state" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TABLE "fare_calendar_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin" varchar(3) DEFAULT 'SFO' NOT NULL,
	"destination" varchar(3) NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"stay_nights" integer NOT NULL,
	"cheapest_total_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"carrier" varchar(3) NOT NULL,
	"stops" integer NOT NULL,
	"source" varchar(32) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fare_calendar_entries_route_date_unique" UNIQUE("origin","destination","departure_date","stay_nights","source"),
	CONSTRAINT "fare_calendar_entries_origin_sfo" CHECK ("fare_calendar_entries"."origin" = 'SFO'),
	CONSTRAINT "fare_calendar_entries_destination_supported" CHECK ("fare_calendar_entries"."destination" in ('SGN', 'HAN', 'DAD')),
	CONSTRAINT "fare_calendar_entries_amount_nonnegative" CHECK ("fare_calendar_entries"."cheapest_total_minor" >= 0),
	CONSTRAINT "fare_calendar_entries_usd_only" CHECK ("fare_calendar_entries"."currency" = 'USD'),
	CONSTRAINT "fare_calendar_entries_return_after_departure" CHECK ("fare_calendar_entries"."return_date" > "fare_calendar_entries"."departure_date"),
	CONSTRAINT "fare_calendar_entries_stay_positive" CHECK ("fare_calendar_entries"."stay_nights" > 0 and "fare_calendar_entries"."stay_nights" <= 60),
	CONSTRAINT "fare_calendar_entries_stops_range" CHECK ("fare_calendar_entries"."stops" >= 0 and "fare_calendar_entries"."stops" <= 3)
);
--> statement-breakpoint
CREATE TABLE "flight_offer_caches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_key" varchar(64) NOT NULL,
	"origin" varchar(3) DEFAULT 'SFO' NOT NULL,
	"destination" varchar(3) NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"adults" integer NOT NULL,
	"children" integer NOT NULL,
	"infants" integer NOT NULL,
	"cabin" "cabin" NOT NULL,
	"offers" jsonb NOT NULL,
	"source" varchar(32) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "flight_offer_caches_origin_sfo" CHECK ("flight_offer_caches"."origin" = 'SFO'),
	CONSTRAINT "flight_offer_caches_destination_supported" CHECK ("flight_offer_caches"."destination" in ('SGN', 'HAN', 'DAD')),
	CONSTRAINT "flight_offer_caches_return_after_departure" CHECK ("flight_offer_caches"."return_date" > "flight_offer_caches"."departure_date"),
	CONSTRAINT "flight_offer_caches_party_valid" CHECK ("flight_offer_caches"."adults" >= 1 and "flight_offer_caches"."children" >= 0 and "flight_offer_caches"."infants" >= 0 and "flight_offer_caches"."adults" + "flight_offer_caches"."children" + "flight_offer_caches"."infants" <= 9 and "flight_offer_caches"."infants" <= "flight_offer_caches"."adults"),
	CONSTRAINT "flight_offer_caches_cabin_concrete" CHECK ("flight_offer_caches"."cabin" <> 'NO_PREFERENCE'),
	CONSTRAINT "flight_offer_caches_expiry_ordered" CHECK ("flight_offer_caches"."expires_at" > "flight_offer_caches"."fetched_at")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar(255) NOT NULL,
	"scope" varchar(100) NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_actor_scope_key_unique" UNIQUE("actor_id","scope","key")
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(16) NOT NULL,
	"status" "inquiry_status" DEFAULT 'NEW' NOT NULL,
	"origin" varchar(3) DEFAULT 'SFO' NOT NULL,
	"destination" "destination" NOT NULL,
	"departure_date" date NOT NULL,
	"return_date" date NOT NULL,
	"date_flexibility" date_flexibility NOT NULL,
	"cabin" "cabin" NOT NULL,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"infants" integer DEFAULT 0 NOT NULL,
	"given_name" varchar(80) NOT NULL,
	"family_name" varchar(80) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"preferred_contact_method" "contact_method" NOT NULL,
	"preferred_locale" "locale" DEFAULT 'en' NOT NULL,
	"special_assistance" text,
	"customer_notes" text,
	"visa_interest" boolean DEFAULT false NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"transactional_consent_at" timestamp with time zone NOT NULL,
	"party_data_authority_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_reference_unique" UNIQUE("reference"),
	CONSTRAINT "inquiries_origin_sfo" CHECK ("inquiries"."origin" = 'SFO'),
	CONSTRAINT "inquiries_party_valid" CHECK ("inquiries"."adults" >= 1 and "inquiries"."children" >= 0 and "inquiries"."infants" >= 0 and "inquiries"."adults" + "inquiries"."children" + "inquiries"."infants" <= 9 and "inquiries"."infants" <= "inquiries"."adults"),
	CONSTRAINT "inquiries_return_after_departure" CHECK ("inquiries"."return_date" > "inquiries"."departure_date"),
	CONSTRAINT "inquiries_email_single_line" CHECK (position(chr(10) in "inquiries"."email") = 0 and position(chr(13) in "inquiries"."email") = 0),
	CONSTRAINT "inquiries_phone_single_line" CHECK (position(chr(10) in "inquiries"."phone") = 0 and position(chr(13) in "inquiries"."phone") = 0),
	CONSTRAINT "inquiries_contacted_at_matches_status" CHECK (("inquiries"."status" = 'NEW') = ("inquiries"."contacted_at" is null))
);
--> statement-breakpoint
CREATE TABLE "inquiry_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"recipient" varchar(320) NOT NULL,
	"state" "notification_state" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "inquiry_notifications_inquiry_unique" UNIQUE("inquiry_id"),
	CONSTRAINT "inquiry_notifications_sent_at_set" CHECK (("inquiry_notifications"."state" = 'SENT') = ("inquiry_notifications"."sent_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "inquiry_notifications" ADD CONSTRAINT "inquiry_notifications_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fare_calendar_entries_lookup_idx" ON "fare_calendar_entries" USING btree ("destination","stay_nights","departure_date");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_offer_caches_search_key_uidx" ON "flight_offer_caches" USING btree ("search_key");--> statement-breakpoint
CREATE INDEX "flight_offer_caches_expiry_idx" ON "flight_offer_caches" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inquiries_status_submitted_idx" ON "inquiries" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "inquiries_submitted_idx" ON "inquiries" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "inquiry_notifications_pending_idx" ON "inquiry_notifications" USING btree ("state","created_at");