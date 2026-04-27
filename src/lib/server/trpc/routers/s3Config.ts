import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { userS3Config, userProfile } from '$lib/server/db/schemas/users.schema';
import {
	orgS3Config,
	organization,
	organizationMember
} from '$lib/server/db/schemas/organizations.schema';
import { encryptSecret } from '$lib/server/kms';
import {
	testS3Connection,
	buildInternalS3Config,
	createS3Client,
	ensureBucket,
	INTERNAL_STORAGE_QUOTA_BYTES
} from '$lib/server/storage';
import {
	getDecryptedUserS3Config,
	invalidateUserS3Cache,
	getDecryptedOrgS3Config,
	invalidateOrgS3Cache
} from '$lib/server/s3Storage';

const s3InputSchema = z.object({
	endpoint: z.string().url(),
	bucket: z.string().min(1).max(63),
	region: z.string().min(1).max(40).default('us-east-1'),
	publicUrl: z.string().url().optional(),
	accessKey: z.string().min(1),
	secretKey: z.string().min(1)
});

async function encryptCredentials(accessKey: string, secretKey: string) {
	try {
		const encrypted = await encryptSecret(JSON.stringify({ accessKey, secretKey }));
		return {
			encryptedCredentials: encrypted.encryptedApiKey,
			encryptedDataKey: encrypted.encryptedDataKey,
			iv: encrypted.iv,
			authTag: encrypted.authTag
		};
	} catch {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Error encrypting credentials. Check KMS_MASTER_KEY configuration.'
		});
	}
}

// ── Owner/admin guard for org procedures ─────────────────────────────────────
// Uses withRLS so that app.current_user_id is set and RLS evaluates correctly.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WithRLS = (fn: (db: any) => any) => Promise<any>;

async function assertOrgOwner(withRLS: WithRLS, orgId: string, userId: string) {
	const [org] = (await withRLS((db) =>
		db
			.select({ id: organization.id })
			.from(organization)
			.where(and(eq(organization.id, orgId), eq(organization.ownerId, userId)))
			.limit(1)
	)) as { id: string }[];

	if (!org) {
		const [member] = (await withRLS((db) =>
			db
				.select({ role: organizationMember.role })
				.from(organizationMember)
				.where(and(eq(organizationMember.orgId, orgId), eq(organizationMember.userId, userId)))
				.limit(1)
		)) as { role: string }[];

		if (!member || member.role !== 'admin') {
			throw new TRPCError({
				code: 'FORBIDDEN',
				message: 'Only the organization owner or an admin can manage S3 storage.'
			});
		}
	}
}

