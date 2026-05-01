/**
 * POST /api/totp-secret
 *
 * Returns the TOTP URI and plain-text secret for the authenticated user,
 * after verifying the current TOTP code. Used to add another authenticator
 * device without disabling/re-enabling 2FA.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { twoFactor } from '$lib/server/db/auth.schema';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');
	if (!user.twoFactorEnabled) error(400, '2FA no está activado');

	const body = await event.request.json().catch(() => ({}));
	const code: string = body?.code ?? '';
	if (!code || code.length !== 6) error(400, 'Código inválido');

	const row = await db
		.select({ secret: twoFactor.secret })
		.from(twoFactor)
		.where(eq(twoFactor.userId, user.id))
		.limit(1);

	if (!row[0]) error(404, 'Secreto 2FA no encontrado');

	const { symmetricDecrypt } = await import('better-auth/crypto');
	const secret = await symmetricDecrypt({ key: env.BETTER_AUTH_SECRET!, data: row[0].secret });

	const { createOTP } = await import('@better-auth/utils/otp');
	const otp = createOTP(secret, { digits: 6, period: 30 });

	const valid = await otp.verify(code);
	if (!valid) error(401, 'Código incorrecto');

	const totpURI = otp.url('Scholio', user.email);
	const textSecret = new URL(totpURI).searchParams.get('secret') ?? '';

	return json({ totpURI, textSecret });
};
