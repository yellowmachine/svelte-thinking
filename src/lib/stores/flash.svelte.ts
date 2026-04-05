type FlashType = 'success' | 'error' | 'info';
type FlashMessage = { text: string; type: FlashType };

function createFlashStore(timeout = 3000) {
	let message = $state<FlashMessage | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	return {
		get value() {
			return message;
		},
		set(text: string, type: FlashType = 'info') {
			if (timer) clearTimeout(timer);
			message = { text, type };
			timer = setTimeout(() => {
				message = null;
				timer = null;
			}, timeout);
		},
		clear() {
			message = null;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		}
	};
}

export const flash = createFlashStore();
