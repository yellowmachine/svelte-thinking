import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from './safeRedirect';

describe('safeRedirectPath', () => {
	it('keeps paths in the app, query included', () => {
		expect(safeRedirectPath('/settings?tab=profile&delete=1', '/x')).toBe(
			'/settings?tab=profile&delete=1'
		);
		expect(safeRedirectPath('/invitations/abc', '/x')).toBe('/invitations/abc');
	});

	it('falls back for anything that could leave the app', () => {
		for (const value of [
			null,
			undefined,
			'',
			'https://evil.example',
			'//evil.example',
			'/\\evil.example',
			'javascript:alert(1)',
			'settings'
		]) {
			expect(safeRedirectPath(value, '/projects')).toBe('/projects');
		}
	});
});
