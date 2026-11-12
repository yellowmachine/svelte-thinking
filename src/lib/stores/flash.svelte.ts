/**
 * Toast notifications, rendered by <Toaster /> in the root layout.
 *
 * Success and info toasts go away on their own; errors stay until dismissed,
 * so a failure is never missed. A toast can carry one action ("Undo", "Retry").
 * `flash.set(text, type)` is the short form most callers use.
 */
export type ToastType = 'success' | 'error' | 'info';

export type ToastAction = { label: string; run: () => void | Promise<void> };

export type Toast = {
	id: number;
	text: string;
	type: ToastType;
	action?: ToastAction;
};

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 3;

class ToastStore {
	items = $state<Toast[]>([]);
	#nextId = 1;
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	push(
		text: string,
		type: ToastType = 'info',
		opts: { action?: ToastAction; duration?: number | null } = {}
	): number {
		const id = this.#nextId++;
		this.items = [...this.items, { id, text, type, action: opts.action }].slice(-MAX_VISIBLE);

		// null = stays until dismissed. Errors default to that.
		const duration =
			opts.duration !== undefined ? opts.duration : type === 'error' ? null : AUTO_DISMISS_MS;
		if (duration !== null) {
			this.#timers.set(
				id,
				setTimeout(() => this.dismiss(id), duration)
			);
		}
		return id;
	}

	dismiss(id: number) {
		const timer = this.#timers.get(id);
		if (timer) clearTimeout(timer);
		this.#timers.delete(id);
		this.items = this.items.filter((t) => t.id !== id);
	}

	clear() {
		for (const timer of this.#timers.values()) clearTimeout(timer);
		this.#timers.clear();
		this.items = [];
	}
}

export const toasts = new ToastStore();

export const flash = {
	set(text: string, type: ToastType = 'info') {
		toasts.push(text, type);
	},
	clear() {
		toasts.clear();
	}
};
