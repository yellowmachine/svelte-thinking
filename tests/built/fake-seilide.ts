// Seilide falso para tests/built: OpenID Connect mínimo (discovery, authorize,
// token, userinfo). El perfil que devuelve se cambia con POST /profile, y
// GET /last-token-auth dice con qué cabecera Authorization se pidió el token.
const PORT = Number(process.env.FAKE_SEILIDE_PORT ?? 5446);
const BASE = `http://localhost:${PORT}`;

let profile = { sub: 'seilide-e2e', email: 'eva@example.com', email_verified: true, name: 'Eva' };
let lastTokenAuth = '';

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		switch (url.pathname) {
			case '/api/auth/.well-known/openid-configuration':
				return Response.json({
					issuer: BASE,
					authorization_endpoint: `${BASE}/api/auth/oauth2/authorize`,
					token_endpoint: `${BASE}/api/auth/oauth2/token`,
					userinfo_endpoint: `${BASE}/api/auth/oauth2/userinfo`
				});
			case '/api/auth/oauth2/authorize': {
				// Sin pantalla de login: vuelve en el acto con un código.
				const back = new URL(url.searchParams.get('redirect_uri') ?? '');
				back.searchParams.set('code', 'code-1');
				back.searchParams.set('state', url.searchParams.get('state') ?? '');
				return Response.redirect(back.toString(), 302);
			}
			case '/api/auth/oauth2/token':
				lastTokenAuth = req.headers.get('authorization') ?? '';
				return Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600 });
			case '/api/auth/oauth2/userinfo':
				return Response.json(profile);
			case '/profile':
				if (req.method !== 'POST') break;
				profile = await req.json();
				return new Response('ok');
			case '/last-token-auth':
				return new Response(lastTokenAuth);
		}
		return new Response('not found', { status: 404 });
	}
});

console.log(`[fake-seilide] ${BASE}`);
