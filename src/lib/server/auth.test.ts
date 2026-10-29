import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, type TestDb } from './db/test-utils';
import { account, user } from './db/auth.schema';
import { userProfile } from './db/schemas/users.schema';
import { waitlist } from './db/schemas/waitlist.schema';
import { createAuthOptions, type SeilideConfig } from './auth-options';

// Login con contraseña y «Entrar con Seilide» sobre una base nueva (PGlite con
// todas las migraciones), con Seilide simulado: discovery, token y userinfo.

const SEILIDE: SeilideConfig = {
	url: 'https://seilide.test',
	clientId: 'scholio',
	clientSecret: 'secret'
};
const SCHOLIO = 'https://scholio.test';
const PASSWORD = 'una-contraseña-larga';
const SESSION_COOKIE = 'scholio.session_token';

type Profile = { sub: string; email: string; email_verified: boolean; name: string };

function fakeSeilide(profile: Profile) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.endsWith('/.well-known/openid-configuration')) {
			return Response.json({
				issuer: SEILIDE.url,
				authorization_endpoint: `${SEILIDE.url}/api/auth/oauth2/authorize`,
				token_endpoint: `${SEILIDE.url}/api/auth/oauth2/token`,
				userinfo_endpoint: `${SEILIDE.url}/api/auth/oauth2/userinfo`
			});
		}
		if (url.endsWith('/oauth2/token')) {
			return Response.json({
				access_token: 'access',
				token_type: 'Bearer',
				expires_in: 3600,
				scope: 'openid profile email'
			});
		}
		if (url.endsWith('/oauth2/userinfo')) return Response.json(profile);
		return new Response('not found', { status: 404 });
	});
}

let tdb: TestDb;

function createAuth(seilide: SeilideConfig | null = SEILIDE) {
	return betterAuth(
		createAuthOptions({
			db: tdb,
			secret: 'test-secret-test-secret-test-secret',
			baseURL: SCHOLIO,
			seilide,
			sendResetPassword: async () => {}
		})
	);
}
type Auth = ReturnType<typeof createAuth>;

/** «Entrar con Seilide» de punta a punta, como lo haría el navegador. */
async function signInWithSeilide(auth: Auth, profile: Profile) {
	vi.stubGlobal('fetch', fakeSeilide(profile));
	const { headers, response } = await auth.api.signInWithOAuth2({
		body: { providerId: 'seilide', callbackURL: '/projects' },
		returnHeaders: true
	});
	const authorize = new URL(response.url);
	expect(authorize.origin + authorize.pathname).toBe(`${SEILIDE.url}/api/auth/oauth2/authorize`);
	expect(authorize.searchParams.get('redirect_uri')).toBe(
		`${SCHOLIO}/api/auth/oauth2/callback/seilide`
	);
	expect(authorize.searchParams.get('scope')).toBe('openid profile email');
	expect(authorize.searchParams.get('code_challenge')).toBeTruthy();

	const cookie = headers
		.getSetCookie()
		.map((c) => c.split(';', 1)[0])
		.join('; ');
	const state = authorize.searchParams.get('state');
	return auth.handler(
		new Request(`${SCHOLIO}/api/auth/oauth2/callback/seilide?code=abc&state=${state}`, {
			headers: { cookie }
		})
	);
}

/** Aprobado en la lista de espera, como hace el admin desde /admin. */
const approve = (email: string) =>
	tdb.insert(waitlist).values({ id: crypto.randomUUID(), email, status: 'approved' });

/** Una cuenta con contraseña como la crea /register: aprobada y con el email verificado. */
async function signUpApproved(auth: Auth, email: string, name: string) {
	await approve(email);
	const created = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
	await tdb.update(user).set({ emailVerified: true }).where(eq(user.id, created.user.id));
	return created.user;
}

const usersCalled = (email: string) => tdb.select().from(user).where(eq(user.email, email));
const accountsOf = (userId: string) => tdb.select().from(account).where(eq(account.userId, userId));
const profileOf = (userId: string) =>
	tdb.select().from(userProfile).where(eq(userProfile.userId, userId));

