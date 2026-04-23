import { z } from 'zod';
import { eq, and, asc, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { env } from '$env/dynamic/private';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { router, protectedProcedure } from '../init';
import { reference, projectReference, referenceSubnote } from '$lib/server/db/schemas/references.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { parseBibtexFile, formatBibtexFile, generateCiteKey } from '$lib/utils/bibtex';
import type { Author } from '$lib/utils/bibtex';
import type { Db } from '$lib/server/db';
import { resolveTaskKey, OPENROUTER_URL, type WithRLS } from './ai';

const authorSchema = z.object({ first: z.string(), last: z.string() });

const referenceTypeValues = [
	'article',
	'book',
	'inproceedings',
	'incollection',
	'phdthesis',
	'mastersthesis',
	'techreport',
	'misc',
	'magisterial',
	'patristic',
	'scholastic',
	'biblical',
	'classical',
	'earlymodern',
	'film',
	'interview',
	'newspaper'
] as const;

const referenceInputSchema = z.object({
	citeKey: z.string().min(1).max(100),
	type: z.enum(referenceTypeValues),
	title: z.string().min(1).max(1000),
	authors: z.array(authorSchema).default([]),
	year: z.string().max(4).optional(),
	abstract: z.string().max(5000).optional(),
	doi: z.string().max(300).optional(),
	url: z.string().max(2000).optional(),
	note: z.string().max(1000).optional(),
	journal: z.string().max(500).optional(),
	volume: z.string().max(50).optional(),
	issue: z.string().max(50).optional(),
	pages: z.string().max(50).optional(),
	publisher: z.string().max(500).optional(),
	edition: z.string().max(100).optional(),
	address: z.string().max(300).optional(),
	isbn: z.string().max(50).optional(),
	editors: z.array(authorSchema).default([]),
	booktitle: z.string().max(500).optional(),
	organization: z.string().max(500).optional(),
	series: z.string().max(300).optional(),
	school: z.string().max(500).optional(),
	institution: z.string().max(500).optional(),
	reportNumber: z.string().max(100).optional(),
	extra: z.record(z.string(), z.string()).default({})
});

// ── Cite key uniqueness helper ────────────────────────────────────────────

async function ensureUniqueCiteKey(
	withRLS: (fn: (db: Db) => Promise<unknown>) => Promise<unknown>,
	userId: string,
	base: string,
	excludeId?: string
): Promise<string> {
	let key = base || 'ref';
	let suffixCode = 'a'.charCodeAt(0);

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const conflicts = (await withRLS((db) =>
			db
				.select({ id: reference.id })
				.from(reference)
				.where(and(eq(reference.userId, userId), eq(reference.citeKey, key)))
				.limit(1)
		)) as { id: string }[];

		const realConflicts = conflicts.filter((r) => r.id !== excludeId);
		if (realConflicts.length === 0) return key;

		key = base + String.fromCharCode(suffixCode++);
		if (suffixCode > 'z'.charCodeAt(0)) {
			key = base + Date.now();
			break;
		}
	}

	return key;
}

// ── Shared values mapper ──────────────────────────────────────────────────

function toDbValues(ref: z.infer<typeof referenceInputSchema>, citeKey: string) {
	return {
		citeKey,
		type: ref.type,
		title: ref.title,
		authors: ref.authors,
		year: ref.year ?? null,
		abstract: ref.abstract ?? null,
		doi: ref.doi ?? null,
		url: ref.url ?? null,
		note: ref.note ?? null,
		journal: ref.journal ?? null,
		volume: ref.volume ?? null,
		issue: ref.issue ?? null,
		pages: ref.pages ?? null,
		publisher: ref.publisher ?? null,
		edition: ref.edition ?? null,
		address: ref.address ?? null,
		isbn: ref.isbn ?? null,
		editors: ref.editors,
		booktitle: ref.booktitle ?? null,
		organization: ref.organization ?? null,
		series: ref.series ?? null,
		school: ref.school ?? null,
		institution: ref.institution ?? null,
		reportNumber: ref.reportNumber ?? null,
		extra: ref.extra
	} as const;
}

// ── Router ────────────────────────────────────────────────────────────────

