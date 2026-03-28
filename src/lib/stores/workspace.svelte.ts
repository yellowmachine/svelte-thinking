const STORAGE_KEY = 'scholio-workspace';

export interface Workspace {
	id: string | null; // null = personal
	name: string;
}

class WorkspaceStore {
	current = $state<Workspace>({ id: null, name: 'Personal' });
	private orgs: { id: string; name: string }[] = [];

	init(orgs: { id: string; name: string }[]) {
		this.orgs = orgs;
		if (typeof localStorage === 'undefined') return;
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const found = orgs.find((o) => o.id === stored);
			if (found) {
				this.current = { id: found.id, name: found.name };
				return;
			}
		}
		this.current = { id: null, name: 'Personal' };
	}

	set(workspace: Workspace) {
		this.current = workspace;
		if (typeof localStorage !== 'undefined') {
			if (workspace.id) {
				localStorage.setItem(STORAGE_KEY, workspace.id);
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	}

	/** Sync workspace to match a project's org. Call on any page that has a project context. */
	syncToOrg(orgId: string | null | undefined) {
		if (!orgId) {
			if (this.current.id !== null) this.set({ id: null, name: 'Personal' });
			return;
		}
		if (this.current.id === orgId) return;
		const org = this.orgs.find((o) => o.id === orgId);
		if (org) this.set({ id: org.id, name: org.name });
	}
}

export const workspaceStore = new WorkspaceStore();
