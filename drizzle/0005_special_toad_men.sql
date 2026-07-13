CREATE TYPE "scholio"."blog_comment_status" AS ENUM('pending', 'approved', 'hidden');--> statement-breakpoint
CREATE TABLE "scholio"."blog_post_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"blog_post_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"status" "scholio"."blog_comment_status" DEFAULT 'pending' NOT NULL,
	"ai_flagged" boolean DEFAULT false NOT NULL,
	"ai_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scholio"."blog_post_comment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scholio"."blog_post" ADD COLUMN "comments_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scholio"."blog_post" ADD COLUMN "comments_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scholio"."blog_post_comment" ADD CONSTRAINT "blog_post_comment_blog_post_id_blog_post_id_fk" FOREIGN KEY ("blog_post_id") REFERENCES "scholio"."blog_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_post_comment_post_status_idx" ON "scholio"."blog_post_comment" USING btree ("blog_post_id","status");--> statement-breakpoint
CREATE POLICY "blog_post_comment_public_read" ON "scholio"."blog_post_comment" AS PERMISSIVE FOR SELECT TO public USING (
					"scholio"."blog_post_comment"."status" = 'approved'
					AND EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = "scholio"."blog_post_comment"."blog_post_id" AND blog_post.comments_visible = true
					)
				);--> statement-breakpoint
CREATE POLICY "blog_post_comment_author_read" ON "scholio"."blog_post_comment" AS PERMISSIVE FOR SELECT TO public USING ("scholio"."blog_post_comment"."author_id" = nullif(current_setting('app.current_user_id', true), ''));--> statement-breakpoint
CREATE POLICY "blog_post_comment_owner_read" ON "scholio"."blog_post_comment" AS PERMISSIVE FOR SELECT TO public USING (
					EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = "scholio"."blog_post_comment"."blog_post_id" AND blog_post.user_id = nullif(current_setting('app.current_user_id', true), '')
					)
				);--> statement-breakpoint
CREATE POLICY "blog_post_comment_insert" ON "scholio"."blog_post_comment" AS PERMISSIVE FOR INSERT TO public WITH CHECK (
					"scholio"."blog_post_comment"."author_id" = nullif(current_setting('app.current_user_id', true), '')
					AND EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = "scholio"."blog_post_comment"."blog_post_id" AND blog_post.comments_enabled = true
					)
				);--> statement-breakpoint
CREATE POLICY "blog_post_comment_moderate" ON "scholio"."blog_post_comment" AS PERMISSIVE FOR UPDATE TO public USING (
					EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = "scholio"."blog_post_comment"."blog_post_id" AND blog_post.user_id = nullif(current_setting('app.current_user_id', true), '')
					)
				);--> statement-breakpoint
CREATE POLICY "blog_post_comment_delete" ON "scholio"."blog_post_comment" AS PERMISSIVE FOR DELETE TO public USING (
					"scholio"."blog_post_comment"."author_id" = nullif(current_setting('app.current_user_id', true), '')
					OR EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = "scholio"."blog_post_comment"."blog_post_id" AND blog_post.user_id = nullif(current_setting('app.current_user_id', true), '')
					)
				);