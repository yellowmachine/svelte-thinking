import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ────────────────────────────────────────────────────────────────
// vi.hoisted ensures mockSend exists before the vi.mock factory runs (mocks are hoisted)

const mockSend = vi.hoisted(() => vi.fn());
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FAKE_DATA_KEY = vi.hoisted(() => require('crypto').randomBytes(32) as Buffer);

vi.mock('@aws-sdk/client-kms', () => ({
	KMSClient: class {
		send = mockSend;
	},
	GenerateDataKeyCommand: class GenerateDataKeyCommand {
		constructor(public params: unknown) {}
	},
	DecryptCommand: class DecryptCommand {
		constructor(public params: unknown) {}
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		AWS_ACCESS_KEY_ID: 'test-key-id',
		AWS_SECRET_ACCESS_KEY: 'test-secret',
		AWS_REGION: 'eu-west-1',
		AWS_KMS_KEY_ID: 'arn:aws:kms:eu-west-1:123456789:key/test'
	}
}));

const { encryptSecret, decryptSecret } = await import('./kms');

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupKmsMock() {
	mockSend.mockImplementation((cmd: { constructor: { name: string } }) => {
		if (cmd.constructor.name === 'GenerateDataKeyCommand') {
			return Promise.resolve({
				Plaintext: FAKE_DATA_KEY,
				CiphertextBlob: Buffer.from('fake-encrypted-data-key')
			});
		}
		if (cmd.constructor.name === 'DecryptCommand') {
			return Promise.resolve({ Plaintext: FAKE_DATA_KEY });
		}
		return Promise.reject(new Error(`Unexpected: ${cmd.constructor.name}`));
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('kms: encryptSecret / decryptSecret', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupKmsMock();
	});

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
