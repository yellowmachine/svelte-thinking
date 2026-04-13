import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		KMS_MASTER_KEY: 'test-master-key-for-unit-tests'
	}
}));

const { encryptSecret, decryptSecret } = await import('./kms');

describe('kms: encryptSecret / decryptSecret', () => {
	it('encrypt → decrypt roundtrip devuelve el texto original', async () => {
		const plaintext = 'sk-or-v1-supersecretapikey1234567890';

		const encrypted = await encryptSecret(plaintext);
		const decrypted = await decryptSecret(encrypted);

		expect(decrypted).toBe(plaintext);
	});

	it('cada llamada genera un IV distinto', async () => {
		const a = await encryptSecret('key-a');
		const b = await encryptSecret('key-b');

		expect(a.iv).not.toBe(b.iv);
	});

	it('devuelve los cuatro campos requeridos', async () => {
		const result = await encryptSecret('my-api-key');

		expect(result).toHaveProperty('encryptedApiKey');
		expect(result).toHaveProperty('encryptedDataKey');
		expect(result).toHaveProperty('iv');
		expect(result).toHaveProperty('authTag');
	});

	it('encryptedApiKey es hex y no contiene el texto en claro', async () => {
		const plaintext = 'my-secret-key';
		const { encryptedApiKey } = await encryptSecret(plaintext);

		expect(encryptedApiKey).toMatch(/^[0-9a-f]+$/);
		expect(encryptedApiKey).not.toContain(plaintext);
	});

	it('authTag manipulado hace fallar el decrypt', async () => {
		const encrypted = await encryptSecret('legit-key');
		const tampered = { ...encrypted, authTag: 'deadbeef'.repeat(4) };

		await expect(decryptSecret(tampered)).rejects.toThrow();
	});

	it('encryptedApiKey manipulado hace fallar el decrypt', async () => {
		const encrypted = await encryptSecret('legit-key');
		const tampered = { ...encrypted, encryptedApiKey: '00'.repeat(32) };

		await expect(decryptSecret(tampered)).rejects.toThrow();
	});
});
