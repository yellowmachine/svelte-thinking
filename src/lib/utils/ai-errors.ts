/**
 * Classifies an AI-related error as a 'system' message (shown inline in chat)
 * or a 'banner' (shown in the transient error banner below the input).
 *
 * Known business errors (no credits, invalid key, rate limit, no key configured)
 * surface as system messages so they are persistent and contextualised in the
 * conversation. Unknown/technical errors stay as banners.
 */
export type AiErrorClass = 'system' | 'banner';

export function classifyAiError(e: unknown): { kind: AiErrorClass; message: string } {
	const code =
		e && typeof e === 'object' && 'data' in e
			? (e as { data?: { code?: string } }).data?.code
			: undefined;
	const msg =
		e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error.';

	if (code === 'PRECONDITION_FAILED') {
		return { kind: 'system', message: 'No API key configured. Go to Settings → AI Assistant to add one.' };
	}

	// Match OpenRouter business errors from throwProviderError (messages may be in Spanish or English)
	if (/crédit|credit|402/i.test(msg)) {
		return { kind: 'system', message: 'Insufficient credits on OpenRouter. Top up your account to continue.' };
	}
	if (/inválid|invalid.*key|401/i.test(msg)) {
		return { kind: 'system', message: 'Invalid API key. Check your key in Settings → AI Assistant.' };
	}
	if (/límite|rate.?limit|429/i.test(msg)) {
		return { kind: 'system', message: 'Rate limit reached on OpenRouter. Wait a moment before trying again.' };
	}

	return { kind: 'banner', message: msg };
}
