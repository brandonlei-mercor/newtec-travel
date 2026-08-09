CREATE TYPE "public"."trip_type" AS ENUM('ROUND_TRIP', 'ONE_WAY');--> statement-breakpoint
ALTER TABLE "flight_offer_caches" DROP CONSTRAINT "flight_offer_caches_return_after_departure";--> statement-breakpoint
ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_return_after_departure";--> statement-breakpoint
ALTER TABLE "flight_offer_caches" ALTER COLUMN "return_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ALTER COLUMN "return_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flight_offer_caches" ADD COLUMN "trip_type" "trip_type" DEFAULT 'ROUND_TRIP' NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "trip_type" "trip_type" DEFAULT 'ROUND_TRIP' NOT NULL;--> statement-breakpoint
ALTER TABLE "flight_offer_caches" ADD CONSTRAINT "flight_offer_caches_return_matches_trip_type" CHECK (("flight_offer_caches"."trip_type" = 'ONE_WAY' and "flight_offer_caches"."return_date" is null) or ("flight_offer_caches"."trip_type" = 'ROUND_TRIP' and "flight_offer_caches"."return_date" > "flight_offer_caches"."departure_date"));--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_return_matches_trip_type" CHECK (("inquiries"."trip_type" = 'ONE_WAY' and "inquiries"."return_date" is null) or ("inquiries"."trip_type" = 'ROUND_TRIP' and "inquiries"."return_date" > "inquiries"."departure_date"));