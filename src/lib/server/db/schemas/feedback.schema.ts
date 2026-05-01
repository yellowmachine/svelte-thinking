import { text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { scholioSchema } from '../scholio-schema';

// Feedback is intentionally NOT RLS-protected — it's public by design.
// All authenticated users can insert; everyone can read.
export const feedback = scholioSchema.table('feedback', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull(),
	message: text('message').notNull(),
	showName: boolean('show_name').notNull().default(false),
	userName: text('user_name'), // denormalized, null if showName = false
	createdAt: timestamp('created_at').notNull().defaultNow()
});
