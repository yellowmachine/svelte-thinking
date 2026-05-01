import { describe, it, expect } from 'vitest';
import { parseNotebook, getContentCells } from './jupyter';

const minimalNotebook = {
	nbformat: 4,
	nbformat_minor: 5,
	metadata: {
		kernelspec: { display_name: 'Python 3', name: 'python3' },
		language_info: { name: 'python' }
	},
	cells: [
		{
			cell_type: 'markdown',
			source: ['# My analysis\n', 'Some intro text.'],
			outputs: [],
			execution_count: null
		},
		{
			cell_type: 'code',
			source: 'import pandas as pd\ndf = pd.read_csv("data.csv")',
			outputs: [
				{
					output_type: 'execute_result',
					execution_count: 1,
					data: { 'text/plain': '   col1  col2\n0     1     2' },
					metadata: {}
				}
			],
			execution_count: 1
		},
		{
			cell_type: 'code',
			source: 'print("hello")',
			outputs: [{ output_type: 'stream', name: 'stdout', text: 'hello\n' }],
			execution_count: 2
		},
		{
			cell_type: 'code',
			source: '1/0',
			outputs: [
				{
					output_type: 'error',
					ename: 'ZeroDivisionError',
					evalue: 'division by zero',
					traceback: []
				}
			],
			execution_count: 3
		},
		{
			cell_type: 'code',
			source: '',
			outputs: [],
			execution_count: null
		}
	]
};

describe('parseNotebook', () => {
	it('parses metadata', () => {
		const nb = parseNotebook(minimalNotebook);
		expect(nb.metadata.kernelName).toBe('Python 3');
		expect(nb.metadata.languageName).toBe('python');
		expect(nb.metadata.nbformat).toBe(4);
	});

	it('parses all cells', () => {
		const nb = parseNotebook(minimalNotebook);
		expect(nb.cells).toHaveLength(5);
	});

	it('joins source arrays', () => {
		const nb = parseNotebook(minimalNotebook);
		expect(nb.cells[0].source).toBe('# My analysis\nSome intro text.');
	});

	it('handles source as plain string', () => {
		const nb = parseNotebook(minimalNotebook);
		expect(nb.cells[1].source).toBe('import pandas as pd\ndf = pd.read_csv("data.csv")');
	});

	it('parses execute_result output', () => {
		const nb = parseNotebook(minimalNotebook);
		const output = nb.cells[1].outputs[0];
		expect(output.type).toBe('execute_result');
		expect(output.text).toBe('   col1  col2\n0     1     2');
	});

	it('parses stream output', () => {
		const nb = parseNotebook(minimalNotebook);
		const output = nb.cells[2].outputs[0];
		expect(output.type).toBe('stream');
		expect(output.text).toBe('hello\n');
	});

	it('parses error output', () => {
		const nb = parseNotebook(minimalNotebook);
		const output = nb.cells[3].outputs[0];
		expect(output.type).toBe('error');
		expect(output.errorName).toBe('ZeroDivisionError');
		expect(output.errorValue).toBe('division by zero');
	});

	it('throws on non-v4 notebooks', () => {
		expect(() => parseNotebook({ nbformat: 3, cells: [], metadata: {} })).toThrow(
			'Unsupported notebook format'
		);
	});

	it('throws on invalid input', () => {
		expect(() => parseNotebook('not an object')).toThrow('Invalid notebook');
		expect(() => parseNotebook(null)).toThrow('Invalid notebook');
	});
});

describe('getContentCells', () => {
	it('filters out empty cells', () => {
		const nb = parseNotebook(minimalNotebook);
		const cells = getContentCells(nb);
		expect(cells).toHaveLength(4); // empty cell excluded
	});
});
