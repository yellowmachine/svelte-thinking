import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toasts, flash } from './flash.svelte';

describe('toasts', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		toasts.clear();
	});
	afterEach(() => vi.useRealTimers());

	it('dismisses success and info on their own, keeps errors', () => {
		flash.set('Saved', 'success');
		flash.set('Failed to save', 'error');
		expect(toasts.items.map((t) => t.text)).toEqual(['Saved', 'Failed to save']);

		vi.advanceTimersByTime(5000);
		expect(toasts.items.map((t) => t.text)).toEqual(['Failed to save']);
	});

	it('keeps only the newest three', () => {
		for (const n of [1, 2, 3, 4]) toasts.push(`t${n}`, 'error');
		expect(toasts.items.map((t) => t.text)).toEqual(['t2', 't3', 't4']);
	});

	it('dismisses by id and carries an action', () => {
		const run = vi.fn();
		const id = toasts.push('Deleted', 'info', { action: { label: 'Undo', run } });
		expect(toasts.items[0].action?.label).toBe('Undo');
		toasts.dismiss(id);
		expect(toasts.items).toHaveLength(0);
	});
});
