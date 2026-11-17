import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMail = vi.fn();
vi.mock('./mailer', () => ({ sendMail }));

const { sendAccountDeletedEmail } = await import('./email');

describe('sendAccountDeletedEmail', () => {
	beforeEach(() => sendMail.mockReset());

	it('escapes the name and counts what was deleted', async () => {
		await sendAccountDeletedEmail({
			to: 'a@example.com',
			name: '<b>Ada</b>',
			deletedProjects: 1,
			handedOverProjects: 0
		});
		const { to, subject, html } = sendMail.mock.calls[0][0];
		expect(to).toBe('a@example.com');
		expect(subject).toMatch(/deleted/);
		expect(html).toContain('&#60;b&#62;Ada&#60;/b&#62;');
		expect(html).not.toContain('<b>Ada</b>');
		expect(html).toContain('1 project and');
		expect(html).not.toContain('handed over');
	});

	it('mentions the projects handed over, if any', async () => {
		await sendAccountDeletedEmail({
			to: 'a@example.com',
			name: 'Ada',
			deletedProjects: 3,
			handedOverProjects: 2
		});
		const { html } = sendMail.mock.calls[0][0];
		expect(html).toContain('3 projects');
		expect(html).toContain('2 projects you owned');
		expect(html).toContain('were handed over');
	});
});
