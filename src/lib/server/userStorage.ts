import { eq } from 'drizzle-orm';
import { userS3Config } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';
import type { UserS3Config } from '$lib/server/storage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDecryptedS3Config(userId: string, withRLS: (fn: (db: any) => any) => Promise<any>): Promise<UserS3Config | null> {
	const [row] = await withRLS((db) =>
		db.select().from(userS3Config).where(eq(userS3Config.userId, userId)).limit(1)
	) as typeof userS3Config.$inferSelect[];

	if (!row) return null;

	const plaintext = await decryptSecret({
		encryptedApiKey: row.encryptedCredentials,
		encryptedDataKey: row.encryptedDataKey,
		iv: row.iv,
		authTag: row.authTag
	});

	const { accessKey, secretKey } = JSON.parse(plaintext) as { accessKey: string; secretKey: string };

	return {
		endpoint: row.endpoint,
		bucket: row.bucket,
		region: row.region,
		accessKey,
		secretKey,
		publicUrl: row.publicUrl
	};
}
