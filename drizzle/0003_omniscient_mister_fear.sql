CREATE TABLE "scholio"."blog_post" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document_id" text NOT NULL,
	"version_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"rendered_html" text NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."blog_post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "scholio"."blog_post" ADD CONSTRAINT "blog_post_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "scholio"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholio"."blog_post" ADD CONSTRAINT "blog_post_version_id_document_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "scholio"."document_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blog_post_user_slug_idx" ON "scholio"."blog_post" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "blog_post_document_idx" ON "scholio"."blog_post" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "blog_post_user_idx" ON "scholio"."blog_post" USING btree ("user_id","published_at");--> statement-breakpoint
ALTER TABLE "scholio"."user_profile" ADD CONSTRAINT "user_profile_handle_unique" UNIQUE("handle");--> statement-breakpoint
CREATE POLICY "user_profile_public_read" ON "scholio"."user_profile" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."user_profile"."handle" IS NOT NULL);--> statement-breakpoint
CREATE POLICY "blog_post_public_read" ON "scholio"."blog_post" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "blog_post_owner_write" ON "scholio"."blog_post" AS PERMISSIVE FOR ALL TO public USING ("scholio"."blog_post"."user_id" = current_setting('app.current_user_id', true));