import { describe, it, expect } from 'vitest';
import { AI_TASKS, MODEL_FAMILIES, MODEL_RECOMMENDATIONS } from './ai-config';

const familyOf = (id: string) => MODEL_FAMILIES.filter((f) => f.pattern.test(id)).map((f) => f.key);

describe('MODEL_FAMILIES', () => {
	it.each([
		['anthropic/claude-fable-5.2', 'claude-fable'],
		['anthropic/claude-haiku-5.5', 'claude-haiku'],
		['google/gemini-2.5-pro', 'gemini-pro'],
		['google/gemini-4-carbon', 'gemini-pro'],
		['google/gemini-4-argon', 'gemini-pro'],
		['google/gemini-3.8-flash', 'gemini-flash'],
		['openai/gpt-6.1-sol', 'gpt-sol'],
		['openai/gpt-6-luna', 'gpt-luna'],
		['deepseek/deepseek-v4-pro', 'deepseek-pro'],
		['deepseek/deepseek-v4.1-flash', 'deepseek-flash']
	])('%s belongs to %s only', (id, family) => {
		expect(familyOf(id)).toEqual([family]);
	});

	it.each([
		'anthropic/claude-haiku-5.5:batch',
		'google/gemini-3.5-flash-lite',
		'google/gemini-3.1-pro-preview',
		'openai/gpt-6.1-sol-pro',
		'openai/gpt-6.1-terra',
		'deepseek/deepseek-v4-pro-0813',
		'deepseek/deepseek-v4.1-flash-1017'
	])('%s (a variant, not the plain line) belongs to no family', (id) => {
		expect(familyOf(id)).toEqual([]);
	});

	it("gives every task's default family a definition", () => {
		const keys = new Set(MODEL_FAMILIES.map((f) => f.key));
		for (const task of AI_TASKS) expect(keys).toContain(task.defaultFamily);
		for (const key of Object.keys(MODEL_RECOMMENDATIONS)) expect(keys).toContain(key);
	});
});
