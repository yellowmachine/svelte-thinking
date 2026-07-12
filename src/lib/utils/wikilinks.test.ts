import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id';
import { processWikilinks, protectTocPlaceholder, restoreToc } from './wikilinks';

marked.use(gfmHeadingId());

describe('processWikilinks: [[#Heading]] anchors', () => {
	it('matches the real heading id for accented text', () => {
		// Real id, generated exactly as markdownRenderer.ts/MarkdownPreview.svelte do
		const html = marked.parse('# Introducción');
		const realId = (html as string).match(/id="([^"]+)"/)?.[1];

		const resolved = processWikilinks('See [[#Introducción]] for details.', new Map());
		const linkedHref = resolved.match(/\(#([^)]+)\)/)?.[1];

		expect(linkedHref).toBe(realId);
	});
});

describe('[[index:toc]]', () => {
	it('is replaced with a nav listing the document headings, in order, with real ids', () => {
		const markdown = '[[index:toc]]\n\n# Intro\n\nHi\n\n## Sub Section\n\nMore\n\n# Conclusión';

		const protected_ = protectTocPlaceholder(markdown);
		expect(protected_).toContain('<!--toc-->');
		expect(protected_).not.toContain('[[index:toc]]');

		const html = marked.parse(protected_) as string;
		const withToc = restoreToc(html, getHeadingList());

		expect(withToc).not.toContain('<!--toc-->');
		expect(withToc).toContain('<nav class="toc">');
		// Order preserved, level classes present, links point at the real ids
		const introIdx = withToc.indexOf('href="#intro"');
		const subIdx = withToc.indexOf('toc-level-2');
		const conclusionIdx = withToc.indexOf('href="#conclusión"');
		expect(introIdx).toBeGreaterThan(-1);
		expect(subIdx).toBeGreaterThan(introIdx);
		expect(conclusionIdx).toBeGreaterThan(subIdx);
	});

	it('leaves content unchanged when the tag is not present', () => {
		const markdown = '# Just a heading\n\nNo toc tag here.';
		expect(protectTocPlaceholder(markdown)).toBe(markdown);
	});

	it('does not fire inside a fenced code block', () => {
		const markdown = '```\n[[index:toc]]\n```';
		expect(protectTocPlaceholder(markdown)).toBe(markdown);
	});
});
