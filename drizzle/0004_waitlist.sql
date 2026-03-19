CREATE TYPE "public"."waitlist_status" AS ENUM('pending', 'approved', 'rejected');
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"message" text,
	"status" "waitlist_status" NOT NULL DEFAULT 'pending',
	"registration_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_registration_token_unique" UNIQUE("registration_token")
);