beforeAll(async () => {
	tdb = await createTestDb();
}, 60_000);
beforeEach(async () => {
	await tdb.execute(
		sql`TRUNCATE "user", account, session, verification, scholio.waitlist, scholio.user_profile CASCADE`
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Login con contraseña sobre una base nueva', () => {
	it('quien está aprobado se registra, tiene su perfil y entra con su contraseña', async () => {
		const auth = createAuth();
		const created = await signUpApproved(auth, 'ana@example.com', 'Ana');

		expect(await profileOf(created.id)).toMatchObject([{ displayName: 'Ana' }]);

		const signedIn = await auth.api.signInEmail({
			body: { email: 'ana@example.com', password: PASSWORD }
		});
		expect(signedIn.user.id).toBe(created.id);
	});

	it('con la contraseña equivocada no entra', async () => {
		const auth = createAuth();
		await signUpApproved(auth, 'ana@example.com', 'Ana');
		const err = await auth.api
			.signInEmail({ body: { email: 'ana@example.com', password: 'otra-contraseña-mala' } })
			.catch((e) => e);
		expect(err).toBeInstanceOf(APIError);
		expect(err.body?.code).toBe('INVALID_EMAIL_OR_PASSWORD');
	});

	it('sin estar aprobado en la lista de espera no se crea la cuenta', async () => {
		const err = await createAuth()
			.api.signUpEmail({ body: { email: 'eva@example.com', password: PASSWORD, name: 'Eva' } })
			.catch((e) => e);
		expect(err).toBeInstanceOf(APIError);
		expect(await usersCalled('eva@example.com')).toHaveLength(0);
	});

	it('sin email verificado no entra', async () => {
		const auth = createAuth();
		await approve('leo@example.com');
		await auth.api.signUpEmail({
			body: { email: 'leo@example.com', password: PASSWORD, name: 'Leo' }
		});
		const err = await auth.api
			.signInEmail({ body: { email: 'leo@example.com', password: PASSWORD } })
			.catch((e) => e);
		expect(err.body?.code).toBe('EMAIL_NOT_VERIFIED');
	});
});

describe('Entrar con Seilide', () => {
	it('la primera vez crea la cuenta y su perfil, sin lista de espera, y la guarda por su sub', async () => {
		const res = await signInWithSeilide(createAuth(), {
			sub: 'seilide-42',
			email: 'Ana@Example.com',
			email_verified: true,
			name: 'Ana'
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/projects');
		expect(res.headers.getSetCookie().join()).toContain(SESSION_COOKIE);

		const [ana] = await usersCalled('ana@example.com');
		expect(ana.emailVerified).toBe(true);
		expect(await accountsOf(ana.id)).toMatchObject([
			{ providerId: 'seilide', accountId: 'seilide-42' }
		]);
		expect(await profileOf(ana.id)).toHaveLength(1);
		expect(await tdb.select().from(waitlist)).toHaveLength(0);
	});

	it('enlaza la cuenta que ya existía con ese email en vez de crear otra', async () => {
		const auth = createAuth();
		const ana = await signUpApproved(auth, 'ana@example.com', 'Ana');

		const res = await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana G.'
		});
		expect(res.status).toBe(302);
		expect(await usersCalled('ana@example.com')).toHaveLength(1);
		const providers = (await accountsOf(ana.id)).map((a) => a.providerId).sort();
		// Su contraseña sigue valiendo: el email era suyo.
		expect(providers).toEqual(['credential', 'seilide']);
		expect(await profileOf(ana.id)).toHaveLength(1);
	});

	it('la reconoce por el sub aunque cambie el email en Seilide', async () => {
		const auth = createAuth();
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@nuevo.example',
			email_verified: true,
			name: 'Ana'
		});
		const everyone = await tdb.select().from(user);
		expect(everyone).toHaveLength(1);
		expect(everyone[0].email).toBe('ana@example.com');
	});

	it('al enlazar una cuenta con el email sin verificar, se borra su contraseña', async () => {
		const auth = createAuth();
		// Alguien aprobado creó una cuenta con el email de Ana y nunca lo verificó.
		await approve('ana@example.com');
		const impostor = await auth.api.signUpEmail({
			body: { email: 'ana@example.com', password: PASSWORD, name: 'Impostor' }
		});

		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});

		const accounts = await accountsOf(impostor.user.id);
		expect(accounts.map((a) => a.providerId)).toEqual(['seilide']);
		const [ana] = await usersCalled('ana@example.com');
		expect(ana.emailVerified).toBe(true);
		const err = await auth.api
			.signInEmail({ body: { email: 'ana@example.com', password: PASSWORD } })
			.catch((e) => e);
		expect(err).toBeInstanceOf(APIError);
	});

	it('con el email sin verificar en Seilide no se crea la cuenta', async () => {
		const res = await signInWithSeilide(createAuth(), {
			sub: 'seilide-7',
			email: 'ana@example.com',
			email_verified: false,
			name: 'Ana'
		});
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toContain('error=email_not_verified');
		expect(res.headers.getSetCookie().join()).not.toContain(SESSION_COOKIE);
		expect(await tdb.select().from(user)).toHaveLength(0);
		expect(await tdb.select().from(account)).toHaveLength(0);
	});

	it('con el email sin verificar en Seilide no se enlaza a la cuenta que ya existía', async () => {
		const auth = createAuth();
		const ana = await signUpApproved(auth, 'ana@example.com', 'Ana');

		const res = await signInWithSeilide(auth, {
			sub: 'seilide-intruso',
			email: 'ana@example.com',
			email_verified: false,
			name: 'Intruso'
		});
		expect(res.headers.get('location')).toContain('error=account_not_linked');
		expect(res.headers.getSetCookie().join()).not.toContain(SESSION_COOKIE);
		expect((await accountsOf(ana.id)).map((a) => a.providerId)).toEqual(['credential']);
	});

	it('quien ya está enlazado sigue entrando por su sub aunque Seilide deje de dar el email verificado', async () => {
		const auth = createAuth();
		await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: true,
			name: 'Ana'
		});
		const res = await signInWithSeilide(auth, {
			sub: 'seilide-42',
			email: 'ana@example.com',
			email_verified: false,
			name: 'Ana'
		});
		expect(res.headers.get('location')).toBe('/projects');
		expect(res.headers.getSetCookie().join()).toContain(SESSION_COOKIE);
	});

	it('sin SEILIDE_* no hay ruta de Seilide', async () => {
		const res = await createAuth(null).handler(
			new Request(`${SCHOLIO}/api/auth/sign-in/oauth2`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: SCHOLIO },
				body: JSON.stringify({ providerId: 'seilide', callbackURL: '/projects' })
			})
		);
		expect(res.status).toBe(404);
	});
});
