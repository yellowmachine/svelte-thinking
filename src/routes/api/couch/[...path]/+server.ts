import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

// The only logical DB exposed through this proxy.
// Maps to the per-user CouchDB database: docs-<userId>
const LOGICAL_DB = 'documents';

export const fallback: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'No autenticado');

	const [requestedDb, ...rest] = event.params.path.split('/');
	if (requestedDb !== LOGICAL_DB) error(403, 'Forbidden');

	const couchDb = `docs-${user.id}`;
	const couchBase = env.COUCHDB_URL.replace(/\/$/, '');
	const subPath = rest.length ? `/${rest.join('/')}` : '';
	const target = `${couchBase}/${couchDb}${subPath}${event.url.search}`;

	const isBodyless = event.request.method === 'GET' || event.request.method === 'HEAD';
	const body = isBodyless ? undefined : await event.request.arrayBuffer();

	const headers = new Headers();
	for (const h of ['content-type', 'accept', 'if-none-match']) {
		const v = event.request.headers.get(h);
		if (v) headers.set(h, v);
	}

	let upstream = await fetch(target, { method: event.request.method, headers, body });

	// Auto-create the per-user database on first access
	if (upstream.status === 404 && !subPath) {
		const created = await fetch(`${couchBase}/${couchDb}`, { method: 'PUT' });
		if (created.ok || created.status === 412) {
			upstream = await fetch(target, { method: event.request.method, headers, body });
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
