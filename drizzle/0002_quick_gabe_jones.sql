CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'team');--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "plan" "plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "plan_status" text DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "plan_current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_stripe_customer_id_unique" UNIQUE("stripe_customer_id");