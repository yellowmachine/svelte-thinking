export type NotebookCellType = 'code' | 'markdown' | 'raw';

export interface NotebookOutput {
	type: 'stream' | 'display_data' | 'execute_result' | 'error';
	text?: string;
	data?: Record<string, unknown>;
	errorName?: string;
	errorValue?: string;
}

export interface NotebookCell {
	type: NotebookCellType;
	source: string;
	outputs: NotebookOutput[];
	executionCount?: number | null;
}

export interface ParsedNotebook {
	metadata: {
		kernelName?: string;
		languageName?: string;
		nbformat: number;
	};
	cells: NotebookCell[];
}

function joinSource(source: string | string[]): string {
	return Array.isArray(source) ? source.join('') : source;
}

function parseOutputs(rawOutputs: unknown[]): NotebookOutput[] {
	return rawOutputs.map((o) => {
		const out = o as Record<string, unknown>;
		const outputType = out['output_type'] as string;

		if (outputType === 'stream') {
			return {
				type: 'stream' as const,
				text: joinSource(out['text'] as string | string[])
			};
		}

		if (outputType === 'error') {
			return {
				type: 'error' as const,
				errorName: out['ename'] as string,
				errorValue: out['evalue'] as string
			};
		}

		// display_data or execute_result — keep only text/plain, drop image/* base64 blobs
		const data = out['data'] as Record<string, unknown> | undefined;
		const plainText = data?.['text/plain'];
		return {
			type: outputType as 'display_data' | 'execute_result',
			text: plainText ? joinSource(plainText as string | string[]) : undefined
		};
	});
}

export function parseNotebook(json: unknown): ParsedNotebook {
	if (typeof json !== 'object' || json === null) {
		throw new Error('Invalid notebook: expected a JSON object');
	}

	const nb = json as Record<string, unknown>;
	const nbformat = nb['nbformat'] as number;

	if (nbformat !== 4) {
		throw new Error(`Unsupported notebook format: nbformat ${nbformat} (only v4 is supported)`);
	}

	const kernelspec = (nb['metadata'] as Record<string, unknown>)?.['kernelspec'] as
		| Record<string, unknown>
		| undefined;
	const languageInfo = (nb['metadata'] as Record<string, unknown>)?.['language_info'] as
		| Record<string, unknown>
		| undefined;

	const rawCells = (nb['cells'] as unknown[]) ?? [];

	const cells: NotebookCell[] = rawCells.map((c) => {
		const cell = c as Record<string, unknown>;
		return {
			type: cell['cell_type'] as NotebookCellType,
			source: joinSource(cell['source'] as string | string[]),
			outputs: parseOutputs((cell['outputs'] as unknown[]) ?? []),
			executionCount: cell['execution_count'] as number | null | undefined
		};
	});

	return {
		metadata: {
			kernelName: kernelspec?.['display_name'] as string | undefined,
			languageName: languageInfo?.['name'] as string | undefined,
			nbformat
		},
		cells
	};
}

/** Returns only the cells with actual content, skipping empty ones. */
export function getContentCells(notebook: ParsedNotebook): NotebookCell[] {
	return notebook.cells.filter((c) => c.source.trim().length > 0);
}
