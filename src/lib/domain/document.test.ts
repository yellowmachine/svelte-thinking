import { describe, it, expect } from 'vitest';
import {
	DOCUMENT_TYPES,
	DOCUMENT_TYPE_LABELS,
	isDocumentType,
	coerceDocumentType
} from './document';

describe('DOCUMENT_TYPES', () => {
	it('contains all expected types', () => {
		const expected = [
			'paper',
			'notes',
			'outline',
			'bibliography',
			'supplementary',
			'book',
			'chapter',
			'reading_note',
			'diagram'
		];
		expect([...DOCUMENT_TYPES]).toEqual(expected);
	});
});

describe('DOCUMENT_TYPE_LABELS', () => {
	it('has a label for every document type', () => {
		for (const type of DOCUMENT_TYPES) {
			expect(DOCUMENT_TYPE_LABELS[type]).toBeTruthy();
		}
	});
});

describe('isDocumentType', () => {
	it('accepts valid types', () => {
		expect(isDocumentType('paper')).toBe(true);
		expect(isDocumentType('reading_note')).toBe(true);
		expect(isDocumentType('book')).toBe(true);
	});

	it('rejects invalid values', () => {
		expect(isDocumentType('draft')).toBe(false);
		expect(isDocumentType('')).toBe(false);
		expect(isDocumentType(null)).toBe(false);
		expect(isDocumentType(42)).toBe(false);
	});
});

describe('coerceDocumentType', () => {
	it('returns the value when valid', () => {
		expect(coerceDocumentType('notes')).toBe('notes');
	});

	it('falls back to paper for invalid values', () => {
		expect(coerceDocumentType('garbage')).toBe('paper');
		expect(coerceDocumentType(undefined)).toBe('paper');
	});

	it('accepts a custom fallback', () => {
		expect(coerceDocumentType('garbage', 'notes')).toBe('notes');
	});
});
