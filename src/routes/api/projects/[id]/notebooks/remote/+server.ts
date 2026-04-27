import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and } from 'drizzle-orm';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectNotebook } from '$lib/server/db/schemas/notebooks.schema';
import { userJupyterConnection } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';
import { parseNotebook, getContentCells } from '$lib/utils/jupyter';

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) error(401, 'Unauthorized');

	const projectId = event.params.id;

	const body = await event.request.json().catch(() => null);
	if (!body || typeof body.connectionId !== 'string' || typeof body.path !== 'string') {
		error(400, 'connectionId and path are required');
	}

	const { connectionId, path } = body as { connectionId: string; path: string };

	const [[proj], [conn]] = await Promise.all([
		event.locals.withRLS((db) =>
			db.select({ id: project.id }).from(project).where(eq(project.id, projectId)).limit(1)
		),
		event.locals.withRLS((db) =>
			db
				.select()
				.from(userJupyterConnection)
				.where(
					and(eq(userJupyterConnection.id, connectionId), eq(userJupyterConnection.userId, user.id))
				)
				.limit(1)
		)
	]);

	if (!proj) error(404, 'Project not found');
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

	// Fetch full notebook content from Jupyter (content=1 returns the file body)
	const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
	const notebookUrl = `${conn.baseUrl}/api/contents/${encodedPath}?content=1`;

	let upstream: Response;
	try {
		upstream = await fetch(notebookUrl, {
			headers: { Authorization: `token ${token}` }
		});
	} catch {
		error(502, 'Could not reach the Jupyter server');
	} finally {
		token = '';
	}

	if (upstream.status === 401 || upstream.status === 403)
		error(401, 'Invalid or expired Jupyter token');
	if (!upstream.ok) error(502, `Jupyter server returned ${upstream.status}`);

	const data = (await upstream.json()) as { name: string; content: unknown; size?: number };

	let notebook;
	try {
		notebook = parseNotebook(data.content);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to parse notebook';
		error(422, message);
	}

	const cells = getContentCells(notebook);
	const filename = data.name.endsWith('.ipynb') ? data.name : `${data.name}.ipynb`;
	const remoteUrl = `${conn.baseUrl}/notebooks/${path}`;

	const [saved] = await event.locals.withRLS((db) =>
		db
			.insert(projectNotebook)
			.values({
				id: crypto.randomUUID(),
				projectId,
				importedBy: user.id,
				filename,
				size: data.size ?? JSON.stringify(data.content).length,
				source: 'url',
				remoteUrl,
				kernelName: notebook.metadata.kernelName ?? null,
				languageName: notebook.metadata.languageName ?? null,
				cells
			})
			.returning()
	);

	return json(saved, { status: 201 });
};
