import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userApiKey } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	if (!locals.user) redirect(302, '/login');

	// Verify anti-CSRF cookie is present (same browser session)
	const storedState = cookies.get('or_state');
	cookies.delete('or_state', { path: '/' });

	if (!storedState) {
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	const key = url.searchParams.get('key');
	if (!key || !key.startsWith('sk-or-')) {
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	try {
		const encrypted = await encryptSecret(key);

		// Replace any existing OAuth key — max one per user
		await db
			.delete(userApiKey)
			.where(and(eq(userApiKey.userId, locals.user.id), eq(userApiKey.source, 'openrouter_oauth')));

		await db.insert(userApiKey).values({
			id: crypto.randomUUID(),
			userId: locals.user.id,
			name: 'OpenRouter (connected)',
			...encrypted,
			enabled: true,
			source: 'openrouter_oauth'
		});
	} catch {
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	redirect(302, '/settings?tab=ai&openrouter=success');
};
