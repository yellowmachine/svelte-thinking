import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import { router, protectedProcedure } from '../init';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { project } from '$lib/server/db/schemas/projects.schema';

// ---------------------------------------------------------------------------
// AI: generate a structured list of requirements for a given document type.
// Uses server-side ANTHROPIC_API_KEY (no user key needed).
// ---------------------------------------------------------------------------
export type TemplateType = 'generic' | 'paper' | 'thesis' | 'medical' | 'report';

interface AIGenerateResult {
	template: TemplateType;
	requirements: { name: string; description: string; required: boolean }[];
}

async function generateRequirementsFromAI(description: string): Promise<AIGenerateResult> {
	if (!env.ANTHROPIC_API_KEY) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'ANTHROPIC_API_KEY no configurada.'
		});
	}

	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const response = await anthropic.messages.create({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 1024,
		system: `Eres un experto en documentación académica y técnica.
El usuario describirá el tipo de documento que quiere crear.
Devuelve ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto extra) con este formato exacto:

{
  "template": "paper",
  "requirements": [
    {
      "name": "Nombre de la sección",
      "description": "Descripción breve de qué debe contener esta sección",
      "required": true
    }
  ]
}

Reglas para "template" — elige el más apropiado:
- "paper": artículo de revista o conferencia académica
- "thesis": tesis doctoral o de máster
- "medical": publicación clínica o de ciencias de la salud
- "report": informe técnico o institucional
- "generic": cualquier otro tipo de documento

Reglas para "requirements":
- Entre 4 y 12 elementos según la complejidad.
- Ordenados en el orden natural de redacción/aparición.
- "required" es false solo para secciones claramente opcionales (anexos, agradecimientos).
- Responde en el mismo idioma que el usuario.`,
		messages: [{ role: 'user', content: description }]
	});

	const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';

	type RawResult = { template?: string; requirements?: { name: string; description: string; required: boolean }[] };
	let parsed: RawResult = {};
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = {};
	}

	const validTemplates: TemplateType[] = ['generic', 'paper', 'thesis', 'medical', 'report'];
	const template: TemplateType = validTemplates.includes(parsed.template as TemplateType)
		? (parsed.template as TemplateType)
		: 'generic';

	const requirements = (parsed.requirements ?? [])
		.filter((r) => typeof r.name === 'string' && r.name.length > 0)
		.slice(0, 15)
		.map((r) => ({
			name: r.name,
			description: typeof r.description === 'string' ? r.description : '',
			required: r.required !== false
		}));

	return { template, requirements };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const requirementsRouter = router({
	// List all requirements for a project, ordered by position
	list: protectedProcedure.input(z.string()).query(async ({ ctx, input: projectId }) => {
		return ctx.withRLS((db) =>
			db
				.select()
				.from(projectRequirement)
				.where(eq(projectRequirement.projectId, projectId))
				.orderBy(asc(projectRequirement.order))
		);
	}),

	// Generate requirements from a natural-language description and save them
	generate: protectedProcedure
		.input(
			z.object({
				projectId: z.string(),
				description: z.string().min(5).max(500)
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Verify user is owner
			const rows = (await ctx.withRLS((db) =>
				db
					.select({ id: project.id, ownerId: project.ownerId })
					.from(project)
					.where(eq(project.id, input.projectId))
					.limit(1)
			)) as { id: string; ownerId: string }[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			if (rows[0].ownerId !== ctx.user.id) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el propietario puede generar requisitos.' });
			}

			// Delete existing requirements before regenerating
			await ctx.withRLS((db) =>
				db.delete(projectRequirement).where(eq(projectRequirement.projectId, input.projectId))
			);

			const { template, requirements: aiRequirements } = await generateRequirementsFromAI(input.description);

			if (aiRequirements.length === 0) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'No se pudieron generar requisitos. Intenta con una descripción más detallada.'
				});
			}

			const values = aiRequirements.map((r, i) => ({
				id: crypto.randomUUID(),
				projectId: input.projectId,
				name: r.name,
				description: r.description,
				order: i,
				required: r.required
			}));

			const [inserted] = await Promise.all([
				ctx.withRLS((db) => db.insert(projectRequirement).values(values).returning()),
				ctx.withRLS((db) =>
					db
						.update(project)
						.set({ requirementsPrompt: input.description, requirementsTemplate: template })
						.where(eq(project.id, input.projectId))
				)
			]);

			return inserted;
		}),

	// Assign a document to fulfill a requirement
	fulfill: protectedProcedure
		.input(
			z.object({
				requirementId: z.string(),
				documentId: z.string()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const rows = (await ctx.withRLS((db) =>
				db
					.update(projectRequirement)
					.set({ fulfilledDocumentId: input.documentId })
					.where(eq(projectRequirement.id, input.requirementId))
					.returning({ id: projectRequirement.id })
			)) as { id: string }[];

			if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
			return { id: input.requirementId };
		}),

	// Remove fulfillment from a requirement
	unfulfill: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: requirementId }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.update(projectRequirement)
				.set({ fulfilledDocumentId: null })
				.where(eq(projectRequirement.id, requirementId))
				.returning({ id: projectRequirement.id })
		)) as { id: string }[];

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return { id: requirementId };
	}),

	// Delete a single requirement
	delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input: requirementId }) => {
		const rows = (await ctx.withRLS((db) =>
			db
				.delete(projectRequirement)
				.where(eq(projectRequirement.id, requirementId))
				.returning({ id: projectRequirement.id })
		)) as { id: string }[];

		if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
		return { id: requirementId };
	})
});
