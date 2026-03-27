import { z } from 'zod';
import { eq, and, gte, sum, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../init';
import {
	organization,
	organizationMember,
	organizationApiKey,
	orgInvitation
} from '$lib/server/db/schemas/organizations.schema';
import { encryptSecret } from '$lib/server/kms';
import { parseTaskConfig } from './aiConfig';
import { aiUsageLog } from '$lib/server/db/schemas/ai.schema';
import { sendOrgInvitation } from '$lib/server/services/email.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function sevenDaysFromNow() {
	const d = new Date();
	d.setDate(d.getDate() + 7);
	return d;
}

function slugify(name: string) {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

// Returns the start of the current calendar month (UTC)
function startOfMonth() {
	const d = new Date();
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const orgRoleValues = ['admin', 'member', 'guest'] as const;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const orgsRouter = router({
	// ── Organization CRUD ────────────────────────────────────────────────────

	list: protectedProcedure.query(async ({ ctx }) => {
		// Own orgs
		const owned = await ctx.withRLS((db) =>
			db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					role: sql<string>`'owner'`
				})
				.from(organization)
				.where(eq(organization.ownerId, ctx.user.id))
		);

		// Member orgs
		const memberships = await ctx.withRLS((db) =>
			db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					role: organizationMember.role
				})
				.from(organizationMember)
				.innerJoin(organization, eq(organization.id, organizationMember.orgId))
				.where(eq(organizationMember.userId, ctx.user.id))
		);

		// Deduplicate (user may own + be a member row if data is inconsistent)
		const seen = new Set(owned.map((o) => o.id));
		const all = [...owned, ...memberships.filter((m) => !seen.has(m.id))];
		return all;
	}),

	get: protectedProcedure.input(z.string()).query(async ({ ctx, input: orgId }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.select({
					id: organization.id,
					name: organization.name,
					slug: organization.slug,
					ownerId: organization.ownerId,
					aiTaskConfig: organization.aiTaskConfig,
					monthlyBudgetEur: organization.monthlyBudgetEur,
					createdAt: organization.createdAt
				})
				.from(organization)
				.where(eq(organization.id, orgId))
				.limit(1)
		);
		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(2).max(80), slug: z.string().min(2).max(60).optional() }))
		.mutation(async ({ ctx, input }) => {
			const id = crypto.randomUUID();
			const slug = input.slug ?? (slugify(input.name) || id.slice(0, 8));

			const [org] = await ctx.withRLS((db) =>
				db
					.insert(organization)
					.values({ id, name: input.name, slug, ownerId: ctx.user.id })
					.returning()
			);
			return org;
		}),

	update: protectedProcedure
		.input(
			z.object({
				orgId: z.string(),
				name: z.string().min(2).max(80).optional(),
				monthlyBudgetEur: z.string().nullable().optional() // numeric as string from DB
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { orgId, ...fields } = input;
			const patch: Record<string, unknown> = { updatedAt: new Date() };
			if (fields.name !== undefined) patch.name = fields.name;
			if (fields.monthlyBudgetEur !== undefined) patch.monthlyBudgetEur = fields.monthlyBudgetEur;

			const rows = await ctx.withRLS((db) =>
				db
					.update(organization)
					.set(patch)
					.where(and(eq(organization.id, orgId), eq(organization.ownerId, ctx.user.id)))
					.returning({ id: organization.id })
			);
			if (!rows[0]) throw new TRPCError({ code: 'FORBIDDEN' });
			return rows[0];
		}),

	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: orgId }) => {
		const rows = await ctx.withRLS((db) =>
			db
				.delete(organization)
				.where(and(eq(organization.id, orgId), eq(organization.ownerId, ctx.user.id)))
				.returning({ id: organization.id })
		);
		if (!rows[0]) throw new TRPCError({ code: 'FORBIDDEN' });
		return { ok: true };
	}),

	// ── Members ──────────────────────────────────────────────────────────────

	listMembers: protectedProcedure.input(z.string()).query(async ({ ctx, input: orgId }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: organizationMember.id,
					userId: organizationMember.userId,
					role: organizationMember.role,
					createdAt: organizationMember.createdAt
				})
				.from(organizationMember)
				.where(eq(organizationMember.orgId, orgId))
		);
	}),

	updateMemberRole: protectedProcedure
		.input(z.object({ memberId: z.string(), role: z.enum(orgRoleValues) }))
		.mutation(async ({ ctx, input }) => {
			// Only org owner can do this — RLS withCheck on org_member_insert enforces owner,
			// but for update we verify explicitly
			const rows = await ctx.withRLS((db) =>
				db
					.update(organizationMember)
					.set({ role: input.role })
					.where(
						and(
							eq(organizationMember.id, input.memberId),
							eq(organizationMember.orgOwnerId, ctx.user.id)
						)
					)
					.returning({ id: organizationMember.id })
			);
			if (!rows[0]) throw new TRPCError({ code: 'FORBIDDEN' });
			return rows[0];
		}),

	removeMember: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: memberId }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.delete(organizationMember)
					.where(eq(organizationMember.id, memberId))
					.returning({ id: organizationMember.id })
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return { ok: true };
		}),

	// ── API Keys ─────────────────────────────────────────────────────────────

	listKeys: protectedProcedure.input(z.string()).query(async ({ ctx, input: orgId }) => {
		return ctx.withRLS((db) =>
			db
				.select({
					id: organizationApiKey.id,
					name: organizationApiKey.name,
					enabled: organizationApiKey.enabled,
					createdAt: organizationApiKey.createdAt
				})
				.from(organizationApiKey)
				.where(eq(organizationApiKey.orgId, orgId))
		);
	}),

	addKey: protectedProcedure
		.input(z.object({ orgId: z.string(), name: z.string().min(1).max(80), apiKey: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			let encrypted;
			try {
				encrypted = await encryptSecret(input.apiKey);
			} catch {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Error encrypting API key. Check AWS KMS configuration.'
				});
			}

			const id = crypto.randomUUID();
			await ctx.withRLS((db) =>
				db.insert(organizationApiKey).values({
					id,
					orgId: input.orgId,
					name: input.name,
					...encrypted,
					enabled: true
				})
			);
			return { id };
		}),

	toggleKey: protectedProcedure
		.input(z.object({ keyId: z.string(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.withRLS((db) =>
				db
					.update(organizationApiKey)
					.set({ enabled: input.enabled, updatedAt: new Date() })
					.where(eq(organizationApiKey.id, input.keyId))
			);
			return { enabled: input.enabled };
		}),

	deleteKey: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: keyId }) => {
			await ctx.withRLS((db) =>
				db.delete(organizationApiKey).where(eq(organizationApiKey.id, keyId))
			);
			return { ok: true };
		}),

	setTaskConfig: protectedProcedure
		.input(
			z.object({
				orgId: z.string(),
				task: z.enum(['agent', 'draft', 'review', 'requirements']),
				keyId: z.string(),
				model: z.string().min(1)
			})
		)
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.select({ aiTaskConfig: organization.aiTaskConfig, ownerId: organization.ownerId })
					.from(organization)
					.where(eq(organization.id, input.orgId))
					.limit(1)
			) as { aiTaskConfig: string | null; ownerId: string }[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (rows[0].ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

			const config = parseTaskConfig(rows[0].aiTaskConfig);
			config[input.task] = { keyId: input.keyId, model: input.model };

			await ctx.withRLS((db) =>
				db
					.update(organization)
					.set({ aiTaskConfig: JSON.stringify(config), updatedAt: new Date() })
					.where(eq(organization.id, input.orgId))
			);
			return { ok: true };
		}),

	clearTaskConfig: protectedProcedure
		.input(z.object({ orgId: z.string(), task: z.enum(['agent', 'draft', 'review', 'requirements']) }))
		.mutation(async ({ ctx, input }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.select({ aiTaskConfig: organization.aiTaskConfig, ownerId: organization.ownerId })
					.from(organization)
					.where(eq(organization.id, input.orgId))
					.limit(1)
			) as { aiTaskConfig: string | null; ownerId: string }[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (rows[0].ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

			const config = parseTaskConfig(rows[0].aiTaskConfig);
			delete config[input.task];

			await ctx.withRLS((db) =>
				db
					.update(organization)
					.set({ aiTaskConfig: JSON.stringify(config), updatedAt: new Date() })
					.where(eq(organization.id, input.orgId))
			);
			return { ok: true };
		}),

	// ── Invitations ───────────────────────────────────────────────────────────

	listInvitations: protectedProcedure.input(z.string()).query(async ({ ctx, input: orgId }) => {
		return ctx.withRLS((db) =>
			db.select().from(orgInvitation).where(eq(orgInvitation.orgId, orgId))
		);
	}),

	invite: protectedProcedure
		.input(z.object({ orgId: z.string(), email: z.string().email(), role: z.enum(orgRoleValues) }))
		.mutation(async ({ ctx, input }) => {
			return ctx.withRLS(async (db) => {
				const orgs = await db
					.select({ name: organization.name, ownerId: organization.ownerId })
					.from(organization)
					.where(eq(organization.id, input.orgId))
					.limit(1);

				if (!orgs[0]) throw new TRPCError({ code: 'NOT_FOUND' });
				if (orgs[0].ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });

				const existing = await db
					.select({ id: orgInvitation.id })
					.from(orgInvitation)
					.where(
						and(
							eq(orgInvitation.orgId, input.orgId),
							eq(orgInvitation.invitedEmail, input.email),
							eq(orgInvitation.status, 'pending')
						)
					)
					.limit(1);

				if (existing[0]) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: 'There is already a pending invitation for this email'
					});
				}

				const token = generateToken();
				const [invitation] = await db
					.insert(orgInvitation)
					.values({
						id: crypto.randomUUID(),
						orgId: input.orgId,
						orgName: orgs[0].name,
						invitedEmail: input.email,
						invitedBy: ctx.user.id,
						token,
						status: 'pending',
						expiresAt: sevenDaysFromNow()
					})
					.returning();

				const origin = ctx.event.url.origin;
				sendOrgInvitation({
					to: input.email,
					inviterName: ctx.user.name,
					orgName: orgs[0].name,
					token,
					origin
				}).catch(console.error);

				return invitation;
			});
		}),

	// Public — returns invitation info for the accept page
	inviteByToken: publicProcedure.input(z.string()).query(async ({ ctx, input: token }) => {
		const rows = await ctx.db
			.select({
				id: orgInvitation.id,
				orgId: orgInvitation.orgId,
				orgName: orgInvitation.orgName,
				invitedEmail: orgInvitation.invitedEmail,
				status: orgInvitation.status,
				expiresAt: orgInvitation.expiresAt
			})
			.from(orgInvitation)
			.where(eq(orgInvitation.token, token))
			.limit(1);

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return rows[0];
	}),

	acceptInvite: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: token }) => {
		const invitations = await ctx.db
			.select()
			.from(orgInvitation)
			.where(and(eq(orgInvitation.token, token), eq(orgInvitation.status, 'pending')))
			.limit(1);

		const invitation = invitations[0];
		if (!invitation) {
			throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired invitation' });
		}

		if (invitation.expiresAt < new Date()) {
			await ctx.db
				.update(orgInvitation)
				.set({ status: 'expired' })
				.where(eq(orgInvitation.id, invitation.id));
			throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
		}

		// Check not already a member
		const existing = await ctx.db
			.select({ id: organizationMember.id })
			.from(organizationMember)
			.where(
				and(
					eq(organizationMember.orgId, invitation.orgId),
					eq(organizationMember.userId, ctx.user.id)
				)
			)
			.limit(1);

		if (existing[0]) {
			throw new TRPCError({ code: 'CONFLICT', message: 'You are already a member of this organization' });
		}

		// Resolve org owner for denormalized column
		const orgs = await ctx.db
			.select({ ownerId: organization.ownerId })
			.from(organization)
			.where(eq(organization.id, invitation.orgId))
			.limit(1);

		if (!orgs[0]) throw new TRPCError({ code: 'NOT_FOUND' });

		await ctx.db.insert(organizationMember).values({
			id: crypto.randomUUID(),
			orgId: invitation.orgId,
			userId: ctx.user.id,
			orgOwnerId: orgs[0].ownerId,
			role: 'member'
		});

		await ctx.db
			.update(orgInvitation)
			.set({ status: 'accepted' })
			.where(eq(orgInvitation.id, invitation.id));

		return { orgId: invitation.orgId, orgName: invitation.orgName };
	}),

	cancelInvite: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: invitationId }) => {
			const rows = await ctx.withRLS((db) =>
				db
					.delete(orgInvitation)
					.where(
						and(eq(orgInvitation.id, invitationId), eq(orgInvitation.status, 'pending'))
					)
					.returning({ id: orgInvitation.id })
			);
			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return { ok: true };
		}),

	// ── Usage / Quota ─────────────────────────────────────────────────────────

	// Monthly spend for an org (EUR) — owner only, RLS enforces
	getMonthlyUsage: protectedProcedure.input(z.string()).query(async ({ ctx, input: orgId }) => {
		const since = startOfMonth();
		const rows = await ctx.withRLS((db) =>
			db
				.select({ total: sum(aiUsageLog.estimatedCostEur) })
				.from(aiUsageLog)
				.where(and(eq(aiUsageLog.orgId, orgId), gte(aiUsageLog.createdAt, since)))
		);
		return { totalEur: rows[0]?.total ?? '0', since };
	})
});
