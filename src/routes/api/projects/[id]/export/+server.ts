import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stringify } from 'yaml';
import { zipSync } from 'fflate';
import { eq, asc } from 'drizzle-orm';
import { project, projectCollaborator } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { projectPhoto } from '$lib/server/db/schemas/photos.schema';
import { user } from '$lib/server/db/auth.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { createS3Client } from '$lib/server/storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const GET: RequestHandler = async (event) => {
	const projectId = event.params.id;

	const [proj, documents, collaborators, references, photos] = await Promise.all([
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
		)
	]);

	if (!proj[0]) error(404, 'Proyecto no encontrado');

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
				}))
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
