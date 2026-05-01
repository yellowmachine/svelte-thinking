import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { env } from '$env/dynamic/private';
import { router, protectedProcedure } from '../init';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { userApiKey, userProfile } from '$lib/server/db/schemas/users.schema';
import { decryptSecret } from '$lib/server/kms';
import { parseTaskConfig, getDefaultModel } from './aiConfig';
import { coerceTemplate, canManageRequirements, type TemplateType } from '$lib/domain/requirements';
import type { Db } from '$lib/server/db';

type WithRLS = (fn: (db: Db) => Promise<unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// AI: generate a structured list of requirements for a given document type.
// Uses the user's configured BYOK provider (OpenRouter / Perplexity).
// ---------------------------------------------------------------------------
export type { TemplateType };

interface AIGenerateResult {
	template: TemplateType;
	requirements: { name: string; description: string; required: boolean }[];
}

const SYSTEM_PROMPT = `Eres un experto en documentación académica y técnica.
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
- Responde en el mismo idioma que el usuario.`;

async function generateRequirementsFromAI(
	description: string,
	withRLS: WithRLS,
	userId: string
): Promise<AIGenerateResult> {
	const [profileRows, keys] = await Promise.all([
		withRLS((db) =>
			(db as Db)
				.select({ aiTaskConfig: userProfile.aiTaskConfig })
				.from(userProfile)
				.where(eq(userProfile.userId, userId))
				.limit(1)
		) as Promise<{ aiTaskConfig: string | null }[]>,

		withRLS((db) =>
			(db as Db)
				.select({
					id: userApiKey.id,
					encryptedApiKey: userApiKey.encryptedApiKey,
					encryptedDataKey: userApiKey.encryptedDataKey,
					iv: userApiKey.iv,
					authTag: userApiKey.authTag,
					enabled: userApiKey.enabled
				})
				.from(userApiKey)
				.where(eq(userApiKey.userId, userId))
		) as Promise<
			{
				id: string;
				encryptedApiKey: string;
				encryptedDataKey: string;
				iv: string;
				authTag: string;
				enabled: boolean;
			}[]
		>
	]);

	const taskConfig = parseTaskConfig(profileRows[0]?.aiTaskConfig ?? null);
	const taskEntry = taskConfig['requirements'];
	const keyRow = taskEntry
		? keys.find((k) => k.id === taskEntry.keyId && k.enabled)
		: keys.find((k) => k.enabled);

	if (!keyRow) {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message:
				'Configura tu API key de OpenRouter en Ajustes → Asistente IA para generar requisitos.'
		});
	}

	let apiKey: string;
	try {
		apiKey = await decryptSecret(keyRow);
	} catch {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Error al descifrar la API key. Vuelve a guardarla en Ajustes.'
		});
	}

	const model = taskEntry?.model ?? getDefaultModel('requirements');

	const extraHeaders = {
		'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
		'X-Title': 'Scholio'
	};

	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			...extraHeaders
		},
		body: JSON.stringify({
			model,
			max_tokens: 1024,
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: description }
			]
		})
	});

	if (!res.ok) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: `Error de OpenRouter (${res.status}).`
		});
	}

	const data = (await res.json()) as { choices: { message: { content: string } }[] };
	const raw = data.choices[0]?.message?.content?.trim() ?? '{}';

	type RawResult = {
		template?: string;
		requirements?: { name: string; description: string; required: boolean }[];
	};
	let parsed: RawResult = {};
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = {};
	}

	const template = coerceTemplate(parsed.template);

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
			if (!canManageRequirements(ctx.user.id, rows[0].ownerId)) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Solo el propietario puede generar requisitos.'
				});
			}

			// Delete existing requirements before regenerating
			await ctx.withRLS((db) =>
				db.delete(projectRequirement).where(eq(projectRequirement.projectId, input.projectId))
			);

			const { template, requirements: aiRequirements } = await generateRequirementsFromAI(
				input.description,
				ctx.withRLS as WithRLS,
				ctx.user.id
			);

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
	unfulfill: protectedProcedure
		.input(z.string())
		.mutation(async ({ ctx, input: requirementId }) => {
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
