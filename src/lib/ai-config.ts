// Shared AI configuration constants — safe to import in both client and server code.

export type AiTask = 'agent' | 'draft' | 'review' | 'requirements';

export interface TaskConfig {
	keyId: string;
	model: string;
}

export type AiTaskConfig = Partial<Record<AiTask, TaskConfig>>;

export const AI_TASKS: { id: AiTask; label: string; description: string }[] = [
	{ id: 'agent', label: 'Agent (chat)', description: 'Conversational assistant with tool use' },
	{ id: 'draft', label: 'Draft', description: 'Generate document drafts and sections' },
	{ id: 'review', label: 'Review', description: 'Review and give feedback on documents' },
	{ id: 'requirements', label: 'Requirements', description: 'Generate project requirements' }
];

export const MODELS: { id: string; label: string; toolCalling: boolean }[] = [
	{ id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast)', toolCalling: true },
	{ id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5', toolCalling: true },
	{ id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (fast)', toolCalling: true },
	{ id: 'openai/gpt-4o', label: 'GPT-4o', toolCalling: true },
	{ id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5 (fast)', toolCalling: true },
	{ id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', toolCalling: true },
	{ id: 'perplexity/sonar', label: 'Perplexity Sonar (web search, fast)', toolCalling: false },
	{ id: 'perplexity/sonar-pro', label: 'Perplexity Sonar Pro (web search)', toolCalling: false }
];

export const TOOL_CALLING_MODELS = new Set(MODELS.filter((m) => m.toolCalling).map((m) => m.id));

export function parseTaskConfig(raw: string | null): AiTaskConfig {
	if (!raw) return {};
	try {
		return JSON.parse(raw) as AiTaskConfig;
	} catch {
		return {};
	}
}
