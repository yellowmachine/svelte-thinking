CREATE TABLE "scholio"."notification" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);

CREATE TABLE "scholio"."notification_dismissal" (
	"notification_id" text NOT NULL,
	"user_id" text NOT NULL,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_dismissal_pkey" PRIMARY KEY("notification_id","user_id")
);

ALTER TABLE "scholio"."notification_dismissal"
	ADD CONSTRAINT "notification_dismissal_notification_id_notification_id_fk"
	FOREIGN KEY ("notification_id") REFERENCES "scholio"."notification"("id") ON DELETE cascade ON UPDATE no action;
