import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { projectReference } from '$lib/server/db/schemas/references.schema';
import { parseBibtexFile, formatBibtexFile, generateCiteKey } from '$lib/utils/bibtex';
import type { Author } from '$lib/utils/bibtex';
import type { Db } from '$lib/server/db';

const authorSchema = z.object({ first: z.string(), last: z.string() });

const referenceTypeValues = [
	'article',
	'book',
	'inproceedings',
	'incollection',
	'phdthesis',
	'mastersthesis',
	'techreport',
	'misc'
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
	})
});
