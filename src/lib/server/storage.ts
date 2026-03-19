import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	CreateBucketCommand,
	HeadBucketCommand,
	PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

function getClient() {
	if (!env.STORAGE_ENDPOINT) throw new Error('STORAGE_ENDPOINT is not set');
	if (!env.STORAGE_ACCESS_KEY) throw new Error('STORAGE_ACCESS_KEY is not set');
	if (!env.STORAGE_SECRET_KEY) throw new Error('STORAGE_SECRET_KEY is not set');

	return new S3Client({
		endpoint: env.STORAGE_ENDPOINT,
		region: 'us-east-1',
		credentials: {
			accessKeyId: env.STORAGE_ACCESS_KEY,
			secretAccessKey: env.STORAGE_SECRET_KEY
		},
		forcePathStyle: true // required for MinIO
	});
}

const bucket = () => env.STORAGE_BUCKET || 'scholio';

export function getPublicUrl(key: string): string {
	const base = (env.STORAGE_PUBLIC_URL || env.STORAGE_ENDPOINT || '').replace(/\/$/, '');
	return `${base}/${bucket()}/${key}`;
}

async function ensureBucket(client: S3Client) {
	const b = bucket();
	try {
		await client.send(new HeadBucketCommand({ Bucket: b }));
	} catch {
		await client.send(new CreateBucketCommand({ Bucket: b }));
		// Allow anonymous GET so <img src="..."> works directly from the browser.
		// Security relies on unguessable keys (two UUIDs per path).
		await client.send(
			new PutBucketPolicyCommand({
				Bucket: b,
				Policy: JSON.stringify({
					Version: '2012-10-17',
					Statement: [
						{
							Effect: 'Allow',
							Principal: { AWS: ['*'] },
							Action: ['s3:GetObject'],
							Resource: [`arn:aws:s3:::${b}/*`]
						}
					]
				})
			})
		);
	}
}

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
	const client = getClient();
	await ensureBucket(client);
	await client.send(
		new PutObjectCommand({
			Bucket: bucket(),
			Key: key,
			Body: body,
			ContentType: contentType
		})
	);
	return getPublicUrl(key);
}

export async function deleteFile(key: string): Promise<void> {
	const client = getClient();
	await client.send(
		new DeleteObjectCommand({
			Bucket: bucket(),
			Key: key
		})
	);
}
