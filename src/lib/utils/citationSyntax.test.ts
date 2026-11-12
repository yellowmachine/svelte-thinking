import { describe, it, expect } from 'vitest';
import { replaceCitations, citationToken } from './citationSyntax';

const latex = (t: string) => replaceCitations(t, (keys) => `\\cite{${keys.join(',')}}`);

describe('replaceCitations', () => {
	it('handles the canonical [[@key]] form without leaving brackets', () => {
		expect(latex('as shown [[@darwin1859]].')).toBe('as shown \\cite{darwin1859}.');
		expect(latex('[[@a2020; @b:2021]]')).toBe('\\cite{a2020,b:2021}');
	});

	it('still accepts the Pandoc [@key] form', () => {
		expect(latex('see [@gould1979; @dawkins1976]')).toBe('see \\cite{gould1979,dawkins1976}');
	});

	it('leaves wikilinks, footnotes and emails alone', () => {
		const text = '[[Introducción]] [^1] a@b.com [[person:Ana]]';
		expect(latex(text)).toBe(text);
	});

	it('builds the token the editor inserts', () => {
		expect(citationToken('smith2023')).toBe('[[@smith2023]]');
	});
});
