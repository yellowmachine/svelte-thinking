import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Librarian es una app independiente, con su propia base y su propio login:
// en Scholio no queda nada que la una (sesión compartida, schema, URLs).

// Fuera de la búsqueda: el README, que cuenta que ya no hay nada.
const IGNORED = new Set(['README.md', 'src/lib/no-librarian.test.ts']);

const trackedFiles = () =>
	execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' })
		.split('\n')
		.filter((f) => f && !IGNORED.has(f) && !f.startsWith('drizzle/meta/') && !f.endsWith('.lock'));

describe('sin rastro de Librarian', () => {
	it.each([/librarian/i, /crossSubDomainCookies/])('ningún fichero menciona %s', (pattern) => {
		const hits = trackedFiles().filter((file) => {
			try {
				return pattern.test(readFileSync(file, 'utf8'));
			} catch {
				return false; // borrado del árbol de trabajo o binario ilegible
			}
		});
		expect(hits).toEqual([]);
	});
});
