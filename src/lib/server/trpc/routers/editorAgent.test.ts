/**
 * Tests for the document editor's agent loop (runEditorAgentLoopSSE) — in
 * particular the insert_index tool, which lets non-technical users ask in
 * plain language ("add me the index", "añádeme el índice onomástico") and
 * have the agent insert [[index:toc]] / [[index:persons]] without ever
 * needing to type the special bracket syntax themselves.
 *
 * There's no OpenRouter API key configured in this dev environment, so this
 * mocks the streaming OpenRouter response (same SSE chunk shape
 * parseStreamingResponse expects) rather than calling a real model — it
 * verifies the real dispatch code path (tool schema → PendingEditorAction),
 * not the model's natural-language understanding.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runEditorAgentLoopSSE } from './ai';
import type { WithRLS } from './ai';

afterEach(() => {
	vi.restoreAllMocks();
});

// Builds a fetch mock resolving to a fake OpenRouter SSE stream that emits a
// single tool_calls chunk, matching the wire format parseStreamingResponse
// parses (see ai.ts:2028-2086).
function mockOpenRouterToolCallStream(toolName: string, args: Record<string, unknown>) {
	const chunk = {
		choices: [
			{
				delta: {
					tool_calls: [
						{
							index: 0,
							id: 'call-1',
							type: 'function',
							function: { name: toolName, arguments: '' }
						},
						{ index: 0, function: { arguments: JSON.stringify(args) } }
					]
				},
				finish_reason: null
			}
		]
	};
	const doneChunk = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };

	const sse = `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(doneChunk)}\n\ndata: [DONE]\n\n`;
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(sse));
			controller.close();
		}
	});

	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue({
			ok: true,
			body
		})
	);
}

const noopWithRLS: WithRLS = async (fn) => fn({} as never);

describe('runEditorAgentLoopSSE: insert_index tool', () => {
	it('proposes a table-of-contents insertion when the model calls insert_index with kind=toc', async () => {
		mockOpenRouterToolCallStream('insert_index', {
			kind: 'toc',
			explanation: 'Adding a table of contents at the top of the document.'
		});

		const result = await runEditorAgentLoopSSE(
			'Mi documento',
			'# Título\n\nContenido.',
			[],
			'añademe el índice',
			'fake-api-key',
			'anthropic/claude-sonnet-4.6',
			{
				spellApiKey: '',
				spellModel: '',
				spellLanguage: 'auto',
				grammarApiKey: '',
				grammarModel: '',
				withRLS: noopWithRLS,
				projectId: 'p1',
				documentId: 'd1'
			},
			() => {}
		);

		expect(result.pendingEditorActions).toEqual([
			{
				type: 'insert_index',
				kind: 'toc',
				explanation: 'Adding a table of contents at the top of the document.'
			}
		]);
	});

	it('proposes an onomastic index insertion when the model calls insert_index with kind=persons', async () => {
		mockOpenRouterToolCallStream('insert_index', {
			kind: 'persons',
			explanation: 'Adding the onomastic index at the end of the document.'
		});

		const result = await runEditorAgentLoopSSE(
			'Mi documento',
			'# Título\n\n[[person:Isaac Newton]] escribió esto.',
			[],
			'añademe el índice onomástico',
			'fake-api-key',
			'anthropic/claude-sonnet-4.6',
			{
				spellApiKey: '',
				spellModel: '',
				spellLanguage: 'auto',
				grammarApiKey: '',
				grammarModel: '',
				withRLS: noopWithRLS,
				projectId: 'p1',
				documentId: 'd1'
			},
			() => {}
		);

		expect(result.pendingEditorActions).toEqual([
			{
				type: 'insert_index',
				kind: 'persons',
				explanation: 'Adding the onomastic index at the end of the document.'
			}
		]);
	});
});