export const referencesRouter = router({
	listAll: protectedProcedure.query(async ({ ctx }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: reference.id,
					projectId: projectReference.projectId,
					projectTitle: project.title,
					citeKey: reference.citeKey,
					type: reference.type,
					title: reference.title,
					authors: reference.authors,
					editors: reference.editors,
					year: reference.year,
					journal: reference.journal,
					booktitle: reference.booktitle,
					publisher: reference.publisher,
					doi: reference.doi,
					url: reference.url
				})
				.from(reference)
				.leftJoin(projectReference, eq(projectReference.referenceId, reference.id))
				.leftJoin(project, eq(project.id, projectReference.projectId))
				.where(eq(reference.userId, ctx.user.id))
				.orderBy(asc(reference.citeKey))
		) as Promise<
			{
				id: string;
				projectId: string | null;
				projectTitle: string | null;
				citeKey: string;
				type: string;
				title: string;
				authors: unknown;
				editors: unknown;
				year: string | null;
				journal: string | null;
				booktitle: string | null;
				publisher: string | null;
				doi: string | null;
				url: string | null;
			}[]
		>;
	}),

	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db
				.select({ ref: reference })
				.from(reference)
				.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
				.where(eq(projectReference.projectId, projectId))
				.orderBy(asc(reference.citeKey))
		).then((rows) => (rows as { ref: typeof reference.$inferSelect }[]).map((r) => r.ref));
	}),

	// Like `list` but includes subnotes — used by the document editor for citation autocomplete.
	listWithSubnotes: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.select({ ref: reference, subnote: referenceSubnote })
				.from(reference)
				.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
				.leftJoin(referenceSubnote, eq(referenceSubnote.referenceId, reference.id))
				.where(eq(projectReference.projectId, projectId))
				.orderBy(asc(reference.citeKey), asc(referenceSubnote.createdAt))
		) as { ref: typeof reference.$inferSelect; subnote: typeof referenceSubnote.$inferSelect | null }[];

		const refMap = new Map<string, typeof reference.$inferSelect & { subnotes: { slug: string; notes: string }[] }>();
		for (const row of rows) {
			if (!refMap.has(row.ref.id)) refMap.set(row.ref.id, { ...row.ref, subnotes: [] });
			if (row.subnote) refMap.get(row.ref.id)!.subnotes.push({ slug: row.subnote.slug, notes: row.subnote.notes });
		}
		return [...refMap.values()];
	}),

	create: protectedProcedure
		.input(z.object({ projectId: z.string(), reference: referenceInputSchema }))
		.mutation(async ({ ctx, input }) => {
			const { projectId, reference: refInput } = input;
			const uniqueKey = await ensureUniqueCiteKey(
				ctx.withRLS as Parameters<typeof ensureUniqueCiteKey>[0],
				ctx.user.id,
				refInput.citeKey
			);

			const refId = crypto.randomUUID();

			await ctx.withRLS(async (db) => {
				await db
					.insert(reference)
					.values({ id: refId, userId: ctx.user.id, ...toDbValues(refInput, uniqueKey) });
				await db
					.insert(projectReference)
					.values({ referenceId: refId, projectId });
			});

			const rows = (await ctx.withRLS((db) =>
				db.select().from(reference).where(eq(reference.id, refId)).limit(1)
			)) as (typeof reference.$inferSelect)[];

			return rows[0];
		}),

	update: protectedProcedure
		.input(z.object({ id: z.string(), projectId: z.string(), reference: referenceInputSchema }))
		.mutation(async ({ ctx, input }) => {
			const { id, reference: refInput } = input;
			const uniqueKey = await ensureUniqueCiteKey(
				ctx.withRLS as Parameters<typeof ensureUniqueCiteKey>[0],
				ctx.user.id,
				refInput.citeKey,
				id
			);

			const rows = (await ctx.withRLS((db) =>
				db
					.update(reference)
					.set({ ...toDbValues(refInput, uniqueKey), updatedAt: new Date() })
					.where(eq(reference.id, id))
					.returning()
			)) as (typeof reference.$inferSelect)[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: id }) => {
		// Fetch pdfKey and a projectId (for S3 resolution) before deleting
		const [row] = (await ctx.withRLS((db) =>
			db
				.select({
					pdfKey: reference.pdfKey,
					projectId: projectReference.projectId
				})
				.from(reference)
				.leftJoin(projectReference, eq(projectReference.referenceId, reference.id))
				.where(eq(reference.id, id))
				.limit(1)
		)) as { pdfKey: string | null; projectId: string | null }[];

		if (!row) throw new TRPCError({ code: 'NOT_FOUND' });

		await ctx.withRLS((db) =>
			db.delete(reference).where(eq(reference.id, id))
		);

		if (row.pdfKey && row.projectId) {
			const { resolveProjectS3Config } = await import('$lib/server/s3Storage');
			const { deleteFileWithConfig } = await import('$lib/server/storage');
			const s3 = await resolveProjectS3Config(row.projectId, ctx.user.id, ctx.withRLS).catch(() => null);
			if (s3) await deleteFileWithConfig(s3, row.pdfKey).catch(() => {});
		}

		return { id };
	}),

	// ── Attach/detach a reference from a project ─────────────────────────────

	attachToProject: protectedProcedure
		.input(z.object({ referenceId: z.string(), projectId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.insert(projectReference)
					.values({ referenceId: input.referenceId, projectId: input.projectId })
					.onConflictDoNothing()
			);
			return { ok: true };
		}),

	detachFromProject: protectedProcedure
		.input(z.object({ referenceId: z.string(), projectId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.delete(projectReference)
					.where(
						and(
							eq(projectReference.referenceId, input.referenceId),
							eq(projectReference.projectId, input.projectId)
						)
					)
			);
			return { ok: true };
		}),

	// ── Reading notes document ───────────────────────────────────────────────

	openReadingNotes: protectedProcedure
		.input(z.object({ refId: z.string(), projectId: z.string() }))
		.mutation(async ({ ctx, input: { refId, projectId } }) => {
			const [ref] = (await ctx.withRLS((db) =>
				db
					.select({
						id: reference.id,
						title: reference.title,
						authors: reference.authors,
						year: reference.year,
						readingNotesDocId: reference.readingNotesDocId
					})
					.from(reference)
					.where(eq(reference.id, refId))
					.limit(1)
			)) as {
				id: string;
				title: string;
				authors: { first: string; last: string }[];
				year: string | null;
				readingNotesDocId: string | null;
			}[];

			if (!ref) throw new TRPCError({ code: 'NOT_FOUND' });
			if (ref.readingNotesDocId) return { docId: ref.readingNotesDocId };

			const authorStr = ref.authors[0]
				? `${ref.authors[0].first} ${ref.authors[0].last}`.trim()
				: '';
			const content = `---\ntitle: ${ref.title}\nauthor: ${authorStr}\nyear: ${ref.year ?? ''}\n---\n\n`;
			const docTitle = ref.title.length > 80 ? ref.title.slice(0, 80) + '…' : ref.title;

			const docId = crypto.randomUUID();
			const versionId = crypto.randomUUID();
			const now = new Date().toISOString();

			await ctx.withRLS(async (db) => {
				await db.execute(
					sql`INSERT INTO scholio.document (id, project_id, title, type, draft_content, owner_user_id, created_at, updated_at)
					    VALUES (${docId}, ${projectId}, ${docTitle}, 'reading_note', ${content}, ${ctx.user.id}, ${now}::timestamptz, ${now}::timestamptz)`
				);
				await db.execute(
					sql`INSERT INTO scholio.document_version (id, document_id, content, version_number, change_description, created_by, created_at)
					    VALUES (${versionId}, ${docId}, ${content}, 1, 'Initial version', ${ctx.user.id}, ${now}::timestamptz)`
				);
				await db.execute(
					sql`UPDATE scholio.document SET current_version_id = ${versionId} WHERE id = ${docId}`
				);
				await db.execute(
					sql`UPDATE scholio.reference SET reading_notes_doc_id = ${docId}, updated_at = ${now}::timestamptz WHERE id = ${refId}`
				);
			});

			return { docId };
		}),

	// ── Bulk import from raw BibTeX text ─────────────────────────────────

	importBibtex: protectedProcedure
		.input(z.object({ projectId: z.string().optional(), raw: z.string().max(500_000) }))
		.mutation(async ({ ctx, input }) => {
			const { projectId, raw } = input;
			const parsed = parseBibtexFile(raw);

			if (parsed.length === 0) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'No se encontraron entradas BibTeX válidas.'
				});
			}

			let inserted = 0;
			let skipped = 0;

			for (const entry of parsed) {
				try {
					// Skip entries whose DOI already exists for this user
					if (entry.doi) {
						const existing = await ctx.withRLS((db) =>
							db.query.reference.findFirst({
								where: and(
									eq(reference.userId, ctx.user.id),
									eq(reference.doi, entry.doi!)
								),
								columns: { id: true }
							})
						);
						if (existing) {
							// Already in library — just ensure pivot link exists (if project given)
							if (projectId) {
								await ctx.withRLS((db) =>
									db
										.insert(projectReference)
										.values({ referenceId: (existing as { id: string }).id, projectId })
										.onConflictDoNothing()
								);
							}
							skipped++;
							continue;
						}
					}

					const baseKey = entry.citeKey || generateCiteKey(entry.authors, entry.year);
					const uniqueKey = await ensureUniqueCiteKey(
						ctx.withRLS as Parameters<typeof ensureUniqueCiteKey>[0],
						ctx.user.id,
						baseKey
					);

					const refId = crypto.randomUUID();
					await ctx.withRLS(async (db) => {
						await db.insert(reference).values({
							id: refId,
							userId: ctx.user.id,
							citeKey: uniqueKey,
							type: entry.type,
							title: entry.title || '(sin título)',
							authors: entry.authors as Author[],
							year: entry.year || null,
							abstract: entry.abstract || null,
							doi: entry.doi || null,
							url: entry.url || null,
							note: entry.note || null,
							journal: entry.journal || null,
							volume: entry.volume || null,
							issue: entry.issue || null,
							pages: entry.pages || null,
							publisher: entry.publisher || null,
							edition: entry.edition || null,
							address: entry.address || null,
							isbn: entry.isbn || null,
							editors: entry.editors as Author[],
							booktitle: entry.booktitle || null,
							organization: entry.organization || null,
							series: entry.series || null,
							school: entry.school || null,
							institution: entry.institution || null,
							reportNumber: entry.reportNumber || null,
							extra: entry.extra
						});
						if (projectId) {
							await db.insert(projectReference).values({ referenceId: refId, projectId });
						}
					});
					inserted++;
				} catch {
					skipped++;
				}
			}

			return { inserted, skipped };
		}),

	// ── Link references from another project (no-copy) ───────────────────

	importFromProject: protectedProcedure
		.input(z.object({
			sourceProjectId: z.string(),
			targetProjectId: z.string(),
			referenceIds: z.array(z.string()).optional()
		}))
		.mutation(async ({ ctx, input }) => {
			const { sourceProjectId, targetProjectId, referenceIds } = input;

			// Load source refs — withRLS ensures access to the source project
			const sourceRows = (await ctx.withRLS((db) =>
				db
					.select({ referenceId: projectReference.referenceId })
					.from(projectReference)
					.where(eq(projectReference.projectId, sourceProjectId))
			)) as { referenceId: string }[];

			const toLink = referenceIds
				? sourceRows.filter((r) => referenceIds.includes(r.referenceId))
				: sourceRows;

			if (toLink.length === 0) return { inserted: 0, skipped: 0 };

			// Filter out refs already linked to targetProject
			const existingRows = (await ctx.withRLS((db) =>
				db
					.select({ referenceId: projectReference.referenceId })
					.from(projectReference)
					.where(
						and(
							eq(projectReference.projectId, targetProjectId),
							inArray(projectReference.referenceId, toLink.map((r) => r.referenceId))
						)
					)
			)) as { referenceId: string }[];

			const existingSet = new Set(existingRows.map((r) => r.referenceId));
			const newLinks = toLink.filter((r) => !existingSet.has(r.referenceId));

			if (newLinks.length === 0) return { inserted: 0, skipped: toLink.length };

			await ctx.withRLS((db) =>
				db
					.insert(projectReference)
					.values(newLinks.map((r) => ({ referenceId: r.referenceId, projectId: targetProjectId })))
					.onConflictDoNothing()
			);

			return { inserted: newLinks.length, skipped: toLink.length - newLinks.length };
		}),

	// ── Generate PDF from the reference's URL via scipy ─────────────────────
	generatePdfFromUrl: protectedProcedure
		.input(z.object({ refId: z.string(), projectId: z.string() }))
		.mutation(async ({ ctx, input: { refId, projectId } }) => {
			const [ref] = (await ctx.withRLS((db) =>
				db
					.select({ url: reference.url })
					.from(reference)
					.where(eq(reference.id, refId))
					.limit(1)
			)) as { url: string | null }[];

			if (!ref?.url) return { pdfKey: null };

			try {
				const { scipy } = await import('$lib/server/scipy');
				console.info(`[generatePdfFromUrl] calling scipy for ref=${refId} url=${ref.url}`);
				const result = await scipy.pdfFromUrl(ref.url);
				if (!result.ok) {
					console.warn(`[generatePdfFromUrl] scipy returned ok=false for ref=${refId}:`, result);
					return { pdfKey: null };
				}

				const { resolveProjectS3Config } = await import('$lib/server/s3Storage');
				const { uploadFileWithConfig } = await import('$lib/server/storage');
				const s3 = await resolveProjectS3Config(projectId, ctx.user.id, ctx.withRLS);
				if (!s3) {
					console.warn(`[generatePdfFromUrl] no S3 config for project=${projectId}`);
					return { pdfKey: null };
				}

				const pdfBytes = Buffer.from(result.pdf, 'base64');
				const key = `projects/${projectId}/references/${refId}.pdf`;
				await uploadFileWithConfig(s3, key, pdfBytes, 'application/pdf');
				console.info(`[generatePdfFromUrl] PDF uploaded: ${key} (${Math.round(pdfBytes.length / 1024)} KB)`);

				await ctx.withRLS((db) =>
					db
						.update(reference)
						.set({ pdfKey: key, updatedAt: new Date() })
						.where(eq(reference.id, refId))
				);

				return { pdfKey: key };
			} catch (err) {
				console.error(`[generatePdfFromUrl] failed for ref=${refId}:`, err);
				return { pdfKey: null };
			}
		}),

	// ── Export all references as a .bib file string ───────────────────────

	exportBibtex: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		const refs = (await ctx.withRLS((db) =>
			db
				.select({ ref: reference })
				.from(reference)
				.innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
				.where(eq(projectReference.projectId, projectId))
				.orderBy(asc(reference.citeKey))
		)) as { ref: typeof reference.$inferSelect }[];

		return formatBibtexFile(
			refs.map(({ ref: r }) => ({
				...r,
				authors: (r.authors as Author[]) ?? [],
				editors: (r.editors as Author[]) ?? [],
				extra: (r.extra as Record<string, string>) ?? {}
			}))
		);
	}),

	// ── Fetch metadata from a URL via AI extraction ───────────────────────
	fetchUrl: protectedProcedure
		.input(z.object({ url: z.string().url().max(2000), projectId: z.string() }))
		.query(async ({ ctx, input }) => {
			const { url, projectId } = input;

			let text: string;
			let pageTitle: string | null = null;
			try {
				const res = await fetch(url, {
					headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scholio/1.0; +https://scholio.review)' },
					signal: AbortSignal.timeout(10_000)
				});
				if (!res.ok)
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `Could not fetch URL (HTTP ${res.status}).`
					});
				const html = await res.text();
				const { document } = parseHTML(html);
				const article = new Readability(document as unknown as Document).parse();
				text = article?.textContent?.trim() ?? '';
				pageTitle = article?.title ?? null;
			} catch (e) {
				if (e instanceof TRPCError) throw e;
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not fetch or parse the URL.' });
			}

			if (!text) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'No readable content found at that URL.'
				});
			}

			const truncated = text.slice(0, 8_000);

			const { apiKey, model } = await resolveTaskKey(
				ctx.withRLS as WithRLS,
				ctx.db as Db,
				ctx.user.id,
				'bibliography',
				projectId
			);

			const prompt = `Extract bibliographic metadata from the text below (source URL: ${url}).
Return ONLY a valid JSON object — no explanation, no markdown — with these fields (omit any you cannot determine):
{
  "type": "<article|book|inproceedings|incollection|phdthesis|mastersthesis|techreport|misc>",
  "title": "<string>",
  "authors": [{"first": "<string>", "last": "<string>"}],
  "year": "<4-digit string or null>",
  "abstract": "<string or null>",
  "journal": "<string or null>",
  "volume": "<string or null>",
  "issue": "<string or null>",
  "pages": "<string or null>",
  "publisher": "<string or null>",
  "booktitle": "<string or null>",
  "school": "<string or null>",
  "institution": "<string or null>"
}

Text:
${truncated}`;

			const aiRes = await fetch(OPENROUTER_URL, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
					'X-Title': 'Scholio'
				},
				body: JSON.stringify({
					model,
					messages: [{ role: 'user', content: prompt }],
					temperature: 0,
					max_tokens: 800
				}),
				signal: AbortSignal.timeout(30_000)
			});

			if (!aiRes.ok)
				throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI model error.' });

			const aiJson = (await aiRes.json()) as { choices: { message: { content: string } }[] };
			const content = aiJson.choices?.[0]?.message?.content ?? '';

			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (!jsonMatch)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Could not parse model response.'
				});

			let extracted: Record<string, unknown>;
			try {
				extracted = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
			} catch {
				throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Invalid JSON from model.' });
			}

			const authorsRaw = (extracted.authors ?? []) as { first?: string; last?: string }[];
			const authors: Author[] = authorsRaw
				.map((a) => ({ first: a.first ?? '', last: a.last ?? '' }))
				.filter((a) => a.last);

			const year = typeof extracted.year === 'string' && extracted.year ? extracted.year : null;
			const type = referenceTypeValues.includes(extracted.type as never)
				? (extracted.type as (typeof referenceTypeValues)[number])
				: 'misc';

			return {
				citeKey: generateCiteKey(authors, year ?? ''),
				type,
				title: (extracted.title as string) || pageTitle || '(no title)',
				authors,
				year,
				abstract: (extracted.abstract as string | null) ?? null,
				journal: (extracted.journal as string | null) ?? null,
				volume: (extracted.volume as string | null) ?? null,
				issue: (extracted.issue as string | null) ?? null,
				pages: (extracted.pages as string | null) ?? null,
				publisher: (extracted.publisher as string | null) ?? null,
				booktitle: (extracted.booktitle as string | null) ?? null,
				school: (extracted.school as string | null) ?? null,
				institution: (extracted.institution as string | null) ?? null,
				url
			};
		}),

	// ── Import an HTML page as a readonly document ────────────────────────
	importDocumentFromUrl: protectedProcedure
		.input(z.object({ url: z.string().url().max(2000), projectId: z.string(), title: z.string().min(1).max(255) }))
		.mutation(async ({ ctx, input }) => {
			const { url, projectId, title } = input;

			// Fetch and extract main content
			let markdown: string;
			try {
				const res = await fetch(url, {
					headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scholio/1.0; +https://scholio.review)' },
					signal: AbortSignal.timeout(15_000)
				});
				if (!res.ok)
					throw new TRPCError({ code: 'BAD_REQUEST', message: `Could not fetch URL (HTTP ${res.status}).` });
				const html = await res.text();
				const { document: dom } = parseHTML(html);
				const article = new Readability(dom as unknown as Document).parse();
				if (!article?.content)
					throw new TRPCError({ code: 'BAD_REQUEST', message: 'No readable content found at that URL.' });

				const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
				// Preserve footnote-style links rather than inlining them
				td.addRule('footnoteLinks', {
					filter: (node) => node.nodeName === 'A' && !!(node as HTMLAnchorElement).href,
					replacement: (content) => content || ''
				});
				markdown = td.turndown(article.content);
			} catch (e) {
				if (e instanceof TRPCError) throw e;
				throw new TRPCError({ code: 'BAD_REQUEST', message: 'Could not fetch or parse the URL.' });
			}

			// Create document + initial version
			return ctx.withRLS(async (db) => {
				const docId = crypto.randomUUID();
				const versionId = crypto.randomUUID();

				try {
					await db.insert(document).values({
						id: docId,
						projectId,
						title,
						type: 'paper',
						ownerUserId: ctx.user.id,
						generatedByAi: false,
						isReadonly: true
					});
				} catch (e: unknown) {
					if (e instanceof Error && e.message.includes('document_project_title_idx')) {
						throw new TRPCError({ code: 'CONFLICT', message: `Ya existe un documento con el título "${title}" en este proyecto.` });
					}
					throw e;
				}

				await db.insert(documentVersion).values({
					id: versionId,
					documentId: docId,
					content: markdown,
					versionNumber: 1,
					changeDescription: `Imported from ${url}`,
					createdBy: ctx.user.id
				});

				await db.update(document).set({ currentVersionId: versionId }).where(eq(document.id, docId));

				return { docId };
			});
		}),

	// ── Fetch metadata from a DOI via CrossRef ────────────────────────────
	fetchDoi: protectedProcedure
		.input(z.string().min(1).max(300))
		.query(async ({ input: doi }) => {
			const normalized = doi
				.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
				.trim();

			let data: Record<string, unknown>;
			try {
				const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(normalized)}`, {
					headers: { 'User-Agent': 'Scholio/1.0 (https://scholio.review; mailto:support@scholio.review)' },
					signal: AbortSignal.timeout(8000)
				});
				if (!res.ok) throw new TRPCError({ code: 'NOT_FOUND', message: 'DOI not found in CrossRef.' });
				const json = await res.json() as { message: Record<string, unknown> };
				data = json.message;
			} catch (e) {
				if (e instanceof TRPCError) throw e;
				throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not reach CrossRef.' });
			}

			const titleArr = data['title'] as string[] | undefined;
			const title = titleArr?.[0] ?? '(no title)';

			const authorsRaw = (data['author'] ?? []) as { given?: string; family?: string }[];
			const authors: Author[] = authorsRaw.map((a) => ({
				first: a.given ?? '',
				last: a.family ?? ''
			})).filter((a) => a.last);

			const editorsRaw = (data['editor'] ?? []) as { given?: string; family?: string }[];
			const editors: Author[] = editorsRaw.map((a) => ({ first: a.given ?? '', last: a.family ?? '' })).filter((a) => a.last);

			const yearParts = (data['published'] as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0];
			const year = yearParts?.[0] ? String(yearParts[0]) : null;

			const type = (data['type'] as string | undefined);
			const refType: typeof referenceTypeValues[number] =
				type === 'journal-article' ? 'article'
				: type === 'book' ? 'book'
				: type === 'proceedings-article' ? 'inproceedings'
				: type === 'book-chapter' ? 'incollection'
				: 'misc';

			const journal = (data['container-title'] as string[] | undefined)?.[0] ?? null;
			const volume = data['volume'] as string | null ?? null;
			const issue = data['issue'] as string | null ?? null;
			const pages = data['page'] as string | null ?? null;
			const publisher = data['publisher'] as string | null ?? null;
			const abstractRaw = data['abstract'] as string | null ?? null;
			const abstract = abstractRaw ? abstractRaw.replace(/<[^>]+>/g, '').trim() : null;
			const url = `https://doi.org/${normalized}`;

			const citeKey = generateCiteKey(authors, year ?? '');

			return {
				citeKey,
				type: refType,
				title,
				authors,
				editors,
				year,
				journal,
				volume,
				issue,
				pages,
				publisher,
				abstract,
				doi: normalized,
				url
			};
		}),

	// ── Subnotes ──────────────────────────────────────────────────────────────

	listSubnotes: protectedProcedure
		.input(z.object({ referenceId: z.string() }))
		.query(async ({ ctx, input }) => {
			return (await ctx.withRLS((db) =>
				db
					.select()
					.from(referenceSubnote)
					.where(eq(referenceSubnote.referenceId, input.referenceId))
					.orderBy(asc(referenceSubnote.createdAt))
			)) as (typeof referenceSubnote.$inferSelect)[];
		}),

	addSubnote: protectedProcedure
		.input(z.object({
			referenceId: z.string(),
			slug: z.string().min(1).max(50).transform((s) =>
				s.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'note'
			),
			notes: z.string().max(10000).default('')
		}))
		.mutation(async ({ ctx, input }) => {
			const [row] = (await ctx.withRLS((db) =>
				db
					.insert(referenceSubnote)
					.values({ referenceId: input.referenceId, slug: input.slug, notes: input.notes })
					.onConflictDoNothing()
					.returning()
			)) as (typeof referenceSubnote.$inferSelect)[];
			if (!row) throw new TRPCError({ code: 'CONFLICT', message: `Slug "${input.slug}" already exists for this reference.` });
			return row;
		}),

	updateSubnote: protectedProcedure
		.input(z.object({ id: z.number(), notes: z.string().max(10000) }))
		.mutation(async ({ ctx, input }) => {
			const [row] = (await ctx.withRLS((db) =>
				db
					.update(referenceSubnote)
					.set({ notes: input.notes, updatedAt: new Date() })
					.where(eq(referenceSubnote.id, input.id))
					.returning()
			)) as (typeof referenceSubnote.$inferSelect)[];
			if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
			return row;
		}),

	deleteSubnote: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db.delete(referenceSubnote).where(eq(referenceSubnote.id, input.id))
			);
			return { id: input.id };
		}),
});
