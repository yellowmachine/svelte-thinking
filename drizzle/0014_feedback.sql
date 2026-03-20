CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"show_name" boolean NOT NULL DEFAULT false,
	"user_name" text,
	"created_at" timestamp NOT NULL DEFAULT now()
);
