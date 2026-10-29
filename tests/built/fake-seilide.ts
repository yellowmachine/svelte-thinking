// Seilide falso para tests/built: OpenID Connect mínimo (discovery, authorize,
// token, userinfo). El perfil que devuelve se cambia con POST /profile, y
// GET /last-token-auth dice con qué cabecera Authorization se pidió el token.
import { createServer, type ServerResponse } from 'node:http';

const PORT = Number(process.env.FAKE_SEILIDE_PORT ?? 5446);
const BASE = `http://localhost:${PORT}`;

let profile = { sub: 'seilide-e2e', email: 'eva@example.com', email_verified: true, name: 'Eva' };
let lastTokenAuth = '';

function json(res: ServerResponse, body: unknown) {
	res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', BASE);
	switch (url.pathname) {
		case '/api/auth/.well-known/openid-configuration':
			return json(res, {
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
			return res.writeHead(302, { location: back.toString() }).end();
		}
		case '/api/auth/oauth2/token':
			lastTokenAuth = req.headers.authorization ?? '';
			return json(res, { access_token: 'access', token_type: 'Bearer', expires_in: 3600 });
		case '/api/auth/oauth2/userinfo':
			return json(res, profile);
		case '/profile': {
			if (req.method !== 'POST') break;
			let body = '';
			for await (const chunk of req) body += chunk;
			profile = JSON.parse(body);
			return res.end('ok');
		}
		case '/last-token-auth':
			return res.end(lastTokenAuth);
	}
	res.writeHead(404).end('not found');
}).listen(PORT, () => console.log(`[fake-seilide] ${BASE}`));
