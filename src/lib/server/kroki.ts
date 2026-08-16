import { env } from '$env/dynamic/private';

const KROKI_URL = env.KROKI_URL ?? 'http://localhost:8005';

/**
 * Renders Mermaid source to an SVG string via a self-hosted Kroki instance.
 * Used server-side for PDF export, where the client-side `mermaid` package
 * (which needs a DOM) can't run. Throws on failure — callers decide how to
 * degrade (e.g. fall back to a text placeholder).
 */
export async function renderMermaidToSvgServer(code: string): Promise<string> {
	// Match the theme used by the client-side preview (MermaidPreview.svelte /
	// mermaidRender.ts) so the PDF looks consistent with the editor.
	//
	// htmlLabels: false forces plain SVG <text> instead of <foreignObject>-
	// wrapped HTML for node labels — Typst's SVG renderer (resvg) doesn't
	// support foreignObject, which otherwise silently drops all diagram text.
	// Must be top-level, not nested under "flowchart" — verified empirically
	// against this Kroki/Mermaid version; the nested form is accepted but
	// ignored.
	const source = `%%{init: {"theme":"neutral","htmlLabels":false}}%%\n${code}`;

	const res = await fetch(`${KROKI_URL}/mermaid/svg`, {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain' },
		body: source,
		signal: AbortSignal.timeout(10_000)
	});

	if (!res.ok) {
		throw new Error(`Kroki respondió ${res.status}: ${await res.text().catch(() => '')}`);
	}

	return res.text();
}
