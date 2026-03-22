-- Add commit_emails column to notification_preference
ALTER TABLE "scholio"."notification_preference" ADD COLUMN "commit_emails" boolean NOT NULL DEFAULT true;
