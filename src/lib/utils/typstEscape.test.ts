import { describe, it, expect } from 'vitest';
import { escapeTypstLine, escapeTypstText, typstCitation } from './typstEscape';
import { markdownToTypst } from './markdownToTypst';

describe('escapeTypstLine', () => {
	it('escapes characters Typst reads as syntax', () => {
		expect(escapeTypstLine('write to a@b.com, cost #3 or <5 ~ $5')).toBe(
			'write to a\\@b.com, cost \\#3 or \\<5 \\~ \\$5'
		);
		expect(escapeTypstLine('and/or // not a comment /* nor this')).toBe(
			'and/or \\// not a comment \\/* nor this'
		);
	});

	it('keeps headings, URLs, link targets, inline code and placeholders', () => {
		expect(escapeTypstLine('## Results #1')).toBe('## Results \\#1');
		expect(escapeTypstLine('see https://x.org/a#b')).toBe('see https://x.org/a\\#b');
		expect(escapeTypstLine('[docs](https://x.org/#top)')).toBe('[docs](https://x.org/#top)');
		expect(escapeTypstLine('run `a@b #x` now')).toBe('run `a@b #x` now');
		expect(escapeTypstLine('%%IM0%% and %%CB12%%')).toBe('%%IM0%% and %%CB12%%');
	});

	it('works across lines', () => {
		expect(escapeTypstText('# T\nmail a@b.c')).toBe('# T\nmail a\\@b.c');
	});
});

describe('typstCitation', () => {
	it('cites known keys and prints unknown ones as text', () => {
		expect(typstCitation(['a', 'b'], new Set(['a']))).toBe('@a \\[b\\]');
		expect(typstCitation(['a', 'b'])).toBe('@a @b');
	});
});

describe('markdownToTypst', () => {
	it('produces compilable text for emails, money and citations', () => {
		const out = markdownToTypst(
			'# Intro\n\nMail a@b.com, it costs #5. See [[@smith2020]] and [[@nope]].',
			undefined,
			{
				citeKeys: new Set(['smith2020'])
			}
		);
		expect(out).toContain('= Intro');
		expect(out).toContain('a\\@b.com');
		expect(out).toContain('\\#5');
		expect(out).toContain('@smith2020');
		expect(out).toContain('\\[nope\\]');
		expect(out).not.toContain('[[');
	});

	it('keeps math and code intact', () => {
		const out = markdownToTypst('Energy $E = m c^2$ and `x@y`.\n\n```py\na = "#"\n```');
		expect(out).toContain('$E = m c^2$');
		expect(out).toContain('`x@y`');
		expect(out).toContain('a = "#"');
	});
});

describe('toTypst (single-document export)', () => {
	it('escapes text, keeps code and drops unknown citations to text', async () => {
		const { toTypst } = await import('./export');
		const { typst } = toTypst(
			'# A #1\n\nMail a@b.com [[@known]] [[@missing]]\n\n```js\nx = "#@"\n```',
			'Title @ #2',
			[{ citeKey: 'known', type: 'article', title: 'K', authors: [] } as never]
		);
		expect(typst).toContain('= A \\#1');
		expect(typst).toContain('a\\@b.com @known \\[missing\\]');
		expect(typst).toContain('x = "#@"');
		expect(typst).toContain('[Title \\@ \\#2]');
	});
});
