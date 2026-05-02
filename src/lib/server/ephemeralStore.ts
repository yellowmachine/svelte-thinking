const store = new Map<string, { buffer: Uint8Array; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000;

export function storeEphemeral(buffer: Uint8Array): string {
	const id = crypto.randomUUID();
	store.set(id, { buffer, expiresAt: Date.now() + TTL_MS });
	for (const [key, val] of store) {
		if (val.expiresAt < Date.now()) store.delete(key);
	}
	return `eph://${id}`;
}

export function retrieveEphemeral(url: string): Uint8Array | null {
	if (!url.startsWith('eph://')) return null;
	const id = url.slice(6);
	const entry = store.get(id);
	if (!entry || entry.expiresAt < Date.now()) {
		store.delete(id);
		return null;
	}
	store.delete(id);
	return entry.buffer;
}
