import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const waitlistStatusEnum = pgEnum('waitlist_status', ['pending', 'approved', 'rejected']);

export const waitlist = pgTable('waitlist', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name'),
	message: text('message'), // opcional: "¿para qué usarías Scholio?"
	status: waitlistStatusEnum('status').notNull().default('pending'),
	registrationToken: text('registration_token').unique(),
	tokenExpiresAt: timestamp('token_expires_at'),
	createdAt: timestamp('created_at').notNull().defaultNow()
});
