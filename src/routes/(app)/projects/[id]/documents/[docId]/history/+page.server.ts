import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq, desc, and, gt, isNull } from 'drizzle-orm';
import {
	document,
	documentVersion,
	documentVersionShare
} from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { blogPost } from '$lib/server/db/schemas/blog.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';

export const load: PageServerLoad = async (event) => {
	const { id: projectId, docId } = event.params;
	const currentUserId = event.locals.user!.id;

	const [docRows, projectRows, versions] = await Promise.all([
		event.locals.withRLS((db) =>
			db
				.select({
					id: document.id,
					title: document.title,
					projectId: document.projectId,
					writerUserId: document.writerUserId,
					ownerUserId: document.ownerUserId
				})
				.from(document)
				.where(eq(document.id, docId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select({ title: project.title, ownerId: project.ownerId })
				.from(project)
				.where(eq(project.id, projectId))
				.limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select({
					id: documentVersion.id,
					versionNumber: documentVersion.versionNumber,
					changeDescription: documentVersion.changeDescription,
					aiSummary: documentVersion.aiSummary,
					createdBy: documentVersion.createdBy,
					createdAt: documentVersion.createdAt
				})
				.from(documentVersion)
				.where(eq(documentVersion.documentId, docId))
				.orderBy(desc(documentVersion.versionNumber))
		)
	]);

	if (!docRows[0]) error(404, 'Documento no encontrado');

	const proj = projectRows[0];
	const ownerId = proj?.ownerId ?? '';
	const doc = docRows[0];
	const canWrite =
		doc.writerUserId === null ? currentUserId === ownerId : currentUserId === doc.writerUserId;

	const isOwner = doc.ownerUserId === currentUserId;

	// Si es owner, cargamos los shares activos por versionId, los posts del blog para
	// este documento, y el handle del usuario (para saber si puede publicar)
	let sharesByVersionId: Record<string, { id: string; token: string; expiresAt: Date }> = {};
	let blogPostByVersionId: Record<string, { id: string; slug: string }> = {};
	let userHandle: string | null = null;
	if (isOwner) {
		const now = new Date();
		const [shares, posts, profileRows] = await Promise.all([
			versions.length > 0
				? event.locals.withRLS((db) =>
						db
							.select({
								id: documentVersionShare.id,
								versionId: documentVersionShare.versionId,
								token: documentVersionShare.token,
								expiresAt: documentVersionShare.expiresAt
							})
							.from(documentVersionShare)
							.where(
								and(
									eq(documentVersionShare.documentId, docId),
									isNull(documentVersionShare.revokedAt),
									gt(documentVersionShare.expiresAt, now)
								)
							)
					)
				: Promise.resolve([]),
			event.locals.withRLS((db) =>
				db
					.select({ id: blogPost.id, versionId: blogPost.versionId, slug: blogPost.slug })
					.from(blogPost)
					.where(eq(blogPost.documentId, docId))
			),
			event.locals.withRLS((db) =>
				db
					.select({ handle: userProfile.handle })
					.from(userProfile)
					.where(eq(userProfile.userId, currentUserId))
					.limit(1)
			)
		]);
		sharesByVersionId = Object.fromEntries(
			shares.map((s) => [s.versionId, { id: s.id, token: s.token, expiresAt: s.expiresAt }])
		);
		blogPostByVersionId = Object.fromEntries(
			posts.map((p) => [p.versionId, { id: p.id, slug: p.slug }])
		);
		userHandle = profileRows[0]?.handle ?? null;
	}

	return {
		document: doc,
		projectTitle: proj?.title ?? '',
		projectOwnerId: ownerId,
		versions,
		canWrite,
		isOwner,
		currentUserId,
		sharesByVersionId,
		blogPostByVersionId,
		userHandle
	};
};
