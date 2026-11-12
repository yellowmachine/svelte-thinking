import { trpc } from '$lib/utils/trpc';
import { AI_USED_EVENT } from '$lib/utils/aiUsedEvent';

/**
 * The spending banner's figures, kept fresh while it is on screen: on mount, every few
 * minutes, when the tab comes back, and shortly after anything that spent AI credit.
 *
 * "Spent AI credit" arrives as AI_USED_EVENT, from the tRPC link for the procedures that
 * call a model and from the streaming chats when they finish.
 */
type Spend = Awaited<ReturnType<typeof trpc.usage.banner.query>>;

const POLL_MS = 5 * 60 * 1000;
// logUsage runs after the response is sent, and document summaries a little later still:
// look soon, then once more.
const AFTER_USE_MS = [1500, 20_000];

function createAiSpendStore() {
	let spend = $state<Spend | null>(null);
	let failed = $state(false);
	let users = 0;
	let poll: ReturnType<typeof setInterval> | undefined;
	let pending: ReturnType<typeof setTimeout>[] = [];

	async function refresh() {
		try {
			spend = await trpc.usage.banner.query();
			failed = false;
		} catch {
			failed = true;
		}
	}

	function onAiUsed() {
		pending.forEach(clearTimeout);
		pending = AFTER_USE_MS.map((ms) => setTimeout(refresh, ms));
	}

	function onVisible() {
		if (document.visibilityState === 'visible') void refresh();
	}

	/** Start keeping the figures fresh; the returned function stops (for a $effect). */
	function watch() {
		if (users++ === 0) {
			void refresh();
			poll = setInterval(refresh, POLL_MS);
			window.addEventListener(AI_USED_EVENT, onAiUsed);
			document.addEventListener('visibilitychange', onVisible);
		}
		return () => {
			if (--users > 0) return;
			clearInterval(poll);
			pending.forEach(clearTimeout);
			pending = [];
			window.removeEventListener(AI_USED_EVENT, onAiUsed);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}

	return {
		get spend() {
			return spend;
		},
		get failed() {
			return failed;
		},
		watch,
		refresh
	};
}

export const aiSpendStore = createAiSpendStore();
