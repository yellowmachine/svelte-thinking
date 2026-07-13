CREATE TABLE "scholio"."blog_aggregator" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."blog_aggregator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scholio"."blog_aggregator_item" (
	"id" text PRIMARY KEY NOT NULL,
	"aggregator_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."blog_aggregator_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."blog_aggregator_item" ADD CONSTRAINT "blog_aggregator_item_aggregator_id_blog_aggregator_id_fk" FOREIGN KEY ("aggregator_id") REFERENCES "scholio"."blog_aggregator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_aggregator_user_slug_idx" ON "scholio"."blog_aggregator" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "blog_aggregator_user_idx" ON "scholio"."blog_aggregator" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_aggregator_item_unique_idx" ON "scholio"."blog_aggregator_item" USING btree ("aggregator_id","target_user_id");--> statement-breakpoint
CREATE INDEX "blog_aggregator_item_aggregator_idx" ON "scholio"."blog_aggregator_item" USING btree ("aggregator_id");--> statement-breakpoint
CREATE POLICY "blog_aggregator_public_read" ON "scholio"."blog_aggregator" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "blog_aggregator_owner_write" ON "scholio"."blog_aggregator" AS PERMISSIVE FOR ALL TO public USING ("scholio"."blog_aggregator"."user_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "blog_aggregator_item_public_read" ON "scholio"."blog_aggregator_item" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "blog_aggregator_item_owner_write" ON "scholio"."blog_aggregator_item" AS PERMISSIVE FOR ALL TO public USING (
					EXISTS (
						SELECT 1 FROM scholio.blog_aggregator
						WHERE blog_aggregator.id = "scholio"."blog_aggregator_item"."aggregator_id" AND blog_aggregator.user_id = nullif(current_setting('app.current_user_id', true), '')
					)
				);