import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { userApiKey } from '$lib/server/db/schemas/users.schema';
import { encryptSecret } from '$lib/server/kms';

export const GET: RequestHandler = async ({ url, locals, cookies, fetch }) => {
	if (!locals.user) redirect(302, '/login');

	// Anti-CSRF: comparar state cookie con el devuelto por OpenRouter
	const storedState = cookies.get('or_state');
	cookies.delete('or_state', { path: '/' });

	const returnedState = url.searchParams.get('state');
	if (!storedState || !returnedState || storedState !== returnedState) {
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	// 1) Leer el code devuelto por OpenRouter
	const code = url.searchParams.get('code');
	if (!code) {
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	// 2) Intercambiar code -> key con la API de OpenRouter
	// Si usaste PKCE, guarda también code_verifier en la sesión/cookie
	let key: string;
	try {
		const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
				// Si tu flujo lo requiere, añade aquí auth de tu app
				// 'Authorization': `Bearer ${env.OPENROUTER_APP_KEY}`,
			},
			body: JSON.stringify({
				code
				// Si usaste PKCE:
				// code_verifier: '<TU_CODE_VERIFIER>',
				// code_challenge_method: 'S256',
			})
		});

		if (!res.ok) {
			console.error('OpenRouter /auth/keys error', res.status);
			redirect(302, '/settings?tab=ai&openrouter=error');
		}

		const data = (await res.json()) as { key?: string };
		key = data.key ?? '';

		if (!key || !key.startsWith('sk-or-')) {
			console.error('Invalid key from OpenRouter', key);
			redirect(302, '/settings?tab=ai&openrouter=error');
		}
	} catch (err) {
		console.error('Error exchanging code for key', err);
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	// 3) Guardar la key en tu DB como hacías antes
	try {
		const encrypted = await encryptSecret(key);

		await locals.withRLS(async (tx) => {
			await tx
				.delete(userApiKey)
				.where(
					and(eq(userApiKey.userId, locals.user!.id), eq(userApiKey.source, 'openrouter_oauth'))
				);

			await tx.insert(userApiKey).values({
				id: crypto.randomUUID(),
				userId: locals.user!.id,
				name: 'OpenRouter (connected)',
				...encrypted,
				enabled: true,
				source: 'openrouter_oauth'
			});
		});
	} catch (err) {
		console.error('DB/KMS error', err);
		redirect(302, '/settings?tab=ai&openrouter=error');
	}

	redirect(302, '/settings?tab=ai&openrouter=success');
};
