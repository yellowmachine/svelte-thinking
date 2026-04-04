/**
 * Shared Redis-backed cache with in-process fallback.
 *
 * If REDIS_URL is not set or Redis is unreachable, every operation is a no-op
 * and callers fall back to their own logic (DB + KMS). This keeps the app
 * fully functional without Redis during local development or outages.
 *
 * Key namespacing — all keys are prefixed with "scholio:":
 *   scholio:taskkey:{userId}:{task}:{projectId}   AI key resolution  (TTL 5 min)
 *   scholio:author:{name}                          Author bio         (TTL 24 h)
 *   scholio:s3:user:{userId}                       User S3 config     (TTL 10 min)
 *   scholio:s3:org:{orgId}                         Org S3 config      (TTL 10 min)
 *   scholio:photo:presign:{photoId}                Photo presigned URL (TTL 55 min)
 */

import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

// ---------------------------------------------------------------------------
// TTLs (seconds)
// ---------------------------------------------------------------------------

export const TTL = {
	taskKey: 5 * 60,        // 5 min — decrypted AI key + model
	authorInfo: 24 * 60 * 60, // 24 h  — author bio lookup
	s3Config: 10 * 60,       // 10 min — decrypted S3 credentials
	photoPresign: 55 * 60    // 55 min — presigned URL (valid for 60 min)
} as const;

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

export const CACHE_KEY = {
	taskKey: (userId: string, task: string, projectId: string) =>
		`scholio:taskkey:${userId}:${task}:${projectId}`,
	authorInfo: (name: string) =>
		`scholio:author:${name.toLowerCase()}`,
	userS3: (userId: string) =>
		`scholio:s3:user:${userId}`,
	orgS3: (orgId: string) =>
		`scholio:s3:org:${orgId}`,
	photoPresign: (photoId: string) =>
		`scholio:photo:presign:${photoId}`
} as const;

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: Redis | null = null;
let _initAttempted = false;

function getClient(): Redis | null {
	if (_initAttempted) return _client;
	_initAttempted = true;

	if (!env.REDIS_URL) return null;

	try {
		_client = new Redis(env.REDIS_URL, {
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			connectTimeout: 2_000,
			commandTimeout: 1_000,
			enableOfflineQueue: false
		});
		_client.on('error', (e: Error) => {
			// Log once per error type — avoid flooding logs
			console.error('[cache] Redis error:', e.message);
		});
	} catch (e) {
		console.error('[cache] Could not initialise Redis client:', e);
		_client = null;
	}

	return _client;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
	const client = getClient();
	if (!client) return null;
	try {
		const raw = await client.get(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
	const client = getClient();
	if (!client) return;
	try {
		await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
	} catch {
		// graceful degradation — caller will re-fetch from source next time
	}
}

export async function cacheDel(key: string): Promise<void> {
	const client = getClient();
	if (!client) return;
	try {
		await client.del(key);
	} catch {
		// no-op
	}
}

/**
 * Invalidate all cache entries that match a glob pattern.
 * Use sparingly — SCAN is O(N) over the keyspace.
 * Example: invalidatePattern('scholio:s3:user:abc123*')
 */
export async function invalidatePattern(pattern: string): Promise<void> {
	const client = getClient();
	if (!client) return;
	try {
		let cursor = '0';
		do {
			const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
			cursor = next;
			if (keys.length) await client.del(...keys);
		} while (cursor !== '0');
	} catch {
		// no-op
	}
}
