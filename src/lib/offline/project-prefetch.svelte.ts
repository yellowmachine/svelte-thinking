import { browser } from '$app/environment';
import { trpc } from '$lib/utils/trpc';
import { pouchStore } from './pouch.svelte';

const STORAGE_KEY = 'scholio-prefetch-meta';

interface PrefetchMeta {
	[projectId: string]: {
		cachedAt: string;
		documentCount: number;
	};
}

class ProjectPrefetchStore {
	status = $state<'idle' | 'downloading' | 'done' | 'error'>('idle');
	progress = $state({ current: 0, total: 0 });
	error = $state<string | null>(null);

	private meta: PrefetchMeta = {};

	init() {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			this.meta = raw ? JSON.parse(raw) : {};
		} catch {
			this.meta = {};
		}
	}

	private _persistMeta() {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.meta));
	}

	isPrefetched(projectId: string): boolean {
		return !!this.meta[projectId];
	}

	lastSynced(projectId: string): Date | null {
		const m = this.meta[projectId];
		return m ? new Date(m.cachedAt) : null;
	}

	async prefetchProject(projectId: string): Promise<void> {
		this.status = 'downloading';
		this.progress = { current: 0, total: 1 };
		this.error = null;

		try {
			const snapshot = await trpc.projects.snapshot.query(projectId);
			const { project, documents, commentsByDoc, references } = snapshot;

			const total = documents.length + 2; // docs + project meta + references
			this.progress = { current: 0, total };

			// Store project metadata
			await pouchStore.putProjectMeta({
				projectId,
				title: project.title,
				description: project.description ?? null,
				documentIds: documents.map((d) => d.id),
				cachedAt: new Date().toISOString()
			});
			this.progress = { current: 1, total };

			// Store references
			await pouchStore.putReferences({
				projectId,
				references,
				cachedAt: new Date().toISOString()
			});
			this.progress = { current: 2, total };

			// Store each document and its comments
			for (const doc of documents) {
				await pouchStore.putDocument(
					{
						documentId: doc.id,
						projectId,
						title: doc.title,
						type: doc.type,
						content: doc.content,
						updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString()
					},
					{ offline: false }
				);

				const docComments = commentsByDoc[doc.id];
				if (docComments) {
					await pouchStore.putComments({
						documentId: doc.id,
						general: docComments.general,
						inline: docComments.inline,
						cachedAt: new Date().toISOString()
					});
				}

				this.progress = { current: this.progress.current + 1, total };
			}

			const cachedAt = new Date().toISOString();
			this.meta[projectId] = { cachedAt, documentCount: documents.length };
			this._persistMeta();

			this.status = 'done';
		} catch (e) {
			console.error('[prefetch] failed:', e);
			this.error = e instanceof Error ? e.message : 'Unknown error';
			this.status = 'error';
		}
	}

	async clearProject(projectId: string): Promise<void> {
		await pouchStore.clearProject(projectId);
		delete this.meta[projectId];
		this._persistMeta();
		this.status = 'idle';
		this.progress = { current: 0, total: 0 };
	}
}

export const projectPrefetch = new ProjectPrefetchStore();

if (browser) {
	projectPrefetch.init();
}
