/**
 * CouchDB → PostgreSQL sync worker.
 *
 * Watches every `docs-<userId>` database in CouchDB and applies
 * content + diff changes to PostgreSQL.
 *
 * Run with: bun worker/couch-sync.ts
 * Bun auto-loads .env so no extra setup needed in dev.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, ne, sql } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { z } from 'zod';
import { document } from '../src/lib/server/db/schemas/documents.schema';
import { comment } from '../src/lib/server/db/schemas/comments.schema';
import { referenceSubnote } from '../src/lib/server/db/schemas/references.schema';

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const COUCHDB_URL = process.env.COUCHDB_URL?.replace(/\/$/, '');

if (!DATABASE_URL) throw new Error('DATABASE_URL required');
if (!COUCHDB_URL) throw new Error('COUCHDB_URL required');

const _couchParsed = new URL(COUCHDB_URL);
const COUCH_AUTH = _couchParsed.username
	? `Basic ${btoa(`${_couchParsed.username}:${_couchParsed.password}`)}`
	: undefined;
const COUCH_BASE = `${_couchParsed.protocol}//${_couchParsed.host}`;

// ── PostgreSQL ────────────────────────────────────────────────────────────────

const sqlClient = postgres(DATABASE_URL, { max: 3, idle_timeout: 30 });
const db = drizzle(sqlClient, { schema: { document, comment, referenceSubnote } });

// ── Sequence persistence (survives restarts) ──────────────────────────────────

const SEQ_FILE = new URL('./.seqs.json', import.meta.url).pathname;

function loadSeqs(): Record<string, string> {
	if (!existsSync(SEQ_FILE)) return {};
	try { return JSON.parse(readFileSync(SEQ_FILE, 'utf-8')); } catch { return {}; }
}

function saveSeq(dbName: string, seq: string) {
	const seqs = loadSeqs();
	seqs[dbName] = seq;
	writeFileSync(SEQ_FILE, JSON.stringify(seqs, null, 2));
}

// ── CouchDB fetch helper ──────────────────────────────────────────────────────

async function couchGet<T = unknown>(path: string, timeout = 70_000): Promise<T> {
	const headers: Record<string, string> = {};
	if (COUCH_AUTH) headers['Authorization'] = COUCH_AUTH;
	const res = await fetch(`${COUCH_BASE}${path}`, {
		headers,
		signal: AbortSignal.timeout(timeout)
	});
	if (!res.ok) throw new Error(`CouchDB ${path}: ${res.status} ${res.statusText}`);
	return res.json() as Promise<T>;
}

// ── Diff schema ───────────────────────────────────────────────────────────────

const CommentCreateSchema = z.object({
	id: z.string().uuid(),
	type: z.enum(['general', 'inline']),
	content: z.string().min(1).max(10000),
	anchorText: z.string().optional(),
	anchorContext: z.string().max(2000).optional(),
	lineStart: z.number().int().nonnegative().optional(),
	lineEnd: z.number().int().nonnegative().optional(),
	characterStart: z.number().int().nonnegative().optional(),
	characterEnd: z.number().int().nonnegative().optional(),
	paragraphNumber: z.number().int().positive().optional(),
	parentCommentId: z.string().optional(),
	createdAt: z.string().datetime().optional()
});

const CommentUpdateSchema = z.object({
	id: z.string().uuid(),
	content: z.string().min(1).max(10000)
});

const CommentDeleteSchema = z.object({
	id: z.string().uuid()
});

const SubnoteUpsertSchema = z.object({
	referenceId: z.string(),
	slug: z.string().min(1).max(50).transform((s) =>
		s.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'note'
	),
	notes: z.string().max(10000)
});

const SubnoteDeleteSchema = z.object({
	referenceId: z.string(),
	slug: z.string()
});

const DiffSchema = z.object({
	comments: z.object({
		create: z.array(CommentCreateSchema).optional(),
		update: z.array(CommentUpdateSchema).optional(),
		delete: z.array(CommentDeleteSchema).optional()
	}).optional(),
	subnotes: z.object({
		upsert: z.array(SubnoteUpsertSchema).optional(),
		delete: z.array(SubnoteDeleteSchema).optional()
	}).optional()
});

// ── Document schema ───────────────────────────────────────────────────────────

const CouchDocSchema = z.object({
	documentId: z.string().uuid(),
	content: z.string(),
	updatedAt: z.string().datetime().optional(),
	diff: DiffSchema.optional()
});

type CouchDoc = z.infer<typeof CouchDocSchema>;

// ── Project ops schema ────────────────────────────────────────────────────────

const ProjectOpsSchema = z.object({
	projectId: z.string(),
	subnotes: z.object({
		upsert: z.array(SubnoteUpsertSchema).optional(),
		delete: z.array(SubnoteDeleteSchema).optional()
	}).optional()
});

type ProjectOps = z.infer<typeof ProjectOpsSchema>;

// ── Apply helpers ─────────────────────────────────────────────────────────────

async function applyChange(doc: CouchDoc, userId: string): Promise<number> {
	const updatedAt = new Date(doc.updatedAt ?? new Date().toISOString());
	const diff = doc.diff;

	return db.transaction(async (tx) => {
		const rows = await tx
			.update(document)
			.set({ draftContent: doc.content, updatedAt })
			.where(and(eq(document.id, doc.documentId), ne(document.updatedAt, updatedAt)))
			.returning({ id: document.id });

		if (!diff) return rows.length;

		const creates = diff.comments?.create ?? [];
		const updates = diff.comments?.update ?? [];
		const deletes = diff.comments?.delete ?? [];
		const subnoteUpserts = diff.subnotes?.upsert ?? [];
		const subnoteDeletes = diff.subnotes?.delete ?? [];

		for (const c of creates) {
			await tx
				.insert(comment)
				.values({
					id: c.id,
					documentId: doc.documentId,
					authorId: userId,
					type: c.type,
					content: c.content,
					anchorText: c.anchorText ?? null,
					anchorContext: c.anchorContext ?? null,
					lineStart: c.lineStart ?? null,
					lineEnd: c.lineEnd ?? null,
					characterStart: c.characterStart ?? null,
					characterEnd: c.characterEnd ?? null,
					paragraphNumber: c.paragraphNumber ?? null,
					parentCommentId: c.parentCommentId ?? null,
					createdAt: c.createdAt ? new Date(c.createdAt) : new Date()
				})
				.onConflictDoNothing({ target: comment.id });
		}

		for (const u of updates) {
			await tx
				.update(comment)
				.set({ content: u.content, updatedAt: new Date() })
				.where(and(eq(comment.id, u.id), eq(comment.authorId, userId)));
		}

		for (const d of deletes) {
			await tx
				.delete(comment)
				.where(and(eq(comment.id, d.id), eq(comment.authorId, userId)));
		}

		for (const s of subnoteUpserts) {
			await tx
				.insert(referenceSubnote)
				.values({ referenceId: s.referenceId, slug: s.slug, notes: s.notes })
				.onConflictDoUpdate({
					target: [referenceSubnote.referenceId, referenceSubnote.slug],
					set: { notes: s.notes, updatedAt: new Date() }
				});
		}

		for (const s of subnoteDeletes) {
			await tx
				.delete(referenceSubnote)
				.where(and(
					eq(referenceSubnote.referenceId, s.referenceId),
					eq(referenceSubnote.slug, s.slug)
				));
		}

		return rows.length;
	});
}

async function applyProjectOps(ops: ProjectOps): Promise<void> {
	const upserts = ops.subnotes?.upsert ?? [];
	const deletes = ops.subnotes?.delete ?? [];
	if (upserts.length === 0 && deletes.length === 0) return;

	await db.transaction(async (tx) => {
		for (const s of upserts) {
			await tx
				.insert(referenceSubnote)
				.values({ referenceId: s.referenceId, slug: s.slug, notes: s.notes })
				.onConflictDoUpdate({
					target: [referenceSubnote.referenceId, referenceSubnote.slug],
					set: { notes: s.notes, updatedAt: new Date() }
				});
		}
		for (const s of deletes) {
			await tx
				.delete(referenceSubnote)
				.where(and(
					eq(referenceSubnote.referenceId, s.referenceId),
					eq(referenceSubnote.slug, s.slug)
				));
		}
	});
}

// ── Per-database watcher ──────────────────────────────────────────────────────

async function watchDatabase(dbName: string): Promise<never> {
	const userId = dbName.slice('docs-'.length);
	const seqs = loadSeqs();
	let since: string = seqs[dbName] ?? '0';

	console.log(`[worker] watching ${dbName} (since=${since})`);

	// eslint-disable-next-line no-constant-condition
	while (true) {
		try {
			const path = `/${dbName}/_changes?feed=longpoll&include_docs=true&since=${encodeURIComponent(since)}&timeout=60000`;
			const data = await couchGet<{ results: Array<{ id: string; deleted?: boolean; doc?: Record<string, unknown> }>; last_seq: string }>(path, 70_000);

			for (const change of data.results ?? []) {
				if (change.deleted || !change.doc) continue;
				const docId = change.id as string;

				if (docId.startsWith('ops_')) {
					const parsed = ProjectOpsSchema.safeParse(change.doc);
					if (!parsed.success) {
						console.warn(`[worker] ⚠ ${dbName} skipping malformed ops doc ${docId}:`, parsed.error.flatten().fieldErrors);
						continue;
					}
					try {
						await applyProjectOps(parsed.data);
						console.log(`[worker] ✓ ${dbName} → ops ${parsed.data.projectId}`);
					} catch (e) {
						console.error(`[worker] ✗ failed to apply ops ${parsed.data.projectId}:`, e);
					}
					continue;
				}

				const parsed = CouchDocSchema.safeParse(change.doc);
				if (!parsed.success) {
					console.warn(`[worker] ⚠ ${dbName} skipping malformed doc ${docId}:`, parsed.error.flatten().fieldErrors);
					continue;
				}

				try {
					const rows = await applyChange(parsed.data, userId);
					const hasDiff = !!parsed.data.diff;
					if (rows > 0) {
						console.log(`[worker] ✓ ${dbName} → document ${parsed.data.documentId}${hasDiff ? ' +diff' : ''} | updatedAt=${parsed.data.updatedAt ?? 'now'}`);
					} else {
						console.log(`[worker] ~ ${dbName} → document ${parsed.data.documentId} already up-to-date${hasDiff ? ', diff applied' : ''}`);
					}
				} catch (e) {
					console.error(`[worker] ✗ failed to apply doc ${parsed.data.documentId}:`, e);
				}
			}

			if (data.last_seq) {
				since = data.last_seq;
				saveSeq(dbName, since);
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'TimeoutError') {
				continue;
			}
			console.error(`[worker] error on ${dbName}:`, e);
			await new Promise<void>((r) => setTimeout(r, 5_000));
		}
	}
}

// ── Database discovery ────────────────────────────────────────────────────────

const watching = new Set<string>();

async function discoverAndWatch() {
	try {
		const all = await couchGet<string[]>('/_all_dbs', 10_000);
		const docsDbs = all.filter((d) => d.startsWith('docs-'));

		for (const dbName of docsDbs) {
			if (watching.has(dbName)) continue;
			watching.add(dbName);
			watchDatabase(dbName).catch((e) => {
				console.error(`[worker] watcher for ${dbName} exited unexpectedly:`, e);
				watching.delete(dbName);
			});
		}
	} catch (e) {
		console.error('[worker] discovery error:', e);
	}
}

// ── Startup ───────────────────────────────────────────────────────────────────

process.on('SIGINT', async () => {
	console.log('[worker] shutting down…');
	await sqlClient.end();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await sqlClient.end();
	process.exit(0);
});

console.log(`[worker] starting — CouchDB: ${COUCHDB_URL} | DB: ${DATABASE_URL.replace(/:\/\/.*@/, '://***@')}`);
await discoverAndWatch();

setInterval(discoverAndWatch, 30_000);
