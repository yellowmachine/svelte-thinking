import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	CreateBucketCommand,
	HeadBucketCommand,
	PutBucketPolicyCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

// ── BYOS3: user-provided S3 config ───────────────────────────────────────────

export interface UserS3Config {
	endpoint: string;
	bucket: string;
	region: string;
	accessKey: string;
	secretKey: string;
	publicUrl?: string | null;
}

export function createS3Client(config: UserS3Config): S3Client {
	return new S3Client({
		endpoint: config.endpoint,
		region: config.region || 'us-east-1',
		credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
		forcePathStyle: true
	});
}

export function getPublicUrlForConfig(config: Pick<UserS3Config, 'endpoint' | 'bucket' | 'publicUrl'>, key: string): string {
	const base = (config.publicUrl || config.endpoint || '').replace(/\/$/, '');
	return `${base}/${config.bucket}/${key}`;
}

export async function uploadFileWithConfig(config: UserS3Config, key: string, body: Buffer, contentType: string): Promise<string> {
	const client = createS3Client(config);
	await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
	return getPublicUrlForConfig(config, key);
}

export async function deleteFileWithConfig(config: UserS3Config, key: string): Promise<void> {
	const client = createS3Client(config);
	await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function getPresignedUrlWithConfig(
	config: UserS3Config,
	key: string,
	expiresIn = 3600
): Promise<string> {
	const client = createS3Client(config);
	return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
		expiresIn
	});
}

export async function testS3Connection(config: UserS3Config): Promise<{ ok: boolean; error?: string }> {
	try {
		const client = createS3Client(config);
		await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
		return { ok: true };
	} catch (e) {
		return { ok: false, error: classifyS3Error(e) };
	}
}

function classifyS3Error(e: unknown): string {
	if (!(e instanceof Error)) return 'Unknown error connecting to the bucket.';

	const code = (e as { name?: string; Code?: string }).name ?? (e as { Code?: string }).Code ?? '';
	const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
	const msg = e.message.toLowerCase();

	if (code === 'NoSuchBucket' || code === 'NotFound' || status === 404)
		return `Bucket "${config.bucket}" does not exist. Create it first in the Minio/S3 console.`;

	if (code === 'AccessDenied' || code === 'Forbidden' || status === 403)
		return 'Access denied. Check your Access Key and Secret Key.';

	if (code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch')
		return 'Invalid credentials. Check your Access Key and Secret Key.';

	if (code === 'AuthorizationHeaderMalformed')
		return 'Incorrect region. Check the Region field.';

	if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('failed to fetch'))
		return `Cannot connect to "${config.endpoint}". Check that the service is running and the URL is correct.`;

	if (msg.includes('ssl') || msg.includes('certificate') || msg.includes('https'))
		return 'SSL certificate error. For local installations, use http:// in the endpoint.';

	return e.message;
}

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
