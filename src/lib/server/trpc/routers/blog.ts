import { z } from 'zod';
import { eq, and, ne, count } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { slugify } from '$lib/utils/slug';
import { renderMarkdownToHtml } from '$lib/server/markdownRenderer';
import type { CiteRef, CitationStyle } from '$lib/utils/citations';

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/; // 3-30 chars

// Top-level route segments of the app (see src/routes/) — blocked so nobody
// can register e.g. @admin or @login and be confused for an official page.
const RESERVED_HANDLES = new Set([
	'about',
	'admin',
	'api',
	'bib',
	'blog',
	'check-email',
	'conduct',
	'demo',
	'explore',
	'feedback',
	'forgot-password',
	'help',
	'invitations',
	'login',
	'logout',
	'network',
	'no-access',
	'notifications',
	'offline',
	'org-invitations',
	'preview',
	'privacy',
	'project',
	'projects',
	'register',
	'reset-password',
	'settings',
	'sync-log',
	'tags',
	'usage',
	'verify-email'
]);

export const blogRouter = router({
	// Own handle + list of published posts, for Settings → Blog.
	// Includes the originating project/document/version so the author can trace
	// a post back to the exact commit it was published from.
	getMine: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS(async (db) => {
			const [profileRows, posts] = await Promise.all([
				db
					.select({
						handle: userProfile.handle,
						displayName: userProfile.displayName,
						bio: userProfile.bio
					})
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1),
				db
					.select({
						id: blogPost.id,
						documentId: blogPost.documentId,
						projectId: document.projectId,
						versionNumber: documentVersion.versionNumber,
						slug: blogPost.slug,
						title: blogPost.title,
						publishedAt: blogPost.publishedAt
					})
					.from(blogPost)
					.innerJoin(document, eq(document.id, blogPost.documentId))
					.innerJoin(documentVersion, eq(documentVersion.id, blogPost.versionId))
					.where(eq(blogPost.userId, ctx.user.id))
			]);

			return {
				handle: profileRows[0]?.handle ?? null,
				displayName: profileRows[0]?.displayName ?? null,
				bio: profileRows[0]?.bio ?? null,
				posts
			};
		});
	}),

	checkHandleAvailable: protectedProcedure
		.input(z.object({ handle: z.string() }))
		.query(async ({ ctx, input }) => {
			const handle = input.handle.toLowerCase();
			if (!HANDLE_RE.test(handle)) return { available: false, reason: 'invalid' as const };
			if (RESERVED_HANDLES.has(handle)) return { available: false, reason: 'reserved' as const };

			return ctx.withRLS(async (db) => {
				const existing = await db
					.select({ userId: userProfile.userId })
					.from(userProfile)
					.where(and(eq(userProfile.handle, handle), ne(userProfile.userId, ctx.user.id)))
					.limit(1);

				return { available: !existing[0], reason: existing[0] ? ('taken' as const) : undefined };
			});
		}),

	setHandle: protectedProcedure
		.input(z.object({ handle: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const handle = input.handle.toLowerCase();

			return ctx.withRLS(async (db) => {
				const [publishedCount] = await db
					.select({ n: count() })
					.from(blogPost)
					.where(eq(blogPost.userId, ctx.user.id));

				if ((publishedCount?.n ?? 0) > 0) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message:
							'No puedes cambiar tu handle una vez has publicado — protege las URLs ya publicadas.'
					});
				}

				if (!HANDLE_RE.test(handle)) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'El handle debe tener entre 3 y 30 caracteres: letras, números y guiones.'
					});
				}

				if (RESERVED_HANDLES.has(handle)) {
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ese handle está reservado.' });
				}

				const existing = await db
					.select({ userId: userProfile.userId })
					.from(userProfile)
					.where(and(eq(userProfile.handle, handle), ne(userProfile.userId, ctx.user.id)))
					.limit(1);
				if (existing[0]) {
					throw new TRPCError({ code: 'CONFLICT', message: 'Ese handle ya está en uso.' });
				}

				try {
					await db
						.update(userProfile)
						.set({ handle, updatedAt: new Date() })
						.where(eq(userProfile.userId, ctx.user.id));
				} catch {
					// Fallback for a race lost to the unique constraint
					throw new TRPCError({ code: 'CONFLICT', message: 'Ese handle ya está en uso.' });
				}

				return { handle };
			});
		}),

	publish: protectedProcedure
		.input(z.object({ versionId: z.string(), slug: z.string().optional() }))
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const versionRows = await db
					.select({
						id: documentVersion.id,
						documentId: documentVersion.documentId,
						content: documentVersion.content
					})
					.from(documentVersion)
					.where(eq(documentVersion.id, input.versionId))
					.limit(1);
				if (!versionRows[0]) {
					throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
				}
				const version = versionRows[0];

				const docRows = await db
					.select({
						ownerUserId: document.ownerUserId,
						title: document.title,
						projectId: document.projectId
					})
					.from(document)
					.where(eq(document.id, version.documentId))
					.limit(1);
				if (!docRows[0] || docRows[0].ownerUserId !== ctx.user.id) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Only the document owner can publish versions'
					});
				}
				const doc = docRows[0];

				const profileRows = await db
					.select({ handle: userProfile.handle })
					.from(userProfile)
					.where(eq(userProfile.userId, ctx.user.id))
					.limit(1);
				const handle = profileRows[0]?.handle;
				if (!handle) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'Configura tu blog en Ajustes → Blog primero'
					});
				}

				// Idempotent: reuse the existing post for this exact version if there is one
				const existingForVersion = await db
					.select({ id: blogPost.id, slug: blogPost.slug })
					.from(blogPost)
					.where(eq(blogPost.versionId, input.versionId))
					.limit(1);
				if (existingForVersion[0]) {
					return {
						id: existingForVersion[0].id,
						slug: existingForVersion[0].slug,
						url: `/@${handle}/${existingForVersion[0].slug}`
					};
				}

				const mySlugs = await db
					.select({ slug: blogPost.slug })
					.from(blogPost)
					.where(eq(blogPost.userId, ctx.user.id));
				const taken = new Set(mySlugs.map((s) => s.slug));

				const base = slugify(input.slug ?? doc.title) || 'post';
				let slug = base;
				let n = 2;
				while (taken.has(slug)) {
					slug = `${base}-${n}`;
					n++;
				}

				// Resolve citations against the document's project bibliography, same
				// data MarkdownPreview.svelte fetches for the live editor — otherwise
				// [[@citeKey]] / footnote syntax leaks into the public page as raw text.
				const [projectRows, refRows] = await Promise.all([
					db
						.select({ citationStyle: project.citationStyle })
						.from(project)
						.where(eq(project.id, doc.projectId))
						.limit(1),
					db
						.select({ ref: reference })
						.from(reference)
						.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
						.where(eq(projectReference.projectId, doc.projectId))
				]);
				const citationStyle = (projectRows[0]?.citationStyle ?? 'apa') as CitationStyle;
				const references = new Map<string, CiteRef>(
					refRows.map((r) => [r.ref.citeKey, r.ref as unknown as CiteRef])
				);

				const renderedHtml = await renderMarkdownToHtml(version.content, {
					references,
					citationStyle
				});

				const id = crypto.randomUUID();
				await db.insert(blogPost).values({
					id,
					userId: ctx.user.id,
					documentId: version.documentId,
					versionId: input.versionId,
					slug,
					title: doc.title,
					renderedHtml,
					content: version.content,
					refsJson: refRows.length > 0 ? JSON.stringify(refRows.map((r) => r.ref)) : null,
					publishedAt: new Date()
				});

				return { id, slug, url: `/@${handle}/${slug}` };
			});
		}),

	unpublish: protectedProcedure
		.input(z.object({ postId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const rows = await db
					.select({ id: blogPost.id, userId: blogPost.userId })
					.from(blogPost)
					.where(eq(blogPost.id, input.postId))
					.limit(1);
				if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
				if (rows[0].userId !== ctx.user.id) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Only the author can unpublish this post'
					});
				}

				await db.delete(blogPost).where(eq(blogPost.id, input.postId));
				return { ok: true };
			});
		})
});
