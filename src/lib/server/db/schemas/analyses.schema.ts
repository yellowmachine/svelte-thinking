import { text, timestamp, jsonb, pgPolicy, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { scholioSchema } from '../scholio-schema';
import { project } from './projects.schema';
import { projectDataset } from './datasets.schema';

export const analysisStatusEnum = scholioSchema.enum('analysis_status', [
	'pending',
	'running',
	'completed',
	'failed'
]);

export const analysisTypeEnum = scholioSchema.enum('analysis_type', ['describe', 'ttest']);

export const projectAnalysis = scholioSchema
	.table(
		'project_analysis',
		{
			id: text('id').primaryKey(),
			projectId: text('project_id')
				.notNull()
				.references(() => project.id, { onDelete: 'cascade' }),
			datasetId: text('dataset_id')
				.notNull()
				.references(() => projectDataset.id, { onDelete: 'cascade' }),
			type: analysisTypeEnum('type').notNull(),
			parameters: jsonb('parameters').notNull().default({}),
			result: jsonb('result'),
			status: analysisStatusEnum('status').notNull().default('pending'),
			errorMessage: text('error_message'),
			createdBy: text('created_by').notNull(),
			createdAt: timestamp('created_at').notNull().defaultNow()
		},
		(t) => [
			index('analysis_project_idx').on(t.projectId),
			index('analysis_dataset_idx').on(t.datasetId),

			pgPolicy('analysis_access', {
				for: 'all',
				using: sql`
				EXISTS (
					SELECT 1 FROM scholio.project
					WHERE project.id = ${t.projectId}
					AND (
						project.owner_id = nullif(current_setting('app.current_user_id', true), '')
						OR EXISTS (
							SELECT 1 FROM scholio.project_collaborator
							WHERE project_collaborator.project_id = project.id
							AND project_collaborator.user_id = nullif(current_setting('app.current_user_id', true), '')
						)
					)
				)
			`
			})
		]
	)
	.enableRLS();
