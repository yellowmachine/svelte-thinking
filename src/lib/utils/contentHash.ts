/**
 * SHA-256 of a text, as hex. Web Crypto, so the same function runs in the
 * browser and on the server: the editor sends the hash of the draft it last
 * saw, and saveDraft compares it with the hash of the draft it has.
 */
export async function sha256Hex(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
