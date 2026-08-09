ALTER TABLE "flight_offer_caches" DROP CONSTRAINT "flight_offer_caches_origin_sfo";--> statement-breakpoint
ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_origin_sfo";--> statement-breakpoint
ALTER TABLE "flight_offer_caches" ADD CONSTRAINT "flight_offer_caches_origin_supported" CHECK ("flight_offer_caches"."origin" in ('SFO', 'LAX', 'PHX', 'JFK'));--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_origin_supported" CHECK ("inquiries"."origin" in ('SFO', 'LAX', 'PHX', 'JFK'));