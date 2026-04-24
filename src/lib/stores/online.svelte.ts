const PROBE_URL = '/api/health';
const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 4_000;

class OnlineStore {
	online = $state(true);
	private _initialized = false;

	private async _probe() {
		try {
			await fetch(PROBE_URL, {
				method: 'GET',
				cache: 'no-store',
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
			});
			if (!this.online) console.log('[offline] network: probe succeeded — back online');
			this.online = true;
		} catch {
			if (this.online) console.warn('[offline] network: probe failed — going offline');
			this.online = false;
		}
	}

	/** Re-evaluates network state immediately. Safe to call multiple times (e.g. after BFCache restore). */
	refresh() {
		if (typeof window === 'undefined') return;
		// navigator.onLine is unreliable when offline via DevTools (stays true).
		// Trust offline immediately; for online, let the probe be the source of truth.
		if (!navigator.onLine) {
			if (this.online) {
				console.warn('[offline] network: refresh — navigator.onLine false, going offline');
				this.online = false;
			}
		} else {
			// Don't set online=true here — probe will do it if the request actually succeeds.
			this._probe();
		}
	}

	init() {
		if (typeof window === 'undefined') return;
		if (this._initialized) return;
		this._initialized = true;

		this.online = navigator.onLine;
		console.log(`[offline] network: initialized — ${navigator.onLine ? 'online' : 'offline'}`);

		// Probe immediately — navigator.onLine is unreliable in DevTools offline mode (stays true),
		// so we need a real network check right away rather than waiting for the 15s interval.
		this.refresh();

		window.addEventListener('online', () => {
			console.log('[offline] network: browser event → online, probing…');
			this._probe();
		});
		window.addEventListener('offline', () => {
			console.warn('[offline] network: browser event → offline');
			this.online = false;
		});

		setInterval(() => this._probe(), PROBE_INTERVAL_MS);
	}
}

export const onlineStore = new OnlineStore();
