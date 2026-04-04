import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stringify } from 'yaml';
import { zipSync } from 'fflate';
import { eq, asc } from 'drizzle-orm';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { comment } from '$lib/server/db/schemas/comments.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { user } from '$lib/server/db/auth.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { createS3Client } from '$lib/server/storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const GET: RequestHandler = async (event) => {
	const projectId = event.params.id;

	const [proj, documents, collaborators, references, photos, allComments] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select().from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db.select().from(document).where(eq(document.projectId, projectId)).orderBy(asc(document.createdAt))
		),
		event.locals.withRLS((db) =>
			db
				.select({
					role: projectCollaborator.role,
					joinedAt: projectCollaborator.createdAt,
					email: user.email,
					name: user.name,
					orcid: userProfile.orcid
				})
				.from(projectCollaborator)
				.innerJoin(user, eq(user.id, projectCollaborator.userId))
				.leftJoin(userProfile, eq(userProfile.userId, projectCollaborator.userId))
				.where(eq(projectCollaborator.projectId, projectId))
		),
		event.locals.withRLS((db) =>
			db.select().from(projectReference).where(eq(projectReference.projectId, projectId)).orderBy(asc(projectReference.citeKey))
		),
		event.locals.withRLS((db) =>
			db.select().from(projectPhoto).where(eq(projectPhoto.projectId, projectId))
		),
		event.locals.withRLS((db) =>
			db
				.select({
					id: comment.id,
					documentId: comment.documentId,
					parentCommentId: comment.parentCommentId,
					type: comment.type,
					content: comment.content,
					status: comment.status,
					anchorText: comment.anchorText,
					lineStart: comment.lineStart,
					lineEnd: comment.lineEnd,
					createdAt: comment.createdAt,
					authorEmail: user.email,
					authorName: user.name,
					authorOrcid: userProfile.orcid
				})
				.from(comment)
				.innerJoin(document, eq(document.id, comment.documentId))
				.innerJoin(user, eq(user.id, comment.authorId))
				.leftJoin(userProfile, eq(userProfile.userId, comment.authorId))
				.where(eq(document.projectId, projectId))
				.orderBy(asc(comment.createdAt))
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

	// Group comments by documentId, nest replies under their parent
	type CommentRow = typeof allComments[number];
	function serializeComment(c: CommentRow, replies: CommentRow[]) {
		const entry: Record<string, unknown> = {
			type: c.type,
			content: c.content,
			status: c.status,
			created_at: c.createdAt.toISOString(),
			author_email: c.authorEmail,
			author_name: c.authorName
		};
		if (c.authorOrcid) entry.author_orcid = c.authorOrcid;
		if (c.anchorText) entry.anchor_text = c.anchorText;
		if (c.lineStart != null) entry.line_start = c.lineStart;
		if (c.lineEnd != null) entry.line_end = c.lineEnd;
		if (replies.length > 0) {
			entry.replies = replies.map((r) => serializeComment(r, []));
		}
		return entry;
	}

	const commentsByDoc = new Map<string, ReturnType<typeof serializeComment>[]>();
	const topLevel = allComments.filter((c) => !c.parentCommentId);
	const replies = allComments.filter((c) => !!c.parentCommentId);

	for (const c of topLevel) {
		const children = replies.filter((r) => r.parentCommentId === c.id);
		const list = commentsByDoc.get(c.documentId) ?? [];
		list.push(serializeComment(c, children));
		commentsByDoc.set(c.documentId, list);
	}

	// For each document, fetch all committed versions
	const documentsWithVersions = await Promise.all(
		documents.map(async (doc) => {
			const versions = await event.locals.withRLS((db) =>
				db
					.select({
						versionNumber: documentVersion.versionNumber,
						changeDescription: documentVersion.changeDescription,
						createdAt: documentVersion.createdAt,
						content: documentVersion.content
					})
					.from(documentVersion)
					.where(eq(documentVersion.documentId, doc.id))
					.orderBy(asc(documentVersion.versionNumber))
			);

			const docComments = commentsByDoc.get(doc.id) ?? [];
			return {
				title: doc.title,
				type: doc.type,
				is_public: doc.isPublic,
				created_at: doc.createdAt.toISOString(),
				updated_at: doc.updatedAt.toISOString(),
				content: doc.draftContent ?? versions.at(-1)?.content ?? '',
				...(doc.draftContent !== null ? { has_unpublished_draft: true } : {}),
				versions: versions.map((v) => ({
					version: v.versionNumber,
					message: v.changeDescription ?? '',
					date: v.createdAt.toISOString(),
					content: v.content
				})),
				...(docComments.length > 0 ? { comments: docComments } : {})
			};
		})
	);

	const exportData = {
		scholio_export: {
			version: '1.0',
			exported_at: new Date().toISOString(),
			source: 'scholio.app'
		},
		project: {
			title: proj[0].title,
			description: proj[0].description ?? null,
			status: proj[0].status,
			created_at: proj[0].createdAt.toISOString()
		},
		collaborators: collaborators.map((c) => {
			const entry: Record<string, unknown> = {
				role: c.role,
				joined_at: c.joinedAt.toISOString(),
				email: c.email,
				name: c.name
			};
			if (c.orcid) entry.orcid = c.orcid;
			return entry;
		}),
		documents: documentsWithVersions,
		references: references.map((r) => ({
			cite_key: r.citeKey,
			type: r.type,
			title: r.title,
			authors: r.authors,
			year: r.year ?? null,
			abstract: r.abstract ?? null,
			doi: r.doi ?? null,
			url: r.url ?? null,
			journal: r.journal ?? null,
			volume: r.volume ?? null,
			issue: r.issue ?? null,
			pages: r.pages ?? null,
			publisher: r.publisher ?? null,
			booktitle: r.booktitle ?? null,
			school: r.school ?? null,
			institution: r.institution ?? null,
			note: r.note ?? null,
			reading_notes_doc_id: r.readingNotesDocId ?? null
		})).map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)))
	};

	const yaml = stringify(exportData, { lineWidth: 0 });
	const slug = proj[0].title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

	// Download photos from S3 and add to ZIP
	const zipFiles: Record<string, Uint8Array> = {};
	zipFiles['project.yaml'] = new TextEncoder().encode(yaml);

	if (photos.length > 0) {
		const s3 = await resolveProjectS3Config(projectId, event.locals.user!.id, event.locals.withRLS);

		await Promise.all(
			photos.map(async (photo) => {
				try {
					let bytes: Uint8Array;

					if (s3) {
						const client = createS3Client(s3);
						const response = await client.send(
							new GetObjectCommand({ Bucket: s3.bucket, Key: photo.key })
						);
						if (response.Body) {
							bytes = await (
								response.Body as unknown as { transformToByteArray(): Promise<Uint8Array> }
							).transformToByteArray();
						} else {
							return;
						}
					} else {
						// Public URL fallback
						const res = await fetch(photo.url);
						if (!res.ok) return;
						bytes = new Uint8Array(await res.arrayBuffer());
					}

					const ext = photo.filename.split('.').pop() ?? 'jpg';
					zipFiles[`photos/${photo.id}.${ext}`] = bytes;
				} catch {
					// Skip photos that fail to download — don't abort the whole export
				}
			})
		);
	}

	const zipped = zipSync(zipFiles, { level: 1 }); // level 1: fast, images are already compressed

	return new Response(zipped.buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${slug}-export.zip"`
		}
	});
};
