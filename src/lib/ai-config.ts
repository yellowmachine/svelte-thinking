// Shared AI configuration constants — safe to import in both client and server code.

export type AiTask =
	| 'agent'
	| 'draft'
	| 'review'
	| 'requirements'
	| 'bibliography'
	| 'spell'
	| 'grammar'
	| 'summary';

export interface TaskConfig {
	keyId: string;
	model: string;
}

export type AiTaskConfig = Partial<Record<AiTask, TaskConfig>>;

export const AI_TASKS: {
	id: AiTask;
	label: string;
	description: string;
	hint: string;
	defaultFamily: string;
}[] = [
	{
		id: 'agent',
		label: 'Agent (chat)',
		description: 'Conversational assistant with tool use',
		hint: 'Needs tool calling support. A capable model like Sonnet or GPT-4o works best — it reasons, searches, and takes actions across your project.',
		defaultFamily: 'claude-sonnet'
	},
	{
		id: 'draft',
		label: 'Draft',
		description: 'Generate document drafts and sections',
		hint: 'Benefits from a high-quality, long-context model. Gemini 2.5 Pro or Claude Sonnet handle long documents well.',
		defaultFamily: 'claude-sonnet'
	},
	{
		id: 'review',
		label: 'Review',
		description: 'Review and give feedback on documents',
		hint: 'A reasoning-focused model gives better structured feedback. DeepSeek R1 or o3-mini are strong and affordable choices.',
		defaultFamily: 'deepseek-r1'
	},
	{
		id: 'requirements',
		label: 'Requirements',
		description: 'Generate project requirements',
		hint: 'Needs structured output and logical thinking. Gemini Flash or DeepSeek V3 offer a good speed/quality balance.',
		defaultFamily: 'gemini-flash'
	},
	{
		id: 'bibliography',
		label: 'Bibliography',
		description: 'Extract bibliographic metadata from a URL',
		hint: 'Simple extraction task — a fast, cheap model like Haiku is more than enough.',
		defaultFamily: 'claude-haiku'
	},
	{
		id: 'spell',
		label: 'Spell check',
		description: 'On-demand spelling and grammar correction',
		hint: 'Lightweight task. Any fast model works well; no need for a large or expensive one.',
		defaultFamily: 'claude-haiku'
	},
	{
		id: 'grammar',
		label: 'Grammar assistant',
		description: 'Grammar and style suggestions for non-native English writers',
		hint: 'Lightweight task. Haiku or Gemini Flash are ideal — fast and accurate enough for grammar corrections.',
		defaultFamily: 'claude-haiku'
	},
	{
		id: 'summary',
		label: 'Document summary',
		description: 'AI summary generated on each commit for the project chat agent',
		hint: 'Runs once per commit in the background. A fast, cheap model like Haiku is ideal — the summary is short and factual.',
		defaultFamily: 'claude-haiku'
	}
];

// Model families — resolved dynamically against OpenRouter's live catalog
// (see src/lib/server/openrouter.ts) instead of pinning exact ids, which drift
// as OpenRouter renames/retires versions. Patterns are anchored ($) so they only
// match the plain stable variant of a line (e.g. not "-preview" or "-image").
export const MODEL_FAMILIES: { key: string; pattern: RegExp; label: string; shortLabel: string }[] =
	[
		{
			key: 'claude-opus',
			pattern: /^anthropic\/claude-opus-[\d.]+$/,
			label: 'Claude Opus (best quality)',
			shortLabel: 'Opus'
		},
		{
			key: 'claude-sonnet',
			pattern: /^anthropic\/claude-sonnet-[\d.]+$/,
			label: 'Claude Sonnet',
			shortLabel: 'Sonnet'
		},
		{
			key: 'claude-haiku',
			pattern: /^anthropic\/claude-haiku-[\d.]+$/,
			label: 'Claude Haiku (fast)',
			shortLabel: 'Haiku'
		},
		{
			key: 'gemini-pro',
			pattern: /^google\/gemini-[\d.]+-pro$/,
			label: 'Gemini Pro (long context)',
			shortLabel: 'Gemini Pro'
		},
		{
			key: 'gemini-flash',
			pattern: /^google\/gemini-[\d.]+-flash$/,
			label: 'Gemini Flash (fast)',
			shortLabel: 'Gemini Flash'
		},
		{
			key: 'gpt-4o',
			pattern: /^openai\/gpt-4o$/,
			label: 'GPT-4o',
			shortLabel: 'GPT-4o'
		},
		{
			key: 'gpt-4o-mini',
			pattern: /^openai\/gpt-4o-mini$/,
			label: 'GPT-4o mini (fast)',
			shortLabel: 'GPT-4o mini'
		},
		{
			key: 'o3-mini',
			pattern: /^openai\/o3-mini$/,
			label: 'o3-mini (formal reasoning)',
			shortLabel: 'o3-mini'
		},
		{
			key: 'deepseek-r1',
			pattern: /^deepseek\/deepseek-r1$/,
			label: 'DeepSeek R1 (reasoning, affordable)',
			shortLabel: 'DeepSeek R1'
		},
		{
			key: 'deepseek-chat',
			pattern: /^deepseek\/deepseek-chat$/,
			label: 'DeepSeek V3 (affordable)',
			shortLabel: 'DeepSeek V3'
		},
		{
			key: 'llama-3.3-70b',
			pattern: /^meta-llama\/llama-3\.3-70b-instruct$/,
			label: 'Llama 3.3 70B (open source)',
			shortLabel: 'Llama 3.3'
		},
		{
			key: 'sonar',
			pattern: /^perplexity\/sonar$/,
			label: 'Perplexity Sonar (web search, fast)',
			shortLabel: 'Sonar'
		},
		{
			key: 'sonar-pro',
			pattern: /^perplexity\/sonar-pro$/,
			label: 'Perplexity Sonar Pro (web search)',
			shortLabel: 'Sonar Pro'
		}
	];

// Tasks for which each model family is recommended (empty = no specific recommendation)
export const MODEL_RECOMMENDATIONS: Record<string, AiTask[]> = {
	'claude-opus': ['agent', 'draft'],
	'claude-sonnet': ['agent', 'draft', 'review'],
	'claude-haiku': ['bibliography', 'spell', 'grammar', 'summary'],
	'gemini-pro': ['draft', 'review'],
	'gemini-flash': ['requirements', 'summary'],
	'gpt-4o': ['agent', 'draft'],
	'o3-mini': ['review'],
	'deepseek-r1': ['review', 'requirements'],
	'deepseek-chat': ['draft', 'requirements']
};

// Best-effort display label for an arbitrary (possibly historical, possibly no
// longer "current") model id — e.g. usage logs and past conversations reference
// exact ids that may not be in the live catalog anymore. No lookup table needed.
export function formatModelSlug(id: string): string {
	const slug = id.split('/').pop() ?? id;
	return slug.replaceAll('-', ' ');
}

export function parseTaskConfig(raw: string | null): AiTaskConfig {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as AiTaskConfig;
	} catch {
		return {};
	}
}
