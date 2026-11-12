import { z } from 'zod';
import { eq, and, gte, lte, sql, count, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../init';
import { aiUsageLog } from '$lib/server/db/schemas/ai.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { organization } from '$lib/server/db/schemas/organizations.schema';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { isOrgOwner } from '$lib/domain/permissions';

const dateRangeInput = z.object({
	from: z.string().datetime(),
	to: z.string().datetime()
});

function costSum() {
	return sql<string>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`;
}
function callCount() {
	return count(aiUsageLog.id);
}
function inputSum() {
	return sql<string>`COALESCE(SUM(${aiUsageLog.inputTokens}), 0)`;
}
function outputSum() {
	return sql<string>`COALESCE(SUM(${aiUsageLog.outputTokens}), 0)`;
}

export const usageRouter = router({
	// ── Spending banner (under the navbar) ────────────────────────────────
	// The user's own key only (org keys are the org's money, in its dashboard). Weeks start
	// on Monday; month and week are the database's (UTC) calendar.
	banner: protectedProcedure.query(async ({ ctx }) => {
		const mine = and(eq(aiUsageLog.userId, ctx.user.id), sql`${aiUsageLog.orgId} IS NULL`);
		const thisMonth = sql`${aiUsageLog.createdAt} >= date_trunc('month', now())`;
		const thisWeek = sql`${aiUsageLog.createdAt} >= date_trunc('week', now())`;

		const [totals, last] = await Promise.all([
			ctx.withRLS((db) =>
				db
					.select({
						monthUsd: sql<string>`COALESCE(SUM(${aiUsageLog.costUsd}), 0)`,
						weekUsd: sql<string>`COALESCE(SUM(${aiUsageLog.costUsd}) FILTER (WHERE ${thisWeek}), 0)`,
						monthCalls: count(aiUsageLog.id),
						monthHasEstimates: sql<boolean>`COALESCE(BOOL_OR(${aiUsageLog.costIsEstimate}), false)`
					})
					.from(aiUsageLog)
					.where(and(mine, thisMonth))
					.then((r) => r[0])
			),
			ctx.withRLS((db) =>
				db
					.select({
						task: aiUsageLog.task,
						model: aiUsageLog.model,
						costUsd: aiUsageLog.costUsd,
						costIsEstimate: aiUsageLog.costIsEstimate,
						at: aiUsageLog.createdAt
					})
					.from(aiUsageLog)
					.where(mine)
					.orderBy(desc(aiUsageLog.createdAt))
					.limit(1)
					.then((r) => r[0] ?? null)
			)
		]);

		return {
			monthUsd: Number(totals?.monthUsd ?? 0),
			weekUsd: Number(totals?.weekUsd ?? 0),
			monthCalls: Number(totals?.monthCalls ?? 0),
			monthHasEstimates: Boolean(totals?.monthHasEstimates),
			last: last && {
				task: last.task,
				model: last.model,
				costUsd: last.costUsd === null ? null : Number(last.costUsd),
				costIsEstimate: last.costIsEstimate,
				at: last.at
			}
		};
	}),

	// ── Personal dashboard ─────────────────────────────────────────────────
	personal: protectedProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
		const from = new Date(input.from);
		const to = new Date(input.to);
		const userId = ctx.user.id;

		const where = and(
			eq(aiUsageLog.userId, userId),
			sql`${aiUsageLog.orgId} IS NULL`,
			gte(aiUsageLog.createdAt, from),
			lte(aiUsageLog.createdAt, to)
		);

		const [summary, byDay, byModel, byTask, byProject] = await Promise.all([
			// KPI summary
			ctx.withRLS((db) =>
				db
					.select({
						totalCostUsd: costSum(),
						totalCalls: callCount(),
						totalInputTokens: inputSum(),
						totalOutputTokens: outputSum()
					})
					.from(aiUsageLog)
					.where(where)
					.then((r) => r[0])
			),

			// Cost by day
			ctx.withRLS((db) =>
				db
					.select({
						date: sql<string>`DATE(${aiUsageLog.createdAt})`,
						costUsd: costSum(),
						calls: callCount()
					})
					.from(aiUsageLog)
					.where(where)
					.groupBy(sql`DATE(${aiUsageLog.createdAt})`)
					.orderBy(sql`DATE(${aiUsageLog.createdAt})`)
			),

			// Cost by model
			ctx.withRLS((db) =>
				db
					.select({
						model: aiUsageLog.model,
						costUsd: costSum(),
						calls: callCount(),
						inputTokens: inputSum(),
						outputTokens: outputSum()
					})
					.from(aiUsageLog)
					.where(where)
					.groupBy(aiUsageLog.model)
					.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
			),

			// Cost by task
			ctx.withRLS((db) =>
				db
					.select({
						task: aiUsageLog.task,
						costUsd: costSum(),
						calls: callCount()
					})
					.from(aiUsageLog)
					.where(where)
					.groupBy(aiUsageLog.task)
					.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
			),

			// Cost by project (top 10)
			ctx.withRLS((db) =>
				db
					.select({
						projectId: aiUsageLog.projectId,
						title: project.title,
						costUsd: costSum(),
						calls: callCount()
					})
					.from(aiUsageLog)
					.leftJoin(project, eq(aiUsageLog.projectId, project.id))
					.where(where)
					.groupBy(aiUsageLog.projectId, project.title)
					.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
					.limit(10)
			)
		]);

		return { summary, byDay, byModel, byTask, byProject };
	}),

	// ── Org dashboard ──────────────────────────────────────────────────────
	org: protectedProcedure
		.input(dateRangeInput.extend({ orgId: z.string() }))
		.query(async ({ ctx, input }) => {
			const from = new Date(input.from);
			const to = new Date(input.to);
			const { orgId } = input;

			// Verify requester is org owner
			const [org] = await ctx.withRLS((db) =>
				db
					.select({ ownerId: organization.ownerId })
					.from(organization)
					.where(eq(organization.id, orgId))
					.limit(1)
			);
			if (!org || !isOrgOwner(ctx.user.id, org.ownerId)) {
				throw new TRPCError({ code: 'FORBIDDEN' });
			}

			const where = and(
				eq(aiUsageLog.orgId, orgId),
				gte(aiUsageLog.createdAt, from),
				lte(aiUsageLog.createdAt, to)
			);

			const [summary, byDay, byModel, byTask, byProject, byUser] = await Promise.all([
				// KPI summary
				ctx.withRLS((db) =>
					db
						.select({
							totalCostUsd: costSum(),
							totalCalls: callCount(),
							totalInputTokens: inputSum(),
							totalOutputTokens: outputSum()
						})
						.from(aiUsageLog)
						.where(where)
						.then((r) => r[0])
				),

				// Cost by day
				ctx.withRLS((db) =>
					db
						.select({
							date: sql<string>`DATE(${aiUsageLog.createdAt})`,
							costUsd: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.where(where)
						.groupBy(sql`DATE(${aiUsageLog.createdAt})`)
						.orderBy(sql`DATE(${aiUsageLog.createdAt})`)
				),

				// Cost by model
				ctx.withRLS((db) =>
					db
						.select({
							model: aiUsageLog.model,
							costUsd: costSum(),
							calls: callCount(),
							inputTokens: inputSum(),
							outputTokens: outputSum()
						})
						.from(aiUsageLog)
						.where(where)
						.groupBy(aiUsageLog.model)
						.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
				),

				// Cost by task
				ctx.withRLS((db) =>
					db
						.select({
							task: aiUsageLog.task,
							costUsd: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.where(where)
						.groupBy(aiUsageLog.task)
						.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
				),

				// Cost by project (top 10)
				ctx.withRLS((db) =>
					db
						.select({
							projectId: aiUsageLog.projectId,
							title: project.title,
							costUsd: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.leftJoin(project, eq(aiUsageLog.projectId, project.id))
						.where(where)
						.groupBy(aiUsageLog.projectId, project.title)
						.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
						.limit(10)
				),

				// Cost by user (top 10) — org only
				ctx.withRLS((db) =>
					db
						.select({
							userId: aiUsageLog.userId,
							name: userProfile.displayName,
							costUsd: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.leftJoin(userProfile, eq(aiUsageLog.userId, userProfile.userId))
						.where(where)
						.groupBy(aiUsageLog.userId, userProfile.displayName)
						.orderBy(sql`SUM(${aiUsageLog.costUsd}) DESC`)
						.limit(10)
				)
			]);

			return { summary, byDay, byModel, byTask, byProject, byUser };
		})
});
