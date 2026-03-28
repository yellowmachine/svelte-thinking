// Shared AI configuration constants — safe to import in both client and server code.

export type AiTask = 'agent' | 'draft' | 'review' | 'requirements' | 'lookup';

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
	{ id: 'lookup', label: 'Lookup', description: 'Quick in-editor lookups (name suggestions, @@ trigger)' }
];

// Tasks for which each model is recommended (empty = no specific recommendation)
export const MODEL_RECOMMENDATIONS: Record<string, AiTask[]> = {
	'anthropic/claude-sonnet-4-5': ['agent', 'draft'],
	'anthropic/claude-haiku-4-5': ['review', 'requirements', 'lookup']
};

export const MODELS: { id: string; label: string; shortLabel: string; toolCalling: boolean }[] = [
	{ id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)', shortLabel: 'Haiku', toolCalling: true },
	{ id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', shortLabel: 'Sonnet', toolCalling: true },
	{ id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (fast)', shortLabel: 'GPT-4o mini', toolCalling: true },
	{ id: 'openai/gpt-4o', label: 'GPT-4o', shortLabel: 'GPT-4o', toolCalling: true },
	{ id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5 (fast)', shortLabel: 'Gemini Flash', toolCalling: true },
	{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', shortLabel: 'Llama 3.3', toolCalling: true },
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
