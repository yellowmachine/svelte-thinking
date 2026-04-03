import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and } from 'drizzle-orm';
import { userJupyterConnection } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';

// Shape returned by the Jupyter Contents API for a single item
interface JupyterContentsItem {
	name: string;
	path: string;
	type: 'notebook' | 'directory' | 'file';
	last_modified: string;
	content: JupyterContentsItem[] | null;
}

export interface NotebookEntry {
	type: 'notebook';
	name: string;
	path: string;
	lastModified: string;
}

export interface DirectoryListing {
	type: 'directory';
	name: string;
	path: string;
}

export interface DirectoryEntry {
	type: 'directory';
	name: string;
	path: string;
	items: (NotebookEntry | DirectoryListing)[];
}

export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'Unauthorized');

	const { connectionId } = event.params;
	const path = event.url.searchParams.get('path') ?? '';

	// Load connection — RLS ensures it belongs to the user
	const [conn] = await event.locals.withRLS((db) =>
		db
			.select()
			.from(userJupyterConnection)
			.where(
				and(
					eq(userJupyterConnection.id, connectionId),
					eq(userJupyterConnection.userId, user.id)
				)
			)
			.limit(1)
	);

	if (!conn) error(404, 'Connection not found');

	let token: string;
	try {
		token = await decryptSecret({
			encryptedApiKey: conn.encryptedToken,
			encryptedDataKey: conn.encryptedDataKey,
			iv: conn.iv,
			authTag: conn.authTag
		});
	} catch {
		error(500, 'Could not decrypt token');
	}

	// Proxy request to the Jupyter Contents API
	const encodedPath = path ? `/${encodeURIComponent(path).replace(/%2F/g, '/')}` : '';
	const contentsUrl = `${conn.baseUrl}/api/contents${encodedPath}`;

	let upstream: Response;
	try {
		upstream = await fetch(contentsUrl, {
			headers: { Authorization: `token ${token}` }
		});
	} catch {
		error(502, 'Could not reach the Jupyter server');
	} finally {
		// Clear token from memory
		token = '';
	}

	if (upstream.status === 401 || upstream.status === 403) {
		error(401, 'Invalid or expired Jupyter token');
	}
	if (!upstream.ok) {
		error(502, `Jupyter server returned ${upstream.status}`);
	}

	const data = (await upstream.json()) as JupyterContentsItem;

	// Only return notebooks and directories — no file content, no raw data
	if (data.type === 'notebook') {
		return json({ type: 'notebook', name: data.name, path: data.path, lastModified: data.last_modified });
	}

	if (data.type === 'directory') {
		const items = (data.content ?? [])
			.filter((item) => item.type === 'notebook' || item.type === 'directory')
			.map((item): NotebookEntry | DirectoryListing =>
				item.type === 'notebook'
					? { type: 'notebook', name: item.name, path: item.path, lastModified: item.last_modified }
					: { type: 'directory', name: item.name, path: item.path }
			);

		return json({ type: 'directory', name: data.name, path: data.path, items });
	}

	error(400, 'Path does not point to a notebook or directory');
};
