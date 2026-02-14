ALTER TABLE "users" ADD COLUMN "thirdPartyConsentGranted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "thirdPartyConsentGranted" = ("aiConsentGranted" OR "sttConsentGranted");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "aiConsentGranted";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "sttConsentGranted";
