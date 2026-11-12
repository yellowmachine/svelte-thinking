/**
 * In-app replacement for window.confirm(), rendered by <ConfirmDialog /> in
 * the root layout:
 *
 *   if (!(await confirmDialog({ title: 'Restore v3?', confirmLabel: 'Restore' }))) return;
 *
 * For irreversible deletions of whole projects or accounts, SafeDeleteDialog
 * (typed confirmation) is still the right tool.
 */
export type ConfirmOptions = {
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Red confirm button, for destructive actions. */
	danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

class ConfirmStore {
	current = $state<Pending | null>(null);

	ask(options: ConfirmOptions): Promise<boolean> {
		// A second request while one is open answers the first with "no".
		this.current?.resolve(false);
		return new Promise((resolve) => {
			this.current = { ...options, resolve };
		});
	}

	answer(ok: boolean) {
		const pending = this.current;
		this.current = null;
		pending?.resolve(ok);
	}
}

export const confirmStore = new ConfirmStore();

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	return confirmStore.ask(options);
}