export const s3ConfigRouter = router({
	// ── User S3 ────────────────────────────────────────────────────────────

	get: protectedProcedure.query(async ({ ctx }) => {
		const [row] = (await ctx.withRLS((db) =>
			db
				.select({
					endpoint: userS3Config.endpoint,
					bucket: userS3Config.bucket,
					region: userS3Config.region,
					publicUrl: userS3Config.publicUrl,
					verified: userS3Config.verified,
					createdAt: userS3Config.createdAt
				})
				.from(userS3Config)
				.where(eq(userS3Config.userId, ctx.user.id))
				.limit(1)
		)) as {
			endpoint: string;
			bucket: string;
			region: string;
			publicUrl: string | null;
			verified: boolean;
			createdAt: Date;
		}[];
		return row ?? null;
	}),

	set: protectedProcedure.input(s3InputSchema).mutation(async ({ ctx, input }) => {
		const creds = await encryptCredentials(input.accessKey, input.secretKey);

		const existing = (await ctx.withRLS((db) =>
			db
				.select({ id: userS3Config.id })
				.from(userS3Config)
				.where(eq(userS3Config.userId, ctx.user.id))
				.limit(1)
		)) as { id: string }[];

		if (existing.length > 0) {
			await ctx.withRLS((db) =>
				db
					.update(userS3Config)
					.set({
						endpoint: input.endpoint,
						bucket: input.bucket,
						region: input.region,
						publicUrl: input.publicUrl ?? null,
						...creds,
						verified: false,
						updatedAt: new Date()
					})
					.where(eq(userS3Config.userId, ctx.user.id))
			);
		} else {
			await ctx.withRLS((db) =>
				db.insert(userS3Config).values({
					id: crypto.randomUUID(),
					userId: ctx.user.id,
					endpoint: input.endpoint,
					bucket: input.bucket,
					region: input.region,
					publicUrl: input.publicUrl ?? null,
					...creds,
					verified: false
				})
			);
		}

		await invalidateUserS3Cache(ctx.user.id);
		return { ok: true };
	}),

	test: protectedProcedure.mutation(async ({ ctx }) => {
		const config = await getDecryptedUserS3Config(ctx.user.id, ctx.withRLS);
		if (!config) throw new TRPCError({ code: 'NOT_FOUND', message: 'S3 no configurado' });

		const result = await testS3Connection(config);
		if (result.ok) {
			await ctx.withRLS((db) =>
				db
					.update(userS3Config)
					.set({ verified: true, updatedAt: new Date() })
					.where(eq(userS3Config.userId, ctx.user.id))
			);
		}
		return result;
	}),

	remove: protectedProcedure.mutation(async ({ ctx }) => {
		await ctx.withRLS((db) => db.delete(userS3Config).where(eq(userS3Config.userId, ctx.user.id)));
		await invalidateUserS3Cache(ctx.user.id);
		return { ok: true };
	}),

	// ── Internal storage (beta) ────────────────────────────────────────────

	internalUsage: protectedProcedure.query(async ({ ctx }) => {
		const [row] = (await ctx.withRLS((db) =>
			db
				.select({
					useInternalStorage: userProfile.useInternalStorage,
					usedBytes: userProfile.internalStorageUsedBytes
				})
				.from(userProfile)
				.where(eq(userProfile.userId, ctx.user.id))
				.limit(1)
		)) as { useInternalStorage: boolean; usedBytes: number }[];

		return {
			enabled: row?.useInternalStorage ?? false,
			usedBytes: row?.usedBytes ?? 0,
			quotaBytes: INTERNAL_STORAGE_QUOTA_BYTES
		};
	}),

	enableInternal: protectedProcedure.mutation(async ({ ctx }) => {
		const config = buildInternalS3Config(ctx.user.id);
		const client = createS3Client(config);
		try {
			await ensureBucket(client, config.bucket);
		} catch {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Could not initialize storage bucket. Try again later.'
			});
		}

		await ctx.withRLS((db) =>
			db
				.update(userProfile)
				.set({ useInternalStorage: true, updatedAt: new Date() })
				.where(eq(userProfile.userId, ctx.user.id))
		);
		return { ok: true };
	}),

	disableInternal: protectedProcedure.mutation(async ({ ctx }) => {
		await ctx.withRLS((db) =>
			db
				.update(userProfile)
				.set({ useInternalStorage: false, updatedAt: new Date() })
				.where(eq(userProfile.userId, ctx.user.id))
		);
		return { ok: true };
	}),

	// ── Org S3 ─────────────────────────────────────────────────────────────

	getOrg: protectedProcedure.input(z.string()).query(async ({ ctx, input: orgId }) => {
		await assertOrgOwner(ctx.withRLS, orgId, ctx.user.id);

		const [row] = (await ctx.withRLS((db) =>
			db
				.select({
					endpoint: orgS3Config.endpoint,
					bucket: orgS3Config.bucket,
					region: orgS3Config.region,
					publicUrl: orgS3Config.publicUrl,
					verified: orgS3Config.verified,
					createdAt: orgS3Config.createdAt
				})
				.from(orgS3Config)
				.where(eq(orgS3Config.orgId, orgId))
				.limit(1)
		)) as {
			endpoint: string;
			bucket: string;
			region: string;
			publicUrl: string | null;
			verified: boolean;
			createdAt: Date;
		}[];

		return row ?? null;
	}),

	setOrg: protectedProcedure
		.input(z.object({ orgId: z.string(), config: s3InputSchema }))
		.mutation(async ({ ctx, input }) => {
			await assertOrgOwner(ctx.withRLS, input.orgId, ctx.user.id);

			const creds = await encryptCredentials(input.config.accessKey, input.config.secretKey);

			const [existing] = (await ctx.withRLS((db) =>
				db
					.select({ id: orgS3Config.id })
					.from(orgS3Config)
					.where(eq(orgS3Config.orgId, input.orgId))
					.limit(1)
			)) as { id: string }[];

			if (existing) {
				await ctx.withRLS((db) =>
					db
						.update(orgS3Config)
						.set({
							endpoint: input.config.endpoint,
							bucket: input.config.bucket,
							region: input.config.region,
							publicUrl: input.config.publicUrl ?? null,
							...creds,
							verified: false,
							updatedAt: new Date()
						})
						.where(eq(orgS3Config.orgId, input.orgId))
				);
			} else {
				await ctx.withRLS((db) =>
					db.insert(orgS3Config).values({
						id: crypto.randomUUID(),
						orgId: input.orgId,
						endpoint: input.config.endpoint,
						bucket: input.config.bucket,
						region: input.config.region,
						publicUrl: input.config.publicUrl ?? null,
						...creds,
						verified: false
					})
				);
			}

			await invalidateOrgS3Cache(input.orgId);
			return { ok: true };
		}),

	testOrg: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: orgId }) => {
		await assertOrgOwner(ctx.withRLS, orgId, ctx.user.id);

		const config = await getDecryptedOrgS3Config(orgId, ctx.withRLS);
		if (!config)
			throw new TRPCError({ code: 'NOT_FOUND', message: 'S3 de organización no configurado' });

		const result = await testS3Connection(config);
		if (result.ok) {
			await ctx.withRLS((db) =>
				db
					.update(orgS3Config)
					.set({ verified: true, updatedAt: new Date() })
					.where(eq(orgS3Config.orgId, orgId))
			);
		}
		return result;
	}),

	removeOrg: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: orgId }) => {
		await assertOrgOwner(ctx.withRLS, orgId, ctx.user.id);

		await ctx.withRLS((db) => db.delete(orgS3Config).where(eq(orgS3Config.orgId, orgId)));
		await invalidateOrgS3Cache(orgId);
		return { ok: true };
	})
});
