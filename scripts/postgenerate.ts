/**
 * Runs automatically after `drizzle-kit generate`.
 *
 * Drizzle-kit emits `CREATE SCHEMA "scholio"` (without IF NOT EXISTS) in the
 * first migration. Since scripts/init.sh already creates the schema (needed to
 * run GRANT USAGE before any tables exist), re-running migrations from scratch
 * would fail with "schema already exists".
 *
 * This script patches every *.sql file in drizzle/ replacing:
 *   CREATE SCHEMA "X"  →  CREATE SCHEMA IF NOT EXISTS "X"
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dir = join(import.meta.dir, '..', 'drizzle');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

let patched = 0;

for (const file of files) {
	const path = join(dir, file);
	const original = readFileSync(path, 'utf8');
	// Match CREATE SCHEMA "name" that is NOT already guarded with IF NOT EXISTS
	const fixed = original.replace(
		/CREATE SCHEMA (?!IF NOT EXISTS)"([^"]+)"/g,
		'CREATE SCHEMA IF NOT EXISTS "$1"'
	);
	if (fixed !== original) {
		writeFileSync(path, fixed, 'utf8');
		console.log(`  patched: ${file}`);
		patched++;
	}
}

if (patched === 0) {
	console.log('  nothing to patch');
} else {
	console.log(`postgenerate: ${patched} file(s) patched`);
}
