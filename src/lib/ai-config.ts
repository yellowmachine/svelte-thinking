// Shared AI configuration constants — safe to import in both client and server code.

export type AiTask =
	| 'agent'
	| 'draft'
	| 'review'
	| 'requirements'
	| 'bibliography'
	| 'spell'
	| 'grammar'
	| 'summary'
	| 'moderate';

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
		hint: 'Needs tool calling support. A capable model like Claude Sonnet or GPT Sol works best — it reasons, searches, and takes actions across your project.',
		defaultFamily: 'claude-sonnet'
	},
	{
		id: 'draft',
		label: 'Draft',
		description: 'Generate document drafts and sections',
		hint: 'Benefits from a high-quality, long-context model. Gemini 4 or Claude Sonnet handle long documents well.',
		defaultFamily: 'claude-sonnet'
	},
	{
		id: 'review',
		label: 'Review',
		description: 'Review and give feedback on documents',
		hint: 'A strong model gives better structured feedback. Claude Sonnet or Gemini 4 are solid choices; DeepSeek Pro is a much cheaper alternative.',
		defaultFamily: 'claude-sonnet'
	},
	{
		id: 'requirements',
		label: 'Requirements',
		description: 'Generate project requirements',
		hint: 'Needs structured output and logical thinking. Gemini Flash or DeepSeek Flash offer a good speed/quality balance.',
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
	},
	{
		id: 'moderate',
		label: 'Blog comment moderation',
		description: 'Optional pre-check that flags spam/abuse on comments to your blog posts',
		hint: 'Only flags for your review — never auto-approves or auto-blocks. A fast, cheap model like Haiku is plenty.',
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
			key: 'claude-fable',
			pattern: /^anthropic\/claude-fable-[\d.]+$/,
			label: 'Claude Fable (most capable, priciest)',
			shortLabel: 'Fable'
		},
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
			// Google's top line: "gemini-x.y-pro" up to 3.x, named models (argon, carbon) since 4.
			key: 'gemini-pro',
			pattern: /^google\/gemini-(?:[\d.]+-pro|4-(?:argon|carbon))$/,
			label: 'Gemini 4 (long context)',
			shortLabel: 'Gemini 4'
		},
		{
			key: 'gemini-flash',
			pattern: /^google\/gemini-[\d.]+-flash$/,
			label: 'Gemini Flash (fast)',
			shortLabel: 'Gemini Flash'
		},
		{
			key: 'gpt-sol',
			pattern: /^openai\/gpt-[\d.]+-sol$/,
			label: 'GPT Sol (OpenAI flagship)',
			shortLabel: 'GPT Sol'
		},
		{
			key: 'gpt-luna',
			pattern: /^openai\/gpt-[\d.]+-luna$/,
			label: 'GPT Luna (fast, cheap)',
			shortLabel: 'GPT Luna'
		},
		{
			key: 'deepseek-pro',
			pattern: /^deepseek\/deepseek-v[\d.]+-pro$/,
			label: 'DeepSeek Pro (affordable)',
			shortLabel: 'DeepSeek Pro'
		},
		{
			key: 'deepseek-flash',
			pattern: /^deepseek\/deepseek-v[\d.]+-flash$/,
			label: 'DeepSeek Flash (very cheap)',
			shortLabel: 'DeepSeek Flash'
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
	'claude-fable': ['agent', 'draft'],
	'claude-opus': ['agent', 'draft'],
	'claude-sonnet': ['agent', 'draft', 'review'],
	'claude-haiku': ['bibliography', 'spell', 'grammar', 'summary', 'moderate'],
	'gemini-pro': ['draft', 'review'],
	'gemini-flash': ['requirements', 'summary'],
	'gpt-sol': ['agent', 'draft'],
	'gpt-luna': ['spell', 'grammar', 'summary'],
	'deepseek-pro': ['review', 'requirements'],
	'deepseek-flash': ['requirements', 'summary']
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
