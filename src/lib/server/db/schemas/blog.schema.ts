import { text, timestamp, boolean, index, uniqueIndex, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { document, documentVersion } from './documents.schema';

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

export const blogCommentStatusEnum = scholioSchema.enum('blog_comment_status', [
	'pending',
	'approved',
	'hidden'
]);

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
			publishedAt: timestamp('published_at').notNull().defaultNow(),
			// Opt-in at publish time — off by default. Gates new comment INSERTs only;
			// toggling this off later ("block comments") does not affect commentsVisible.
			commentsEnabled: boolean('comments_enabled').notNull().default(false),
			// Independent of commentsEnabled — lets the author hide all already-published
			// (approved) comments from public view without deleting or unapproving them.
			commentsVisible: boolean('comments_visible').notNull().default(true)
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

// Public comments on a blog_post. No anonymous authors — authorId is always a
// real user id. Visible to the public only when status = 'approved' AND the
// parent post has commentsVisible = true (the author's global hide switch).
export const blogPostComment = scholioSchema
	.table(
		'blog_post_comment',
		{
			id: text('id').primaryKey(),
			blogPostId: text('blog_post_id')
				.notNull()
				.references(() => blogPost.id, { onDelete: 'cascade' }),
			authorId: text('author_id').notNull(),
			content: text('content').notNull(),
			status: blogCommentStatusEnum('status').notNull().default('pending'),
			// Set by the optional BYOK moderation check at insert time — a flag for the
			// post author to prioritize, never an auto-approve/auto-block signal.
			aiFlagged: boolean('ai_flagged').notNull().default(false),
			aiReason: text('ai_reason'),
			createdAt: timestamp('created_at').notNull().defaultNow(),
			updatedAt: timestamp('updated_at').notNull().defaultNow()
		},
		(t) => [
			index('blog_post_comment_post_status_idx').on(t.blogPostId, t.status),

			// Public: only approved comments on posts the author hasn't hidden
			pgPolicy('blog_post_comment_public_read', {
				for: 'select',
				using: sql`
					${t.status} = 'approved'
					AND EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = ${t.blogPostId} AND blog_post.comments_visible = true
					)
				`
			}),

			// Commenter can always see their own comment (e.g. while pending review)
			pgPolicy('blog_post_comment_author_read', {
				for: 'select',
				using: sql`${t.authorId} = ${currentUserId}`
			}),

			// Post owner can see every comment on their own posts, any status — moderation queue
			pgPolicy('blog_post_comment_owner_read', {
				for: 'select',
				using: sql`
					EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = ${t.blogPostId} AND blog_post.user_id = ${currentUserId}
					)
				`
			}),

			// Insert: must be logged in, and the post must currently accept comments
			pgPolicy('blog_post_comment_insert', {
				for: 'insert',
				withCheck: sql`
					${t.authorId} = ${currentUserId}
					AND EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = ${t.blogPostId} AND blog_post.comments_enabled = true
					)
				`
			}),

			// Moderate (approve/hide): only the post owner
			pgPolicy('blog_post_comment_moderate', {
				for: 'update',
				using: sql`
					EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = ${t.blogPostId} AND blog_post.user_id = ${currentUserId}
					)
				`
			}),

			// Delete: own comment, or the post owner moderating it away
			pgPolicy('blog_post_comment_delete', {
				for: 'delete',
				using: sql`
					${t.authorId} = ${currentUserId}
					OR EXISTS (
						SELECT 1 FROM scholio.blog_post
						WHERE blog_post.id = ${t.blogPostId} AND blog_post.user_id = ${currentUserId}
					)
				`
			})
		]
	)
	.enableRLS();
