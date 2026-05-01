import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from '$env/dynamic/private';

function getMasterKey(): Buffer {
	if (!env.KMS_MASTER_KEY) throw new Error('KMS_MASTER_KEY not configured');
	// SHA-256 the key so any string length works and we always get 32 bytes
	return createHash('sha256').update(env.KMS_MASTER_KEY).digest();
}

export async function encryptSecret(plaintext: string): Promise<{
	encryptedApiKey: string;
	encryptedDataKey: string;
	iv: string;
	authTag: string;
}> {
	const key = getMasterKey();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return {
		encryptedApiKey: encrypted.toString('hex'),
		encryptedDataKey: '',
		iv: iv.toString('hex'),
		authTag: authTag.toString('hex')
	};
}

export async function decryptSecret(params: {
	encryptedApiKey: string;
	encryptedDataKey: string;
	iv: string;
	authTag: string;
}): Promise<string> {
	const key = getMasterKey();
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(params.iv, 'hex'));
	decipher.setAuthTag(Buffer.from(params.authTag, 'hex'));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(params.encryptedApiKey, 'hex')),
		decipher.final()
	]);

	return decrypted.toString('utf8');
}
