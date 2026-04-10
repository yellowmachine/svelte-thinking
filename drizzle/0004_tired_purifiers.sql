ALTER TABLE "scholio"."user_profile" DROP CONSTRAINT "user_profile_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "plan_status";--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" DROP COLUMN "plan_current_period_end";--> statement-breakpoint
ALTER TABLE "scholio"."project" DROP COLUMN "project_budget_eur";--> statement-breakpoint
ALTER TABLE "scholio"."organization" DROP COLUMN "monthly_budget_eur";--> statement-breakpoint
DROP TYPE "scholio"."plan";