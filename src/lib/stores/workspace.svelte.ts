const STORAGE_KEY = 'scholio-workspace';

export interface Workspace {
	id: string | null; // null = personal
	name: string;
}

class WorkspaceStore {
	current = $state<Workspace>({ id: null, name: 'Personal' });

	init(orgs: { id: string; name: string }[]) {
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
}

export const workspaceStore = new WorkspaceStore();
