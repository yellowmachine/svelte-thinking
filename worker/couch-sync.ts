/**
 * CouchDB → PostgreSQL sync worker.
 *
 * Watches every `docs-<userId>` database in CouchDB and applies
 * draftContent changes to scholio.document in PostgreSQL.
 *
 * Run with: bun worker/couch-sync.ts
 * Bun auto-loads .env so no extra setup needed in dev.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { document } from '../src/lib/server/db/schemas/documents.schema';

// ── Config ────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const COUCHDB_URL = process.env.COUCHDB_URL?.replace(/\/$/, '');

if (!DATABASE_URL) throw new Error('DATABASE_URL required');
if (!COUCHDB_URL) throw new Error('COUCHDB_URL required');

// ── PostgreSQL ────────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL, { max: 3, idle_timeout: 30 });
const db = drizzle(sql, { schema: { document } });

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
	const res = await fetch(`${COUCHDB_URL}${path}`, {
		signal: AbortSignal.timeout(timeout)
	});
	if (!res.ok) throw new Error(`CouchDB ${path}: ${res.status} ${res.statusText}`);
	return res.json() as Promise<T>;
}

// ── PostgreSQL write ──────────────────────────────────────────────────────────

interface CouchDoc {
	documentId: string;
	content: string;
	updatedAt?: string;
}

async function applyChange(doc: CouchDoc) {
	const result = await db
		.update(document)
		.set({
			draftContent: doc.content,
			updatedAt: new Date(doc.updatedAt ?? new Date().toISOString())
		})
		.where(eq(document.id, doc.documentId));

	// result is an array of updated rows in drizzle/postgres-js
	return (result as unknown[]).length;
}

// ── Per-database watcher ──────────────────────────────────────────────────────

async function watchDatabase(dbName: string): Promise<never> {
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
				const doc = change.doc as Record<string, unknown>;
				if (typeof doc.documentId !== 'string' || typeof doc.content !== 'string') continue;

				try {
					const rows = await applyChange({
						documentId: doc.documentId,
						content: doc.content,
						updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined
					});
					if (rows > 0) {
						console.log(`[worker] ✓ ${dbName} → document ${doc.documentId}`);
					} else {
						// Document not in PG yet (created offline, not synced via tRPC)
						console.warn(`[worker] ⚠ ${dbName} → document ${doc.documentId} not found in PG — skipping`);
					}
				} catch (e) {
					console.error(`[worker] ✗ failed to apply doc ${doc.documentId}:`, e);
				}
			}

			if (data.last_seq) {
				since = data.last_seq;
				saveSeq(dbName, since);
			}
		} catch (e) {
			if (e instanceof Error && e.name === 'TimeoutError') {
				// Normal: longpoll timed out with no changes — loop immediately
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
	await sql.end();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await sql.end();
	process.exit(0);
});

console.log(`[worker] starting — CouchDB: ${COUCHDB_URL} | DB: ${DATABASE_URL.replace(/:\/\/.*@/, '://***@')}`);
await discoverAndWatch();

// Re-discover every 30s to pick up newly created user databases
setInterval(discoverAndWatch, 30_000);
