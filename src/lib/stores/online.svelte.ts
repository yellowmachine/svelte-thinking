class OnlineStore {
	online = $state(true);

	init() {
		if (typeof window === 'undefined') return;
		this.online = navigator.onLine;
		window.addEventListener('online', () => { this.online = true; });
		window.addEventListener('offline', () => { this.online = false; });
	}
}

export const onlineStore = new OnlineStore();
