ALTER TABLE "scholio"."ai_usage_log" ADD COLUMN "cost_usd" numeric(12, 8);--> statement-breakpoint
ALTER TABLE "scholio"."ai_usage_log" ADD COLUMN "cost_is_estimate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Every row so far was an estimate in EUR at the fixed 0.92 USD→EUR rate: back to USD.
UPDATE "scholio"."ai_usage_log" SET "cost_usd" = "estimated_cost_eur" / 0.92, "cost_is_estimate" = true;
