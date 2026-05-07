import { z } from 'zod';
import { eq, and, gte, lte, sql, count } from 'drizzle-orm';
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
	return sql<string>`COALESCE(SUM(${aiUsageLog.estimatedCostEur}), 0)`;
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
						totalCostEur: costSum(),
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
						costEur: costSum(),
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
						costEur: costSum(),
						calls: callCount(),
						inputTokens: inputSum(),
						outputTokens: outputSum()
					})
					.from(aiUsageLog)
					.where(where)
					.groupBy(aiUsageLog.model)
					.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
			),

			// Cost by task
			ctx.withRLS((db) =>
				db
					.select({
						task: aiUsageLog.task,
						costEur: costSum(),
						calls: callCount()
					})
					.from(aiUsageLog)
					.where(where)
					.groupBy(aiUsageLog.task)
					.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
			),

			// Cost by project (top 10)
			ctx.withRLS((db) =>
				db
					.select({
						projectId: aiUsageLog.projectId,
						title: project.title,
						costEur: costSum(),
						calls: callCount()
					})
					.from(aiUsageLog)
					.leftJoin(project, eq(aiUsageLog.projectId, project.id))
					.where(where)
					.groupBy(aiUsageLog.projectId, project.title)
					.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
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
							totalCostEur: costSum(),
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
							costEur: costSum(),
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
							costEur: costSum(),
							calls: callCount(),
							inputTokens: inputSum(),
							outputTokens: outputSum()
						})
						.from(aiUsageLog)
						.where(where)
						.groupBy(aiUsageLog.model)
						.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
				),

				// Cost by task
				ctx.withRLS((db) =>
					db
						.select({
							task: aiUsageLog.task,
							costEur: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.where(where)
						.groupBy(aiUsageLog.task)
						.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
				),

				// Cost by project (top 10)
				ctx.withRLS((db) =>
					db
						.select({
							projectId: aiUsageLog.projectId,
							title: project.title,
							costEur: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.leftJoin(project, eq(aiUsageLog.projectId, project.id))
						.where(where)
						.groupBy(aiUsageLog.projectId, project.title)
						.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
						.limit(10)
				),

				// Cost by user (top 10) — org only
				ctx.withRLS((db) =>
					db
						.select({
							userId: aiUsageLog.userId,
							name: userProfile.displayName,
							costEur: costSum(),
							calls: callCount()
						})
						.from(aiUsageLog)
						.leftJoin(userProfile, eq(aiUsageLog.userId, userProfile.userId))
						.where(where)
						.groupBy(aiUsageLog.userId, userProfile.displayName)
						.orderBy(sql`SUM(${aiUsageLog.estimatedCostEur}) DESC`)
						.limit(10)
				)
			]);

			return { summary, byDay, byModel, byTask, byProject, byUser };
		})
});
