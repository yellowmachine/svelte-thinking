import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { APIError } from 'better-auth/api';
import { eq, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './db/schema';
import { waitlist } from './db/schemas/waitlist.schema';
import { userProfile } from './db/schemas/users.schema';

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const SEILIDE_PROVIDER_ID = 'seilide';

/** El ?error= con el que vuelve quien entra con Seilide sin email verificado. */
export const SEILIDE_EMAIL_NOT_VERIFIED = 'email_not_verified';

/** El ?error= con el que vuelve quien intenta crear una cuenta sin estar aprobado. */
export const NOT_ON_WAITLIST = 'not_on_waitlist';

export interface SeilideConfig {
	url: string;
	clientId: string;
	clientSecret: string;
}

/** SEILIDE_URL, SEILIDE_CLIENT_ID y SEILIDE_CLIENT_SECRET, o null si falta alguna: sin botón. */
export function seilideFromEnv(env: Record<string, string | undefined>): SeilideConfig | null {
	const {
		SEILIDE_URL: url,
		SEILIDE_CLIENT_ID: clientId,
		SEILIDE_CLIENT_SECRET: clientSecret
	} = env;
	return url && clientId && clientSecret
		? { url: url.replace(/\/+$/, ''), clientId, clientSecret }
		: null;
}

/**
 * Opciones de Better Auth sin imports de `$app/*` ni `$env/*`, para que los
 * tests puedan montar una instancia contra PGlite. La app usa auth.ts.
 */
export function createAuthOptions(params: {
	db: Db;
	secret: string | undefined;
	baseURL: string | undefined;
	seilide: SeilideConfig | null;
	sendResetPassword: (to: string, url: string) => Promise<void>;
	plugins?: BetterAuthOptions['plugins'];
}) {
	const { db } = params;

	return {
		baseURL: params.baseURL,
		secret: params.secret,
		// Los errores de login acaban en /api/auth/error, que handleAuthError
		// (hooks.server.ts) redirige a /auth/error con el mismo ?error=.
		database: drizzleAdapter(db, { provider: 'pg' }),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			sendResetPassword: async ({ user, url }) => {
				await params.sendResetPassword(user.email, url);
			}
		},
		// Quien entra con Seilide tiene su cuenta al momento. Si ya tenía una con ese
		// email, se enlaza, y desde entonces se le reconoce por el `sub`
		// (account.account_id), no por el email. Seilide no va en trustedProviders:
		// así Better Auth solo enlaza si Seilide dice email_verified.
		account: {
			accountLinking: { enabled: true }
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user, ctx) => {
						if (ctx?.params?.providerId === SEILIDE_PROVIDER_ID) {
							// Ninguna cuenta nace de Seilide con un email sin verificar: si no,
							// alguien podría ocupar el email de otro, y su dueño, al entrar luego
							// con Seilide y el email ya verificado, acabaría enlazado a ella.
							if (!user.emailVerified)
								throw new APIError('FORBIDDEN', { message: SEILIDE_EMAIL_NOT_VERIFIED });
							// Seilide ya decide quién tiene cuenta: no pasa por la lista de espera.
							return { data: user };
						}

						const rows = await db
							.select({ status: waitlist.status })
							.from(waitlist)
							.where(eq(waitlist.email, user.email))
							.limit(1);

						if (rows[0]?.status !== 'approved')
							throw new APIError('FORBIDDEN', { message: NOT_ON_WAITLIST });
						return { data: user };
					},
					// Toda cuenta tiene su perfil de Scholio: sin él, el layout de (app)
					// manda a /no-access.
					after: async (user) => {
						await db.transaction(async (tx) => {
							await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
							await tx
								.insert(userProfile)
								.values({ id: crypto.randomUUID(), userId: user.id, displayName: user.name })
								.onConflictDoNothing({ target: userProfile.userId });
						});
					}
				}
			},
			account: {
				create: {
					/**
					 * Seilide enlazado a una cuenta cuyo email nadie había verificado: su
					 * contraseña se borra. Si no, quien la hubiera creado con el email de otro
					 * seguiría entrando en ella con la suya. Better Auth enlaza antes de
					 * marcar el email verificado, así que aquí aún se ve sin verificar.
					 */
					after: async (account, ctx) => {
						if (account.providerId !== SEILIDE_PROVIDER_ID || !ctx) return;
						const adapter = ctx.context.internalAdapter;
						const owner = await adapter.findUserById(account.userId);
						if (!owner || owner.emailVerified) return;
						for (const other of await adapter.findAccounts(account.userId)) {
							if (other.providerId === 'credential') await adapter.deleteAccount(other.id);
						}
					}
				}
			}
		},
		advanced: {
			// Nombre propio para las cookies: las viejas con Domain=scholio.review (de
			// cuando la sesión se compartía entre subdominios) no se confunden con estas.
			cookiePrefix: 'scholio'
		},
		plugins: [
			twoFactor({ issuer: 'Scholio' }),
			...(params.seilide
				? [
						genericOAuth({
							config: [
								{
									providerId: SEILIDE_PROVIDER_ID,
									discoveryUrl: `${params.seilide.url}/api/auth/.well-known/openid-configuration`,
									clientId: params.seilide.clientId,
									clientSecret: params.seilide.clientSecret,
									authentication: 'basic',
									pkce: true,
									// Ni `family` ni `offline_access`: Scholio no es una app de familia
									// ni llama a Seilide después de entrar.
									scopes: ['openid', 'profile', 'email']
								}
							]
						})
					]
				: []),
			...(params.plugins ?? [])
		]
	} satisfies BetterAuthOptions;
}
