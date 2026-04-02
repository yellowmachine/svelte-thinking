// Shared AI configuration constants — safe to import in both client and server code.

export type AiTask = 'agent' | 'draft' | 'review' | 'requirements' | 'lookup' | 'bibliography' | 'spell';

export interface TaskConfig {
	keyId: string;
	model: string;
}

export type AiTaskConfig = Partial<Record<AiTask, TaskConfig>>;

export const AI_TASKS: { id: AiTask; label: string; description: string }[] = [
	{ id: 'agent', label: 'Agent (chat)', description: 'Conversational assistant with tool use' },
	{ id: 'draft', label: 'Draft', description: 'Generate document drafts and sections' },
	{ id: 'review', label: 'Review', description: 'Review and give feedback on documents' },
	{ id: 'requirements', label: 'Requirements', description: 'Generate project requirements' },
	{ id: 'lookup', label: 'Lookup', description: 'Quick in-editor lookups (name suggestions, @@ trigger)' },
	{ id: 'bibliography', label: 'Bibliography', description: 'Extract bibliographic metadata from a URL' },
	{ id: 'spell', label: 'Spell check', description: 'On-demand spelling and grammar correction' }
];

// Tasks for which each model is recommended (empty = no specific recommendation)
// TODO issue #18: move to DB table so models can be added without redeploy
export const MODEL_RECOMMENDATIONS: Record<string, AiTask[]> = {
	'anthropic/claude-opus-4-5': ['agent', 'draft'],
	'anthropic/claude-sonnet-4-6': ['agent', 'draft', 'review'],
	'anthropic/claude-haiku-4-5': ['lookup', 'bibliography'],
	'google/gemini-2.5-pro-preview': ['draft', 'review'],
	'google/gemini-2.5-flash-preview': ['requirements', 'lookup'],
	'openai/gpt-4o': ['agent', 'draft'],
	'openai/o3-mini': ['review'],
	'deepseek/deepseek-r1': ['review', 'requirements'],
	'deepseek/deepseek-chat': ['draft', 'requirements', 'lookup']
};

export const MODELS: { id: string; label: string; shortLabel: string; toolCalling: boolean }[] = [
	// Anthropic
	{ id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4 (best quality)', shortLabel: 'Opus 4', toolCalling: true },
	{ id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', shortLabel: 'Sonnet 4.6', toolCalling: true },
	{ id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)', shortLabel: 'Haiku 4.5', toolCalling: true },
	// Google
	{ id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro (long context)', shortLabel: 'Gemini 2.5 Pro', toolCalling: true },
	{ id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash (fast)', shortLabel: 'Gemini 2.5 Flash', toolCalling: true },
	// OpenAI
	{ id: 'openai/gpt-4o', label: 'GPT-4o', shortLabel: 'GPT-4o', toolCalling: true },
	{ id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (fast)', shortLabel: 'GPT-4o mini', toolCalling: true },
	{ id: 'openai/o3-mini', label: 'o3-mini (formal reasoning)', shortLabel: 'o3-mini', toolCalling: false },
	// DeepSeek
	{ id: 'deepseek/deepseek-r1', label: 'DeepSeek R1 (reasoning, affordable)', shortLabel: 'DeepSeek R1', toolCalling: false },
	{ id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (affordable)', shortLabel: 'DeepSeek V3', toolCalling: true },
	// Meta
	{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (open source)', shortLabel: 'Llama 3.3', toolCalling: true },
	// Perplexity (web search — no tool calling support)
	{ id: 'perplexity/sonar', label: 'Perplexity Sonar (web search, fast)', shortLabel: 'Sonar', toolCalling: false },
	{ id: 'perplexity/sonar-pro', label: 'Perplexity Sonar Pro (web search)', shortLabel: 'Sonar Pro', toolCalling: false }
];

export const MODEL_SHORT_LABEL = Object.fromEntries(MODELS.map((m) => [m.id, m.shortLabel]));

export const TOOL_CALLING_MODELS = new Set(MODELS.filter((m) => m.toolCalling).map((m) => m.id));

export function parseTaskConfig(raw: string | null): AiTaskConfig {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as AiTaskConfig;
	} catch {
		return {};
	}
}
