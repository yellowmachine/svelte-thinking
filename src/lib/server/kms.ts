import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '$env/dynamic/private';

function getClient(): KMSClient {
	if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION) {
		throw new Error('AWS KMS credentials not configured');
	}
	return new KMSClient({
		region: env.AWS_REGION,
		credentials: {
			accessKeyId: env.AWS_ACCESS_KEY_ID,
			secretAccessKey: env.AWS_SECRET_ACCESS_KEY
		}
	});
}

export async function encryptSecret(plaintext: string): Promise<{
	encryptedApiKey: string;
	encryptedDataKey: string;
	iv: string;
	authTag: string;
}> {
	if (!env.AWS_KMS_KEY_ID) throw new Error('AWS_KMS_KEY_ID not configured');

	const { Plaintext, CiphertextBlob } = await getClient().send(
		new GenerateDataKeyCommand({ KeyId: env.AWS_KMS_KEY_ID, KeySpec: 'AES_256' })
	);

	if (!Plaintext || !CiphertextBlob) throw new Error('KMS GenerateDataKey failed');

	const dataKey = Buffer.from(Plaintext);
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Clear plaintext data key from memory
	dataKey.fill(0);

	return {
		encryptedApiKey: encrypted.toString('hex'),
		encryptedDataKey: Buffer.from(CiphertextBlob).toString('base64'),
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
	const { Plaintext } = await getClient().send(
		new DecryptCommand({
			CiphertextBlob: Buffer.from(params.encryptedDataKey, 'base64'),
			KeyId: env.AWS_KMS_KEY_ID
		})
	);

	if (!Plaintext) throw new Error('KMS Decrypt failed');

	const dataKey = Buffer.from(Plaintext);
	const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(params.iv, 'hex'));
	decipher.setAuthTag(Buffer.from(params.authTag, 'hex'));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(params.encryptedApiKey, 'hex')),
		decipher.final()
	]);

	dataKey.fill(0);

	return decrypted.toString('utf8');
}
