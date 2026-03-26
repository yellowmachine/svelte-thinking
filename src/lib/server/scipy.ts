import { SCIPY_SERVICE_URL, SCIPY_API_KEY } from '$env/static/private';

type DatasetRef = {
	bucket: string;
	object_key: string;
	format?: string;
};

export class ScipyError extends Error {
	constructor(
		public code: string,
		message: string,
		public status: number
	) {
		super(message);
	}
}

async function call<T>(endpoint: string, body: object): Promise<T> {
	const res = await fetch(`${SCIPY_SERVICE_URL}${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-API-Key': SCIPY_API_KEY
		},
		body: JSON.stringify(body)
	});

	const data = await res.json().catch(() => ({}));

	if (!res.ok || !data.ok) {
		throw new ScipyError(data.error ?? 'scipy_error', data.message ?? 'Unknown error', res.status);
	}

	return data;
}

function formatFromMime(mimeType: string): string {
	if (mimeType.includes('csv')) return 'csv';
	if (mimeType.includes('tab-separated')) return 'tsv';
	if (mimeType.includes('parquet')) return 'parquet';
	if (mimeType.includes('json')) return 'json';
	return 'csv';
}

export function datasetRef(dataset: { key: string; mimeType: string }): DatasetRef {
	// key format: projects/{projectId}/datasets/{uuid}/{filename}
	// MinIO bucket is the first segment before the first slash
	const parts = dataset.key.split('/');
	const bucket = 'scholio-datasets';
	const object_key = dataset.key;
	return { bucket, object_key, format: formatFromMime(dataset.mimeType) };
}

export const scipy = {
	describe: (ref: DatasetRef, columns?: string[]) =>
		call('/stats/describe', { dataset: ref, columns: columns ?? [] }),

	ttest: (ref: DatasetRef, opts: Record<string, unknown>) =>
		call('/stats/ttest', { dataset: ref, ...opts })
};
