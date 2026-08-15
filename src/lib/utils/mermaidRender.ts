// Shared Mermaid rendering — used by MarkdownPreview (embedded ```mermaid blocks)
// and MermaidPreview (the dedicated diagram editor's live preview pane).

let initialized = false;

async function getMermaid() {
	const { default: mermaid } = await import('mermaid');
	if (!initialized) {
		mermaid.initialize({
			startOnLoad: false,
			theme: 'neutral',
			fontFamily: '"Source Serif 4", Georgia, serif'
		});
		initialized = true;
	}
	return mermaid;
}

let renderIdx = 0;

/**
 * Renders Mermaid source to an SVG string. Throws on invalid syntax —
 * callers decide how to surface the error (inline message, etc).
 */
export async function renderMermaidToSvg(code: string): Promise<string> {
	const mermaid = await getMermaid();
	const { svg } = await mermaid.render(`mermaid-svg-${renderIdx++}`, code);
	return svg;
}
