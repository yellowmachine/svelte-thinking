export type ThemeId = 'warm' | 'github' | 'solarized' | 'nord' | 'catppuccin' | 'gruvbox';

export interface ThemeDef {
	id: ThemeId;
	label: string;
	light: { bg: string; ui: string; accent: string };
	dark: { bg: string; ui: string; accent: string };
}

export const THEMES: ThemeDef[] = [
	{
		id: 'warm',
		label: 'Warm Paper',
		light: { bg: '#f9f7f4', ui: '#f0ede8', accent: '#7c5c3e' },
		dark: { bg: '#1a1917', ui: '#141311', accent: '#c4996b' }
	},
	{
		id: 'github',
		label: 'GitHub',
		light: { bg: '#ffffff', ui: '#f6f8fa', accent: '#0969da' },
		dark: { bg: '#0d1117', ui: '#161b22', accent: '#58a6ff' }
	},
	{
		id: 'solarized',
		label: 'Solarized',
		light: { bg: '#fdf6e3', ui: '#eee8d5', accent: '#268bd2' },
		dark: { bg: '#002b36', ui: '#073642', accent: '#268bd2' }
	},
	{
		id: 'nord',
		label: 'Nord',
		light: { bg: '#eceff4', ui: '#e5e9f0', accent: '#5e81ac' },
		dark: { bg: '#2e3440', ui: '#272c36', accent: '#88c0d0' }
	},
	{
		id: 'catppuccin',
		label: 'Catppuccin',
		light: { bg: '#eff1f5', ui: '#e6e9ef', accent: '#1e66f5' },
		dark: { bg: '#1e1e2e', ui: '#181825', accent: '#89b4fa' }
	},
	{
		id: 'gruvbox',
		label: 'Gruvbox',
		light: { bg: '#fbf1c7', ui: '#f2e5bc', accent: '#b57614' },
		dark: { bg: '#282828', ui: '#1d2021', accent: '#fe8019' }
	}
];

const STORAGE_THEME = 'scholio-theme';
const STORAGE_DARK = 'scholio-dark';

function applyToDOM(id: ThemeId, dark: boolean) {
	if (typeof document === 'undefined') return;
	document.documentElement.setAttribute('data-theme', id);
	document.documentElement.classList.toggle('dark', dark);
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		const def = THEMES.find((t) => t.id === id)!;
		meta.setAttribute('content', dark ? def.dark.bg : def.light.bg);
	}
}

class ThemeStore {
	id = $state<ThemeId>('warm');
	dark = $state(false);

	/** Call once on mount with values from localStorage / server */
	init(id: ThemeId, dark: boolean) {
		this.id = id;
		this.dark = dark;
		applyToDOM(id, dark);
	}

	set(id: ThemeId) {
		this.id = id;
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_THEME, id);
		applyToDOM(id, this.dark);
	}

	setDark(dark: boolean) {
		this.dark = dark;
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_DARK, dark ? '1' : '0');
		applyToDOM(this.id, dark);
	}

	toggleDark() {
		this.setDark(!this.dark);
	}
}

export const themeStore = new ThemeStore();
