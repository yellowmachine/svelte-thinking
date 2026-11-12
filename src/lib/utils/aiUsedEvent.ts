// A window event for "something just spent AI credit", so the spending banner can refresh
// without the tRPC client or the chats importing its store.

export const AI_USED_EVENT = 'scholio:ai-used';

/** Something just called a model: tell the spending banner, if there is one. */
export function notifyAiUsed() {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(AI_USED_EVENT));
}
