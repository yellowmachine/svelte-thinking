import { text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { scholioSchema } from '../scholio-schema';

// Notifications are NOT RLS-protected — admin creates them, all users read them.
export const notification = scholioSchema.table('notification', {
	id: text('id').primaryKey(),
	message: text('message').notNull(),
	startsAt: timestamp('starts_at').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	createdBy: text('created_by').notNull()
});

export const notificationDismissal = scholioSchema.table(
	'notification_dismissal',
	{
		notificationId: text('notification_id')
			.notNull()
			.references(() => notification.id, { onDelete: 'cascade' }),
		userId: text('user_id').notNull(),
		dismissedAt: timestamp('dismissed_at').notNull().defaultNow()
	},
	(t) => [primaryKey({ columns: [t.notificationId, t.userId] })]
);
