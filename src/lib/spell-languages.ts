export interface SpellLanguage {
	code: string;
	label: string;
}

// null = LanguageTool auto-detection
export const SPELL_LANGUAGES: SpellLanguage[] = [
	{ code: 'auto', label: 'Auto' },
	{ code: 'en-US', label: 'English (US)' },
	{ code: 'en-GB', label: 'English (UK)' },
	{ code: 'es', label: 'Español' },
	{ code: 'fr', label: 'Français' },
	{ code: 'de', label: 'Deutsch' },
	{ code: 'pt-BR', label: 'Português (BR)' },
	{ code: 'pt-PT', label: 'Português (PT)' },
	{ code: 'it', label: 'Italiano' },
	{ code: 'nl', label: 'Nederlands' }
];

export const SUPPORTED_SPELL_CODES = new Set(SPELL_LANGUAGES.map((l) => l.code));
