import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// The only logical DB exposed through this proxy.
// Maps to the per-user CouchDB database: docs-<userId>
const LOGICAL_DB = 'documents';

// Parse credentials from COUCHDB_URL once at module load so all fetches use
// an explicit Authorization header — URL-embedded credentials aren't reliable
// with Node.js/undici fetch.
const _parsed = new URL(env.COUCHDB_URL);
const COUCH_AUTH = _parsed.username
	? `Basic ${btoa(`${_parsed.username}:${_parsed.password}`)}`
	: undefined;
const COUCH_BASE = `${_parsed.protocol}//${_parsed.host}`;

function couchFetch(url: string, init?: RequestInit) {
	const headers = new Headers((init?.headers as HeadersInit | undefined) ?? {});
	if (COUCH_AUTH) headers.set('Authorization', COUCH_AUTH);
	return fetch(url, { ...init, headers });
}

console.log('[couch-proxy] module loaded — COUCH_BASE:', COUCH_BASE, 'AUTH:', COUCH_AUTH ? 'yes' : 'no');

export const fallback: RequestHandler = async (event) => {
	console.log(`[couch-proxy] → ${event.request.method} /api/couch/${event.params.path}`);
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const [requestedDb, ...rest] = event.params.path.split('/');
	if (requestedDb !== LOGICAL_DB) error(403, 'Forbidden');

	const couchDb = `docs-${user.id}`;
	const subPath = rest.length ? `/${rest.join('/')}` : '';
	const target = `${COUCH_BASE}/${couchDb}${subPath}${event.url.search}`;

	const isBodyless = event.request.method === 'GET' || event.request.method === 'HEAD';
	const body = isBodyless ? undefined : await event.request.arrayBuffer();

	const fwdHeaders: Record<string, string> = {};
	for (const h of ['content-type', 'accept', 'if-none-match']) {
		const v = event.request.headers.get(h);
		if (v) fwdHeaders[h] = v;
	}

	let upstream = await couchFetch(target, { method: event.request.method, headers: fwdHeaders, body });
	console.log(`[couch-proxy] ${event.request.method} ${subPath || '/'} → ${upstream.status}`);

	// Auto-create the per-user database on first access
	if (upstream.status === 404 && !subPath) {
		console.log(`[couch-proxy] creating database ${couchDb}`);
		const created = await couchFetch(`${COUCH_BASE}/${couchDb}`, { method: 'PUT' });
		console.log(`[couch-proxy] create ${couchDb} → ${created.status}`);
		if (created.ok || created.status === 412) {
			upstream = await couchFetch(target, { method: event.request.method, headers: fwdHeaders, body });
			console.log(`[couch-proxy] retry → ${upstream.status}`);
		}
	}

	return forwardResponse(upstream);
};

function forwardResponse(res: Response): Response {
	const headers = new Headers();
	for (const [k, v] of res.headers) {
		if (!['transfer-encoding', 'connection', 'keep-alive'].includes(k.toLowerCase())) {
			headers.set(k, v);
		}
	}
	return new Response(res.body, { status: res.status, headers });
}
