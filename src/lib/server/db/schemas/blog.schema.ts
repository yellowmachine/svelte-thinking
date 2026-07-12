import { text, timestamp, index, uniqueIndex, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { document, documentVersion } from './documents.schema';

// A permanently published, SEO-indexable snapshot of one committed document
// version, pinned at publish time — /@{handle}/{slug}. Unlike documentVersionShare
// (temporary, tokenized, noindex), this has no expiry and title/renderedHtml are
// snapshotted here so the public page never needs to touch document/documentVersion
// (both RLS-protected) after publish.
export const blogPost = scholioSchema
	.table(
		'blog_post',
		{
			id: text('id').primaryKey(),
			userId: text('user_id').notNull(), // = document.ownerUserId at publish time
			documentId: text('document_id')
				.notNull()
				.references(() => document.id, { onDelete: 'cascade' }),
			versionId: text('version_id')
				.notNull()
				.references(() => documentVersion.id, { onDelete: 'cascade' }),
			slug: text('slug').notNull(),
			title: text('title').notNull(), // snapshot — document.title can drift after publish
			renderedHtml: text('rendered_html').notNull(), // snapshot — pre-rendered, sanitized, immutable
			content: text('content').notNull(), // snapshot — raw markdown, source for on-demand PDF export
			refsJson: text('refs_json'), // snapshot — JSON RefData[] used for the PDF bibliography, null = none
			publishedAt: timestamp('published_at').notNull().defaultNow()
		},
		(t) => [
			uniqueIndex('blog_post_user_slug_idx').on(t.userId, t.slug),
			index('blog_post_document_idx').on(t.documentId),
			index('blog_post_user_idx').on(t.userId, t.publishedAt),

			// Public read: anyone, no user context required — same shape as dvshare_public_read
			pgPolicy('blog_post_public_read', {
				for: 'select',
				using: sql`true`
			}),
			// Write: only the publishing user
			pgPolicy('blog_post_owner_write', {
				for: 'all',
				using: sql`${t.userId} = current_setting('app.current_user_id', true)`
			})
		]
	)
	.enableRLS();
