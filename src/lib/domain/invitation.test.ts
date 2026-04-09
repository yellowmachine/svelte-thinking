import { describe, it, expect } from 'vitest';
import {
	isInvitationPending,
	isInvitationExpired,
	isInvitationAccepted
} from './invitation';

describe('isInvitationPending', () => {
	it('returns true for pending status', () => {
		expect(isInvitationPending('pending')).toBe(true);
	});

	it('returns false for non-pending statuses', () => {
		expect(isInvitationPending('accepted')).toBe(false);
		expect(isInvitationPending('expired')).toBe(false);
		expect(isInvitationPending('cancelled')).toBe(false);
	});
});

describe('isInvitationAccepted', () => {
	it('returns true for accepted status', () => {
		expect(isInvitationAccepted('accepted')).toBe(true);
	});

	it('returns false for non-accepted statuses', () => {
		expect(isInvitationAccepted('pending')).toBe(false);
		expect(isInvitationAccepted('expired')).toBe(false);
		expect(isInvitationAccepted('cancelled')).toBe(false);
	});
});

describe('isInvitationExpired', () => {
	it('returns true when expiresAt is in the past', () => {
		const past = new Date(Date.now() - 1000);
		expect(isInvitationExpired(past)).toBe(true);
	});

	it('returns false when expiresAt is in the future', () => {
		const future = new Date(Date.now() + 60_000);
		expect(isInvitationExpired(future)).toBe(false);
	});
});
