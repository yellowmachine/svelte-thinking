const STORAGE_EINK = 'scholio-eink';

function applyToDOM(enabled: boolean) {
	if (typeof document === 'undefined') return;
	if (enabled) {
		document.documentElement.setAttribute('data-mode', 'eink');
	} else {
		document.documentElement.removeAttribute('data-mode');
	}
}

class EinkStore {
	enabled = $state(false);

	init() {
		if (typeof localStorage === 'undefined') return;
		this.enabled = localStorage.getItem(STORAGE_EINK) === '1';
		applyToDOM(this.enabled);
	}

	toggle() {
		this.enabled = !this.enabled;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_EINK, this.enabled ? '1' : '0');
		}
		applyToDOM(this.enabled);
	}
}

export const einkStore = new EinkStore();
