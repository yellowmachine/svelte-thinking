import { z } from 'zod';
import { eq, and, asc, ilike } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { env } from '$env/dynamic/private';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { router, protectedProcedure } from '../init';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
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
	'earlymodern'
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
	projectId: string,
	base: string,
	excludeId?: string
): Promise<string> {
	let key = base || 'ref';
	let suffixCode = 'a'.charCodeAt(0);

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const conflicts = (await withRLS((db) =>
			db
				.select({ id: projectReference.id })
				.from(projectReference)
				.where(and(eq(projectReference.projectId, projectId), eq(projectReference.citeKey, key)))
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
					id: projectReference.id,
					projectId: projectReference.projectId,
					projectTitle: project.title,
					citeKey: projectReference.citeKey,
					type: projectReference.type,
					title: projectReference.title,
					authors: projectReference.authors,
					editors: projectReference.editors,
					year: projectReference.year,
					journal: projectReference.journal,
					booktitle: projectReference.booktitle,
					publisher: projectReference.publisher,
					doi: projectReference.doi,
					url: projectReference.url
				})
				.from(projectReference)
				.innerJoin(project, eq(projectReference.projectId, project.id))
				.orderBy(asc(projectReference.citeKey))
		) as Promise<
			{
				id: string;
				projectId: string;
				projectTitle: string;
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
				.select()
				.from(projectReference)
				.where(eq(projectReference.projectId, projectId))
				.orderBy(asc(projectReference.citeKey))
		) as Promise<(typeof projectReference.$inferSelect)[]>;
	}),

	create: protectedProcedure
		.input(z.object({ projectId: z.string(), reference: referenceInputSchema }))
		.mutation(async ({ ctx, input }) => {
			const { projectId, reference } = input;
			const uniqueKey = await ensureUniqueCiteKey(
				ctx.withRLS as Parameters<typeof ensureUniqueCiteKey>[0],
				projectId,
				reference.citeKey
			);

			const rows = (await ctx.withRLS((db) =>
				db
					.insert(projectReference)
					.values({ id: crypto.randomUUID(), projectId, ...toDbValues(reference, uniqueKey) })
					.returning()
			)) as (typeof projectReference.$inferSelect)[];

			return rows[0];
		}),

	update: protectedProcedure
		.input(z.object({ id: z.string(), projectId: z.string(), reference: referenceInputSchema }))
		.mutation(async ({ ctx, input }) => {
			const { id, projectId, reference } = input;
			const uniqueKey = await ensureUniqueCiteKey(
				ctx.withRLS as Parameters<typeof ensureUniqueCiteKey>[0],
				projectId,
				reference.citeKey,
				id
			);

			const rows = (await ctx.withRLS((db) =>
				db
					.update(projectReference)
					.set({ ...toDbValues(reference, uniqueKey), updatedAt: new Date() })
					.where(eq(projectReference.id, id))
					.returning()
			)) as (typeof projectReference.$inferSelect)[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: id }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.delete(projectReference)
				.where(eq(projectReference.id, id))
				.returning({ id: projectReference.id })
		)) as { id: string }[];

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	updateReadingNotes: protectedProcedure
		.input(z.object({ id: z.string(), readingNotes: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.update(projectReference)
					.set({ readingNotes: input.readingNotes || null, updatedAt: new Date() })
					.where(eq(projectReference.id, input.id))
					.returning({ id: projectReference.id })
			)) as { id: string }[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return rows[0];
		}),

	// ── Bulk import from raw BibTeX text ─────────────────────────────────

	importBibtex: protectedProcedure
		.input(z.object({ projectId: z.string(), raw: z.string().max(500_000) }))
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
					const baseKey = entry.citeKey || generateCiteKey(entry.authors, entry.year);
					const uniqueKey = await ensureUniqueCiteKey(
						ctx.withRLS as Parameters<typeof ensureUniqueCiteKey>[0],
						projectId,
						baseKey
					);

					await ctx.withRLS((db) =>
						db.insert(projectReference).values({
							id: crypto.randomUUID(),
							projectId,
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
						})
					);
					inserted++;
				} catch {
					skipped++;
				}
			}

			return { inserted, skipped };
		}),

	// ── Export all references as a .bib file string ───────────────────────

	exportBibtex: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		const refs = (await ctx.withRLS((db) =>
			db
				.select()
				.from(projectReference)
				.where(eq(projectReference.projectId, projectId))
				.orderBy(asc(projectReference.citeKey))
		)) as (typeof projectReference.$inferSelect)[];

		return formatBibtexFile(
			refs.map((r) => ({
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

			// 1. Fetch page and extract main text with Readability
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

			// Limit to ~8 000 chars to keep token cost reasonable
			const truncated = text.slice(0, 8_000);

			// 2. Resolve API key and model for the bibliography task
			const { apiKey, model } = await resolveTaskKey(
				ctx.withRLS as WithRLS,
				ctx.db as Db,
				ctx.user.id,
				'bibliography',
				projectId
			);

			// 3. Ask the model to extract bibliographic metadata
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

			// 4. Map to reference shape
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

	// ── Fetch metadata from a DOI via CrossRef ────────────────────────────
	fetchDoi: protectedProcedure
		.input(z.string().min(1).max(300))
		.query(async ({ input: doi }) => {
			// Normalize: strip URL prefix if present
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

			// Map CrossRef fields → reference shape
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
			// Strip JATS XML tags from abstract if present
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

	// ── Add passage from reading note ─────────────────────────────────────────
	// Creates a new reference (type 'book') or appends to readingNotes of an
	// existing one. Passage is stored as "> p.N — text" markdown block.

	addFromReadingNote: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				title: z.string().min(1).max(1000),
				authorRaw: z.string().max(300), // "First Last" — parsed server-side
				year: z.string().max(4).optional(),
				paragraph: z.string().min(1).max(5000),
				page: z.string().max(20).optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify project access
			const [proj] = (await ctx.withRLS((db) =>
				db.select({ id: project.id }).from(project).where(eq(project.id, input.projectId)).limit(1)
			)) as { id: string }[];
			if (!proj) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

			// Format passage entry for readingNotes
			const pagePrefix = input.page?.trim() ? `p. ${input.page.trim()} — ` : '';
			const passage = `> ${pagePrefix}"${input.paragraph.trim()}"`;

			// Check for existing reference with same title (case-insensitive)
			const [existing] = (await ctx.withRLS((db) =>
				db
					.select({ id: projectReference.id, readingNotes: projectReference.readingNotes })
					.from(projectReference)
					.where(
						and(
							eq(projectReference.projectId, input.projectId),
							ilike(projectReference.title, input.title.trim())
						)
					)
					.limit(1)
			)) as { id: string; readingNotes: string | null }[];

			if (existing) {
				const updated = ((existing.readingNotes?.trim() ?? '') + '\n\n' + passage).trimStart();
				await ctx.withRLS((db) =>
					db
						.update(projectReference)
						.set({ readingNotes: updated, updatedAt: new Date() })
						.where(eq(projectReference.id, existing.id))
				);
				return { created: false, id: existing.id };
			}

			// Parse "First Last" → {first, last}
			const parts = input.authorRaw.trim().split(/\s+/);
			const last = parts.length > 1 ? parts.pop()! : parts[0];
			const first = parts.join(' ');
			const authors = input.authorRaw.trim() ? [{ first, last }] : [];

			const baseKey = generateCiteKey(authors as Author[], input.year ?? '');
			const citeKey = await ensureUniqueCiteKey(ctx.withRLS, input.projectId, baseKey);

			const [created] = (await ctx.withRLS((db) =>
				db
					.insert(projectReference)
					.values({
						id: crypto.randomUUID(),
						projectId: input.projectId,
						citeKey,
						type: 'book',
						title: input.title.trim(),
						authors,
						year: input.year ?? null,
						readingNotes: passage
					})
					.returning({ id: projectReference.id })
			)) as { id: string }[];

			return { created: true, id: created.id };
		})
});
