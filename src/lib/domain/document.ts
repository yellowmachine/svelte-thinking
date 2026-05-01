// Pure domain logic for documents.
// No Svelte, no DB, no network — safe to import from both server and client.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
	'paper',
	'notes',
	'outline',
	'bibliography',
	'supplementary',
	'book',
	'chapter',
	'reading_note'
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type PendingEditStatus = 'pending' | 'synced' | 'failed' | 'writer_lost';

export type PendingCreateStatus = 'pending' | 'synced' | 'failed';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
	paper: 'Article / Essay',
	notes: 'Notes',
	outline: 'Outline',
	bibliography: 'Bibliography',
	supplementary: 'Supplementary',
	book: 'Book',
	chapter: 'Chapter',
	reading_note: 'Reading Note'
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isDocumentType(value: unknown): value is DocumentType {
	return DOCUMENT_TYPES.includes(value as DocumentType);
}

export function coerceDocumentType(value: unknown, fallback: DocumentType = 'paper'): DocumentType {
	return isDocumentType(value) ? value : fallback;
}
