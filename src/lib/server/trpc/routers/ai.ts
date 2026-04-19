import { z } from 'zod';
import { eq, desc, asc, inArray, and, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { env } from '$env/dynamic/private';
import { router, protectedProcedure } from '../init';
import { aiConversation, aiMessage, aiUsageLog } from '$lib/server/db/schemas/ai.schema';
import { document, documentVersion } from '$lib/server/db/schemas/documents.schema';
import { project } from '$lib/server/db/schemas/projects.schema';
import { projectContextLink } from '$lib/server/db/schemas/contextLinks.schema';
import { projectRequirement } from '$lib/server/db/schemas/requirements.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { issue } from '$lib/server/db/schemas/issues.schema';
import { userApiKey, userProfile, userSpellAllowlist } from '$lib/server/db/schemas/users.schema';
import { organization, organizationMember, organizationApiKey } from '$lib/server/db/schemas/organizations.schema';
import { decryptSecret } from '$lib/server/kms';
import { type AiTask, getDefaultModel, parseTaskConfig, fetchOpenRouterPrices } from './aiConfig';
import { indexDocument, embedQuery } from '$lib/server/embeddings';
import { SUMMARY_MIN_CHARS } from '$lib/server/documentSummary';
import type { Db } from '$lib/server/db';

export type WithRLS = (fn: (db: Db) => Promise<unknown>) => Promise<unknown>;

// Pending actions are proposed by the agent and must be confirmed by the user before executing.
export type PendingAction =
  | {
      type: 'create_document';
      title: string;
      docType: 'paper' | 'notes' | 'outline' | 'bibliography' | 'supplementary';
      content: string;
      /** If set, this requirement will be fulfilled with the new document after creation. */
      requirementId?: string;
    }
  | {
      type: 'create_issue';
      title: string;
      content?: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
    };

// Editor agent actions — proposed edits on the currently open document.
export type PendingEditorAction =
  | { type: 'replace_text'; anchorText: string; replacement: string; explanation: string }
  | { type: 'insert_after'; anchorText: string; content: string; explanation: string };

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

async function throwProviderError(res: Response): Promise<never> {
  const providerLabel = 'OpenRouter';
  let message: string;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: number } };
    const msg = body?.error?.message ?? '';
    const code = body?.error?.code ?? res.status;
    if (code === 401) message = `API key de ${providerLabel} inválida. Revísala en Ajustes → Asistente IA.`;
    else if (code === 402) message = `Has agotado los créditos de ${providerLabel}. Recarga tu cuenta.`;
    else if (code === 429) message = `Límite de peticiones alcanzado en ${providerLabel}. Espera un momento.`;
    else message = msg || `Error de ${providerLabel} (${res.status}).`;
  } catch {
    message = `Error de ${providerLabel} (${res.status}).`;
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
}

// ---------------------------------------------------------------------------
// Project index  (~400 tokens, metadata only — no document content)
// ---------------------------------------------------------------------------

async function buildProjectIndex(withRLS: WithRLS, projectId: string): Promise<string> {
  const [proj, docs, reqs, refCount, theologyCount, projectIssues] = await Promise.all([
    withRLS((db) =>
      db
        .select({
          title: project.title,
          description: project.description,
          requirementsTemplate: project.requirementsTemplate
        })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1)
    ) as Promise<{ title: string; description: string | null; requirementsTemplate: string | null }[]>,

    withRLS((db) =>
      db
        .select({
          id: document.id,
          title: document.title,
          type: document.type,
          updatedAt: document.updatedAt,
          aiSummary: documentVersion.aiSummary,
          // Content only for small documents (avoids pulling huge text for large ones)
          content: sql<string | null>`CASE WHEN length(${documentVersion.content}) < ${SUMMARY_MIN_CHARS} THEN ${documentVersion.content} ELSE NULL END`,
          contentLength: sql<number>`coalesce(length(${documentVersion.content}), 0)`
        })
        .from(document)
        .leftJoin(documentVersion, eq(document.currentVersionId, documentVersion.id))
        .where(eq(document.projectId, projectId))
        .orderBy(desc(document.updatedAt))
    ) as Promise<{ id: string; title: string; type: string; updatedAt: Date; aiSummary: string | null; content: string | null; contentLength: number }[]>,

    withRLS((db) =>
      db
        .select({
          id: projectRequirement.id,
          name: projectRequirement.name,
          required: projectRequirement.required,
          fulfilledDocumentId: projectRequirement.fulfilledDocumentId,
          order: projectRequirement.order
        })
        .from(projectRequirement)
        .where(eq(projectRequirement.projectId, projectId))
        .orderBy(asc(projectRequirement.order))
    ) as Promise<{ id: string; name: string; required: boolean; fulfilledDocumentId: string | null; order: number }[]>,

    withRLS((db) =>
      db
        .select({ total: count() })
        .from(projectReference)
        .where(eq(projectReference.projectId, projectId))
    ) as Promise<{ total: number }[]>,

    withRLS((db) =>
      db
        .select({ total: count() })
        .from(reference)
        .innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
        .where(
          and(
            eq(projectReference.projectId, projectId),
            inArray(reference.type, ['magisterial', 'patristic'])
          )
        )
    ) as Promise<{ total: number }[]>,

    withRLS((db) =>
      db
        .select({ id: issue.id, title: issue.title, status: issue.status, priority: issue.priority })
        .from(issue)
        .where(and(eq(issue.projectId, projectId), eq(issue.isPrivate, false)))
        .orderBy(asc(issue.createdAt))
    ) as Promise<{ id: string; title: string; status: string; priority: string }[]>
  ]);

  if (!proj[0]) return '';
  const p = proj[0];
  const lines: string[] = [];

  lines.push(`Project: "${p.title}"`);
  if (p.description) lines.push(`Description: ${p.description}`);
  if (p.requirementsTemplate) lines.push(`Document type: ${p.requirementsTemplate}`);
  lines.push('');

  if (docs.length > 0) {
    lines.push('## PROJECT DOCUMENTS');
    lines.push('');
    for (const doc of docs) {
      const date = doc.updatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      lines.push(`### [${doc.id}] "${doc.title}" (${doc.type}) — ${date}`);
      if (doc.aiSummary) {
        lines.push(doc.aiSummary);
      } else if (doc.content) {
        lines.push(doc.content);
      } else if (doc.contentLength > 0) {
        lines.push(`*(~${Math.round(doc.contentLength / 6).toLocaleString()} words — summary pending. Use read_document to read full content.)*`);
      } else {
        lines.push('*(no committed content yet)*');
      }
      lines.push('');
    }
  } else {
    lines.push('DOCUMENTS: none yet.');
  }
  lines.push('');

  if (reqs.length > 0) {
    const fulfilled = reqs.filter((r) => r.fulfilledDocumentId !== null).length;
    lines.push(`REQUIREMENTS (${fulfilled}/${reqs.length} completed, use get_requirement_details for descriptions):`);
    for (const req of reqs) {
      const icon = req.fulfilledDocumentId ? '✓' : req.required ? '✗' : '○';
      const docRef = req.fulfilledDocumentId ? ` → [${req.fulfilledDocumentId}]` : '';
      const opt = req.required ? '' : ' (optional)';
      lines.push(`  ${icon} "${req.name}"${opt}${docRef}`);
    }
    lines.push('');
  }

  const refTotal = refCount[0]?.total ?? 0;
  if (refTotal > 0) {
    lines.push(`REFERENCES: ${refTotal} entries (use list_references to view them).`);
  }

  if (projectIssues.length > 0) {
    const STATUS_ICON: Record<string, string> = { open: '○', in_progress: '◑', closed: '✓' };
    const open = projectIssues.filter((i) => i.status !== 'closed');
    lines.push(`ISSUES (${open.length} open / ${projectIssues.length} total, use list_issues for full details):`);
    for (const iss of projectIssues) {
      const icon = STATUS_ICON[iss.status] ?? '○';
      lines.push(`  ${icon} [${iss.id}] "${iss.title}" (${iss.priority})`);
    }
    lines.push('');
  }

  const hasTheology = (theologyCount[0]?.total ?? 0) > 0;
  if (hasTheology) {
    lines.push('');
    lines.push(THEOLOGY_CONTEXT);
  }

  return lines.filter((l) => l !== undefined).join('\n');
}

// ---------------------------------------------------------------------------
// Project context  (rich snapshot for one-shot drafting — includes abstracts,
// requirement descriptions and document previews, no tool calls needed)
// ---------------------------------------------------------------------------

async function buildProjectContext(withRLS: WithRLS, projectId: string): Promise<string> {
  const [proj, reqs, refs, docs] = await Promise.all([
    withRLS((db) =>
      db
        .select({ title: project.title, description: project.description })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1)
    ) as Promise<{ title: string; description: string | null }[]>,

    withRLS((db) =>
      db
        .select({
          name: projectRequirement.name,
          description: projectRequirement.description,
          required: projectRequirement.required,
          fulfilledDocumentId: projectRequirement.fulfilledDocumentId,
          order: projectRequirement.order
        })
        .from(projectRequirement)
        .where(eq(projectRequirement.projectId, projectId))
        .orderBy(asc(projectRequirement.order))
    ) as Promise<{ name: string; description: string | null; required: boolean; fulfilledDocumentId: string | null; order: number }[]>,

    withRLS((db) =>
      db
        .select({
          citeKey: reference.citeKey,
          title: reference.title,
          authors: reference.authors,
          year: reference.year,
          abstract: reference.abstract
        })
        .from(reference)
        .innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
        .where(eq(projectReference.projectId, projectId))
    ) as Promise<{ citeKey: string; title: string; authors: unknown; year: number | null; abstract: string | null }[]>,

    withRLS((db) =>
      db
        .select({
          title: document.title,
          type: document.type,
          draftContent: document.draftContent,
          wordCount: sql<number>`coalesce(length(${document.draftContent}) / 6, 0)`
        })
        .from(document)
        .where(eq(document.projectId, projectId))
        .orderBy(desc(document.updatedAt))
    ) as Promise<{ title: string; type: string; draftContent: string | null; wordCount: number }[]>
  ]);

  if (!proj[0]) return '';
  const lines: string[] = [`Project: "${proj[0].title}"`];
  if (proj[0].description) lines.push(`Description: ${proj[0].description}`);
  lines.push('');

  // Requirements — all, with descriptions and status
  if (reqs.length > 0) {
    lines.push('## Project requirements');
    for (const r of reqs) {
      const icon = r.fulfilledDocumentId ? '✓' : r.required ? '✗' : '○';
      const opt = r.required ? '' : ' (optional)';
      lines.push(`${icon} "${r.name}"${opt}`);
      if (r.description) lines.push(`   ${r.description}`);
    }
    lines.push('');
  }

  // References — with abstract preview (≤200 chars)
  if (refs.length > 0) {
    lines.push('## Available bibliography');
    lines.push('Use citekeys in brackets when citing: [@citeKey]');
    for (const r of refs) {
      const authors = ((r.authors ?? []) as { first?: string; last?: string }[])
        .map((a) => [a.last, a.first].filter(Boolean).join(', '))
        .join('; ');
      const year = r.year ? ` (${r.year})` : '';
      const abstract = r.abstract ? `\n   Abstract: ${r.abstract.slice(0, 200)}${r.abstract.length > 200 ? '…' : ''}` : '';
      lines.push(`[@${r.citeKey}] ${authors}${year}. ${r.title}.${abstract}`);
    }
    lines.push('');
  }

  // Existing documents — first 400 chars as preview
  const filledDocs = docs.filter((d) => d.draftContent && d.draftContent.trim().length > 0);
  if (filledDocs.length > 0) {
    lines.push('## Existing documents');
    for (const d of filledDocs) {
      const words = d.wordCount > 0 ? `~${d.wordCount.toLocaleString()} words` : '';
      lines.push(`### ${d.title} (${d.type})${words ? ` — ${words}` : ''}`);
      const preview = d.draftContent!.slice(0, 400).trim();
      lines.push(preview + (d.draftContent!.length > 400 ? '\n[…]' : ''));
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool definitions  (OpenAI function-calling format, compatible with OpenRouter)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_document',
      description:
        'Read the full content of a project document. ' +
        'Use this when you need to analyse, review, or quote the content of a specific document in detail.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Document ID (shown in brackets in the index)'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_documents_semantic',
      description:
        'Search for relevant passages across project documents using semantic similarity. ' +
        'Returns the chunks closest in meaning to the query, even without exact word matches. ' +
        'Use when you need to find content about a specific topic, concept, or idea.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Description of the content you are looking for (natural language)'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_references',
      description: 'Returns the full project bibliography with citekeys.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_requirement_details',
      description:
        'Returns project requirements with their full descriptions and current status. ' +
        'Useful for understanding which sections are missing or what each one should contain.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_issues',
      description:
        'Returns the list of project issues with their status and priority. ' +
        'Use this to understand what aspects or problems have been flagged in the project.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_issue',
      description:
        'Proposes creating a new issue in the project. ' +
        'Issues track aspects, problems or tasks related to the project that need attention. ' +
        'The user will see a confirmation card before the issue is created. ' +
        'IMPORTANT: always describe in text what you are about to propose BEFORE calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short, descriptive issue title' },
          content: { type: 'string', description: 'Issue description or body in Markdown (optional)' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Issue priority (default: medium)'
          }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_document',
      description:
        'Proposes creating a new document in the project with generated content. ' +
        'The user will see a confirmation card before the document is created. ' +
        'IMPORTANT: always describe in text what you are about to propose BEFORE calling this tool. ' +
        'Use requirementId if there is a pending requirement this document would fulfil.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title' },
          type: {
            type: 'string',
            enum: ['paper', 'notes', 'outline', 'bibliography', 'supplementary'],
            description: 'Document type'
          },
          content: { type: 'string', description: 'Full content in Markdown' },
          requirementId: {
            type: 'string',
            description: 'ID of the requirement to link to this document after creation (optional)'
          }
        },
        required: ['title', 'type', 'content']
      }
    }
  }
] as const;

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

type ToolResult = { output: string; docsUsed: { id: string; title: string }[] };

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  withRLS: WithRLS,
  projectId: string
): Promise<ToolResult> {
  switch (name) {
    case 'read_document': {
      const id = args.id as string;
      if (!id) return { output: 'Error: missing required parameter id.', docsUsed: [] };
      const rows = (await withRLS((db) =>
        db
          .select({
            title: document.title,
            type: document.type,
            content: document.draftContent
          })
          .from(document)
          .where(and(eq(document.id, id), eq(document.projectId, projectId)))
          .limit(1)
      )) as { title: string; type: string; content: string | null }[];

      if (!rows[0]) return { output: `Error: document "${id}" not found in this project.`, docsUsed: [] };
      const content = rows[0].content?.trim() || '*(sin contenido todavía)*';
      return {
        output: `# ${rows[0].title} (${rows[0].type})\n\n${content}`,
        docsUsed: [{ id, title: rows[0].title }]
      };
    }

    case 'search_documents_semantic': {
      const query = ((args.query as string) ?? '').trim();
      if (!query) return { output: 'Error: missing required parameter query.', docsUsed: [] };

      const queryVec = await embedQuery(query);
      const vecLiteral = `[${queryVec.join(',')}]`;

      const result = await withRLS((db) =>
        db.execute(sql`
					SELECT dc.text, dc.document_id, d.title, d.id AS doc_id
					FROM scholio.document_chunk dc
					JOIN scholio.document d ON d.id = dc.document_id
					WHERE dc.project_id = ${projectId}
					ORDER BY dc.embedding <=> ${vecLiteral}::vector
					LIMIT 6
				`)
      );

      const rows = result as unknown as { title: string; doc_id: string; text: string }[];
      if (!rows.length) return { output: `No results for "${query}". Documents may not be indexed yet.`, docsUsed: [] };

      const seen = new Map<string, string>();
      const output: string[] = [];
      for (const row of rows) {
        output.push(`**${row.title}** [${row.doc_id}]\n  ${row.text.replace(/\n/g, ' ')}`);
        seen.set(row.doc_id, row.title);
      }
      return {
        output: output.join('\n\n'),
        docsUsed: [...seen.entries()].map(([id, title]) => ({ id, title }))
      };
    }

    case 'list_references': {
      const refs = (await withRLS((db) =>
        db
          .select({ ref: reference })
          .from(reference)
          .innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
          .where(eq(projectReference.projectId, projectId))
      )) as { ref: typeof reference.$inferSelect }[];

      if (refs.length === 0) return { output: 'This project has no bibliography entries yet.', docsUsed: [] };

      return {
        output: refs
          .map(({ ref: r }) => {
            const authors = ((r.authors ?? []) as { first?: string; last?: string }[])
              .map((a) => [a.last, a.first].filter(Boolean).join(', '))
              .join('; ');
            const year = r.year ? ` (${r.year})` : '';
            const doi = r.doi ? ` DOI: ${r.doi}` : '';
            return `[@${r.citeKey}] ${authors}${year}. ${r.title}.${doi}`;
          })
          .join('\n'),
        docsUsed: []
      };
    }

    case 'get_requirement_details': {
      const reqs = (await withRLS((db) =>
        db
          .select()
          .from(projectRequirement)
          .where(eq(projectRequirement.projectId, projectId))
          .orderBy(asc(projectRequirement.order))
      )) as (typeof projectRequirement.$inferSelect)[];

      if (reqs.length === 0) return { output: 'This project has no requirements defined yet.', docsUsed: [] };

      return {
        output: reqs
          .map((r) => {
            const status = r.fulfilledDocumentId
              ? `✓ cumplido → [${r.fulfilledDocumentId}]`
              : r.required
                ? '✗ pendiente (obligatorio)'
                : '○ pendiente (opcional)';
            const desc = r.description ? `\n    ${r.description}` : '';
            return `• "${r.name}" — ${status}${desc}`;
          })
          .join('\n'),
        docsUsed: []
      };
    }

    case 'list_issues': {
      const issues = (await withRLS((db) =>
        db
          .select({
            id: issue.id,
            title: issue.title,
            status: issue.status,
            priority: issue.priority,
            content: issue.content,
            createdAt: issue.createdAt
          })
          .from(issue)
          .where(eq(issue.projectId, projectId))
          .orderBy(asc(issue.createdAt))
      )) as { id: string; title: string; status: string; priority: string; content: string | null; createdAt: Date }[];

      if (issues.length === 0) return { output: 'This project has no issues yet.', docsUsed: [] };

      const STATUS_ICON: Record<string, string> = { open: '○', in_progress: '◑', closed: '✓' };
      return {
        output: issues
          .map((iss) => {
            const icon = STATUS_ICON[iss.status] ?? '○';
            const preview = iss.content ? ` — ${iss.content.slice(0, 120).replace(/\n/g, ' ')}${iss.content.length > 120 ? '…' : ''}` : '';
            return `${icon} [${iss.id}] "${iss.title}" (${iss.status}, ${iss.priority})${preview}`;
          })
          .join('\n'),
        docsUsed: []
      };
    }

    default:
      return { output: `Unknown tool: "${name}".`, docsUsed: [] };
  }
}

// ---------------------------------------------------------------------------
// Agent loop  — runs up to MAX_ITERATIONS tool-call rounds before returning
// ---------------------------------------------------------------------------

const MAX_AGENT_ITERATIONS = 5;

type OAMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

type KeyRow = { id: string; encryptedApiKey: string; encryptedDataKey: string; iv: string; authTag: string; enabled: boolean };

// Resolves the API key and model for a given task.
// If the project belongs to an org and the user is a member, uses the org key.
// Falls back to the user's personal key otherwise.
export async function resolveTaskKey(
  withRLS: WithRLS,
  db: Db,
  userId: string,
  task: AiTask,
  projectId?: string,
  fallbackModel: string = getDefaultModel(task)
): Promise<{ apiKey: string; model: string; resolvedOrgId?: string }> {
  const cacheKey = CACHE_KEY.taskKey(userId, task, projectId ?? '');
  const cached = await cacheGet<{ apiKey: string; model: string; resolvedOrgId?: string }>(cacheKey);
  if (cached) return cached;

  // ── 1. Check if project is linked to an org ───────────────────────────────
  let orgId: string | null = null;
  if (projectId) {
    const projectRows = await withRLS((rdb) =>
      (rdb as Db)
        .select({ orgId: project.orgId })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1)
    ) as { orgId: string | null }[];
    orgId = projectRows[0]?.orgId ?? null;
  }

  // ── 2. If org project ────────────────────────────────────────
  if (orgId) {
    // Verify user is a member (withRLS — member can see their own row)
    const memberRows = await withRLS((rdb) =>
      (rdb as Db)
        .select({ id: organizationMember.id })
        .from(organizationMember)
        .where(and(eq(organizationMember.orgId, orgId!), eq(organizationMember.userId, userId)))
        .limit(1)
    ) as { id: string }[];

    // Also accept the org owner (may not have a member row)
    const ownerRows = await db
      .select({ id: organization.id })
      .from(organization)
      .where(and(eq(organization.id, orgId), eq(organization.ownerId, userId)))
      .limit(1);

    if (memberRows[0] || ownerRows[0]) {
      // Fetch org config + keys without RLS (member RLS blocks key SELECT)
      const [orgRows, orgKeys] = await Promise.all([
        db
          .select({ aiTaskConfig: organization.aiTaskConfig })
          .from(organization)
          .where(eq(organization.id, orgId))
          .limit(1),
        db
          .select({
            id: organizationApiKey.id,
            encryptedApiKey: organizationApiKey.encryptedApiKey,
            encryptedDataKey: organizationApiKey.encryptedDataKey,
            iv: organizationApiKey.iv,
            authTag: organizationApiKey.authTag,
            enabled: organizationApiKey.enabled
          })
          .from(organizationApiKey)
          .where(and(eq(organizationApiKey.orgId, orgId), eq(organizationApiKey.enabled, true)))
      ]);

      const orgConfig = parseTaskConfig(orgRows[0]?.aiTaskConfig ?? null);
      const orgTaskEntry = orgConfig[task];
      const orgKeyRow = (orgTaskEntry
        ? orgKeys.find((k) => k.id === orgTaskEntry.keyId)
        : orgKeys[0]) as KeyRow | undefined;

      if (orgKeyRow) {
        let apiKey: string;
        try {
          apiKey = await decryptSecret(orgKeyRow);
        } catch {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error decrypting org API key.'
          });
        }
        const model = orgTaskEntry?.model ?? fallbackModel;
        const result = { apiKey, model, resolvedOrgId: orgId };
        await cacheSet(cacheKey, result, TTL.taskKey);
        return result;
      }
      else {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Configure organization OpenRouter API key in Settings → Organization → AI Assistant.'
        });
      }
    }
  }

  // ── 3. It's not org ─────────────────────────────────────────────
  const [profileRows, keys] = await Promise.all([
    withRLS((rdb) =>
      (rdb as Db)
        .select({ aiTaskConfig: userProfile.aiTaskConfig })
        .from(userProfile)
        .where(eq(userProfile.userId, userId))
        .limit(1)
    ) as Promise<{ aiTaskConfig: string | null }[]>,

    withRLS((rdb) =>
      (rdb as Db)
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
    ) as Promise<KeyRow[]>
  ]);

  const taskConfig = parseTaskConfig(profileRows[0]?.aiTaskConfig ?? null);
  const taskEntry = taskConfig[task];
  const keyRow = taskEntry
    ? keys.find((k) => k.id === taskEntry.keyId && k.enabled)
    : keys.find((k) => k.enabled); // fallback: first enabled key

  if (!keyRow) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Configure your OpenRouter API key in Settings → AI Assistant.'
    });
  }

  let apiKey: string;
  try {
    apiKey = await decryptSecret(keyRow);
  } catch {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error decrypting API key. Try saving it again in Settings.'
    });
  }

  const model = taskEntry?.model ?? fallbackModel;
  const result = { apiKey, model };
  await cacheSet(cacheKey, result, TTL.taskKey);
  return result;
}
// Fixed USD→EUR rate for cost estimates (good enough for beta quotas)
const USD_TO_EUR = 0.92;

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// Fire-and-forget: inserts a usage record after each AI call
async function logUsage(
  withRLS: WithRLS,
  {
    orgId,
    projectId,
    userId,
    model,
    task,
    inputTokens,
    outputTokens
  }: {
    orgId?: string;
    projectId?: string;
    userId: string;
    model: string;
    task: string;
    inputTokens: number;
    outputTokens: number;
  }
) {
  try {
    const prices = await fetchOpenRouterPrices();
    const price = prices[model];
    let estimatedCostEur: string | undefined;
    if (price) {
      const costUsd = inputTokens * price.input + outputTokens * price.output;
      estimatedCostEur = (costUsd * USD_TO_EUR).toFixed(6);
    }
    await withRLS((db) => db.insert(aiUsageLog).values({
      id: crypto.randomUUID(),
      orgId: orgId ?? null,
      projectId: projectId ?? '',
      userId,
      model,
      task,
      inputTokens,
      outputTokens,
      estimatedCostEur
    }));
  } catch (e) {
    console.error('[logUsage] failed:', e);
  }
}



async function runAgentLoop(
  systemPrompt: string,
  /** Prior turns already persisted in DB (no current user message). */
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  withRLS: WithRLS,
  projectId: string,
  apiKey: string,
  model: string
): Promise<{ content: string; pendingActions: PendingAction[]; docsUsed: { id: string; title: string }[]; inputTokens: number; outputTokens: number }> {
  const messages: OAMessage[] = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const pendingActions: PendingAction[] = [];
  const seenDocs = new Map<string, string>();
  const extraHeaders = { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' };
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!res.ok) await throwProviderError(res);

    const data = (await res.json()) as {
      choices: { message: OAMessage; finish_reason: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    totalInputTokens += data.usage?.prompt_tokens ?? 0;
    totalOutputTokens += data.usage?.completion_tokens ?? 0;

    const choice = data.choices[0];
    if (!choice) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No response from model.' });

    // ── Tool calls → execute and loop ────────────────────────────────────
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      messages.push(choice.message);

      const results = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* empty args */ }

          // ── Write tools: intercept, queue, don't execute yet ──────
          if (tc.function.name === 'create_document') {
            pendingActions.push({
              type: 'create_document',
              title: (args.title as string) || 'Nuevo documento',
              docType: (args.type as Extract<PendingAction, { type: 'create_document' }>['docType']) || 'paper',
              content: (args.content as string) || '',
              requirementId: (args.requirementId as string) || undefined
            });
            return {
              role: 'tool' as const,
              tool_call_id: tc.id,
              content: 'Proposal registered. The user will see a confirmation card.'
            };
          }

          if (tc.function.name === 'create_issue') {
            pendingActions.push({
              type: 'create_issue',
              title: (args.title as string) || 'Nuevo issue',
              content: (args.content as string) || undefined,
              priority: (args.priority as Extract<PendingAction, { type: 'create_issue' }>['priority']) || 'medium'
            });
            return {
              role: 'tool' as const,
              tool_call_id: tc.id,
              content: 'Issue proposed. The user will see a confirmation card.'
            };
          }

          // ── Read tools: execute normally ──────────────────────────
          const { output, docsUsed } = await executeTool(tc.function.name, args, withRLS, projectId);
          for (const d of docsUsed) seenDocs.set(d.id, d.title);
          return { role: 'tool' as const, tool_call_id: tc.id, content: output };
        })
      );
      messages.push(...results);
      continue;
    }

    // ── Final text response ───────────────────────────────────────────────
    return {
      content: choice.message.content ?? '',
      pendingActions,
      docsUsed: [...seenDocs.entries()].map(([id, title]) => ({ id, title })),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    };
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'The agent could not complete the response within the maximum number of steps.'
  });
}

// ---------------------------------------------------------------------------
// Editor agent tools + loop
// ---------------------------------------------------------------------------

const EDITOR_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'check_spelling',
      description:
        'Run a spell check on the full document. Returns spelling errors as proposed corrections the user can accept or discard individually. ' +
        'Use when the user asks to check spelling, fix typos, or proofread the document.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_grammar',
      description:
        'Run a grammar and style check on the full document. Returns grammar issues as proposed corrections. ' +
        'Use when the user asks to check grammar, improve phrasing, or fix academic register.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_untagged',
      description:
        'Find person names and bibliography references in the document that are not yet tagged with [[person:Name]] or [[@citeKey]] tokens. ' +
        'Returns proposed tag insertions the user can accept individually. ' +
        'Use when the user asks to tag persons, link citations, or enrich the document.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_references',
      description:
        'Returns the full project bibliography with citekeys, authors, year, and title. ' +
        'Use when the user wants to insert a citation, check which references are available, ' +
        'or find the correct citekey for a specific work.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'replace_text',
      description:
        'Propose replacing a specific passage in the document. ' +
        'The user will see the original and the replacement side by side, and can accept or reject the change. ' +
        'IMPORTANT: anchorText must be a verbatim copy of the exact text to replace (including spacing and punctuation). ' +
        'Always describe what you are about to change in text BEFORE calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          anchorText: { type: 'string', description: 'Exact substring to replace (verbatim copy from document)' },
          replacement: { type: 'string', description: 'New text that will substitute the anchor' },
          explanation: { type: 'string', description: 'One-sentence description of the change' }
        },
        required: ['anchorText', 'replacement', 'explanation']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'insert_after',
      description:
        'Propose inserting new text immediately after a specific passage. ' +
        'The user will see a preview and can accept or reject it. ' +
        'IMPORTANT: anchorText must be a verbatim copy of the passage to insert after. ' +
        'Always describe what you are about to add in text BEFORE calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          anchorText: { type: 'string', description: 'Exact substring after which to insert (verbatim copy)' },
          content: { type: 'string', description: 'Text to insert' },
          explanation: { type: 'string', description: 'One-sentence description of the addition' }
        },
        required: ['anchorText', 'content', 'explanation']
      }
    }
  }
] as const;

const EDITOR_SYSTEM_PROMPT = `You are Scholio's document editor assistant. Your role is to help the user edit and improve the document they are currently working on.

The full current content of the document is provided below. When the user asks you to make a change, use the replace_text or insert_after tools to propose it. The user will see a before/after preview and can accept or reject each change.

## Your role: editor, not author

You are a critical collaborator, not a yes-man. Pointing out weaknesses in an argument, flagging logical gaps, questioning unsupported claims, or suggesting a stronger structure is part of your job — do it directly and honestly.

However, there is a strict line between critique and authorship:

**In conversation** — be as critical as needed. Challenge assumptions, note inconsistencies, propose alternative angles. This is how you add value.

**In edits (replace_text / insert_after)** — you may only propose changes that serve the user's expressed intent. Never use editing tools to:
- Introduce ideas, claims, or positions the user has not put forward or explicitly requested.
- Restructure or reorder the user's argument based on your own judgment.
- Silently "correct" a position you disagree with.

If a suggested edit would alter the direction or substance of the user's argument, explain the change and its implications in text first, and only proceed with the tool call if the user explicitly confirms they want it.

The user's ideas are theirs. Your critique is yours. Keep those two things clearly separate.

## Rules for editing tools

- anchorText must be a VERBATIM copy of the exact text in the document — do not paraphrase or alter it
- Prefer replacing the smallest possible passage that achieves the goal (a sentence or paragraph, not the whole document)
- You may propose multiple changes in one response, but only if the user asked for several distinct edits
- If asked a question (not an edit), respond in plain text without using tools
- Always explain your change in text BEFORE calling the tool
- If the anchorText you need is ambiguous (same phrase appears multiple times), include enough surrounding context to disambiguate

## Language and style

Match the language and register of the document. Use the same language as the user's message. Maintain academic style.

## What you can do

- Answer questions about the document or the project
- Propose inline text replacements (replace_text)
- Insert new content after a specific passage (insert_after)
- Review clarity, argument flow, style, or academic tone
- Suggest improvements — always as proposals the user can accept or reject

## Diagrams

The document renderer supports Mermaid diagrams. When the user asks for a diagram (flowchart, state machine, sequence diagram, ER diagram, Gantt chart, etc.) use insert_after to add a fenced Mermaid code block. The diagram will render visually in the preview.

Example:
\`\`\`mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Idle : stop
\`\`\``;

type EditorToolContext = {
  spellApiKey: string;
  spellModel: string;
  spellLanguage: string;
  grammarApiKey: string;
  grammarModel: string;
  withRLS: WithRLS;
  projectId: string;
  documentId: string;
};

async function runEditorAgentLoop(
  documentTitle: string,
  documentContent: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  apiKey: string,
  model: string,
  toolCtx: EditorToolContext
): Promise<{ content: string; pendingEditorActions: PendingEditorAction[]; inputTokens: number; outputTokens: number }> {
  const systemPrompt = `${EDITOR_SYSTEM_PROMPT}\n\n---\n\n## Document: "${documentTitle}"\n\n${documentContent}`;

  const messages: OAMessage[] = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const pendingEditorActions: PendingEditorAction[] = [];
  const extraHeaders = { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' };
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < 4; i++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: EDITOR_TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!res.ok) await throwProviderError(res);

    const data = (await res.json()) as {
      choices: { message: OAMessage; finish_reason: string }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    totalInputTokens += data.usage?.prompt_tokens ?? 0;
    totalOutputTokens += data.usage?.completion_tokens ?? 0;

    const choice = data.choices[0];
    if (!choice) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No response from model.' });

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      messages.push(choice.message);

      const results = await Promise.all(choice.message.tool_calls.map(async (tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }

        // ── replace_text / insert_after: propose and continue ──────────
        if (tc.function.name === 'replace_text') {
          pendingEditorActions.push({
            type: 'replace_text',
            anchorText: (args.anchorText as string) ?? '',
            replacement: (args.replacement as string) ?? '',
            explanation: (args.explanation as string) ?? ''
          });
          return { role: 'tool' as const, tool_call_id: tc.id, content: 'Replacement proposed. The user will see a preview.' };
        }

        if (tc.function.name === 'insert_after') {
          pendingEditorActions.push({
            type: 'insert_after',
            anchorText: (args.anchorText as string) ?? '',
            content: (args.content as string) ?? '',
            explanation: (args.explanation as string) ?? ''
          });
          return { role: 'tool' as const, tool_call_id: tc.id, content: 'Insertion proposed. The user will see a preview.' };
        }

        // ── list_references: read tool, returns bibliography ──────────
        if (tc.function.name === 'list_references') {
          const rows = (await toolCtx.withRLS((db) =>
            (db as Db)
              .select({ ref: reference })
              .from(reference)
              .innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
              .where(eq(projectReference.projectId, toolCtx.projectId))
          )) as { ref: typeof reference.$inferSelect }[];
          if (rows.length === 0) {
            return { role: 'tool' as const, tool_call_id: tc.id, content: 'This project has no bibliography entries yet.' };
          }
          const output = rows.map(({ ref: r }) => {
            const authors = ((r.authors ?? []) as { first?: string; last?: string }[])
              .map((a) => [a.last, a.first].filter(Boolean).join(', '))
              .join('; ');
            const year = r.year ? ` (${r.year})` : '';
            return `[@${r.citeKey}] ${authors}${year}. ${r.title}.`;
          }).join('\n');
          return { role: 'tool' as const, tool_call_id: tc.id, content: output };
        }

        // ── check_spelling: run spell check → produce pending actions ──
        if (tc.function.name === 'check_spelling') {
          try {
            const langNote = toolCtx.spellLanguage === 'auto'
              ? 'Detect the language automatically.'
              : `The text is in language code: ${toolCtx.spellLanguage}.`;
            const prompt = `You are a professional proofreader. Analyze the following text for spelling errors.
${langNote}
Return a JSON array. Each item: {"original": "exact substring", "suggestion": "corrected text", "explanation": "brief reason (max 10 words)"}
Rules: only genuine spelling errors; ignore proper nouns, citation keys like [[@smith2023]], Markdown syntax; return [] if correct; ONLY valid JSON.

Text:
${documentContent}`;
            const spellRes = await fetch(OPENROUTER_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${toolCtx.spellApiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
              body: JSON.stringify({ model: toolCtx.spellModel, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 2000 })
            });
            if (spellRes.ok) {
              const spellData = await spellRes.json() as { choices: { message: { content: string } }[] };
              const raw = JSON.parse(
                (spellData.choices[0]?.message?.content ?? '[]').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
              ) as { original: string; suggestion: string; explanation: string }[];
              const corrections = Array.isArray(raw) ? raw.filter((c) => c.original && c.suggestion && documentContent.includes(c.original)) : [];
              for (const c of corrections) {
                pendingEditorActions.push({ type: 'replace_text', anchorText: c.original, replacement: c.suggestion, explanation: c.explanation });
              }
              return { role: 'tool' as const, tool_call_id: tc.id, content: corrections.length > 0 ? `Spell check complete. ${corrections.length} correction(s) proposed.` : 'Spell check complete. No errors found.' };
            }
          } catch { /* fall through */ }
          return { role: 'tool' as const, tool_call_id: tc.id, content: 'Spell check failed. Ask the user to use the Spell button instead.' };
        }

        // ── check_grammar: run grammar check → produce pending actions ──
        if (tc.function.name === 'check_grammar') {
          try {
            const prompt = `You are an expert academic writing assistant. Analyze the following text for grammatical errors, awkward phrasing, and issues with academic register.
Return a JSON array. Each item: {"original": "exact substring", "suggestion": "corrected text", "explanation": "brief reason (max 10 words)"}
Rules: grammar errors only (not spelling); flag unnatural phrasing; suggest formal alternatives for informal register; ignore citation keys and Markdown; return [] if correct; ONLY valid JSON.

Text:
${documentContent}`;
            const grammarRes = await fetch(OPENROUTER_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${toolCtx.grammarApiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
              body: JSON.stringify({ model: toolCtx.grammarModel, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 2000 })
            });
            if (grammarRes.ok) {
              const grammarData = await grammarRes.json() as { choices: { message: { content: string } }[] };
              const raw = JSON.parse(
                (grammarData.choices[0]?.message?.content ?? '[]').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
              ) as { original: string; suggestion: string; explanation: string }[];
              const corrections = Array.isArray(raw) ? raw.filter((c) => c.original && c.suggestion && documentContent.includes(c.original)) : [];
              for (const c of corrections) {
                pendingEditorActions.push({ type: 'replace_text', anchorText: c.original, replacement: c.suggestion, explanation: c.explanation });
              }
              return { role: 'tool' as const, tool_call_id: tc.id, content: corrections.length > 0 ? `Grammar check complete. ${corrections.length} correction(s) proposed.` : 'Grammar check complete. No issues found.' };
            }
          } catch { /* fall through */ }
          return { role: 'tool' as const, tool_call_id: tc.id, content: 'Grammar check failed. Ask the user to use the Grammar button instead.' };
        }

        // ── find_untagged: detect untagged persons/refs → propose replacements ──
        if (tc.function.name === 'find_untagged') {
          try {
            const enrichRows = (await toolCtx.withRLS((db) =>
              (db as Db).execute(sql`SELECT * FROM scholio.find_untagged_in_document(${toolCtx.documentId}, ${toolCtx.projectId})`)
            ).catch(() => null)) as unknown as null;
            // find_untagged is a complex DB function — if unavailable, fall back to model-based detection
            if (!enrichRows) {
              return { role: 'tool' as const, tool_call_id: tc.id, content: 'Person/reference tagging is not available from the chat yet. Ask the user to use the Enrich button in the toolbar.' };
            }
          } catch { /* fall through */ }
          return { role: 'tool' as const, tool_call_id: tc.id, content: 'Use the Enrich button in the toolbar for person and reference tagging.' };
        }

        return { role: 'tool' as const, tool_call_id: tc.id, content: `Unknown tool: "${tc.function.name}".` };
      }));

      messages.push(...results);
      continue;
    }

    return {
      content: choice.message.content ?? '',
      pendingEditorActions,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    };
  }

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'The editor agent could not complete the response.'
  });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Theology context block — injected only when project has magisterial/patristic refs
// ---------------------------------------------------------------------------

const THEOLOGY_CONTEXT = `CONTEXTO TEOLÓGICO (este proyecto contiene fuentes de teología académica):

**Documentos magisteriales** — Cita siempre por párrafo o sección, nunca por página.
  Formato Chicago (nota completa): Autor, *Título* [SIGLUM] (año), §N.
  Ejemplo: Francisco, *Evangelii Gaudium* [EG] (2013), §11.
  Ejemplo concilio: Concilio Vaticano II, *Gaudium et Spes* [GS] (1965), §45.
  Nota abreviada (segunda cita): *EG*, §11 — o bien: Francisco, *EG*, §11.
  Sigla frecuentes: GS (Gaudium et Spes), LG (Lumen Gentium), DV (Dei Verbum),
    SC (Sacrosanctum Concilium), EG (Evangelii Gaudium), LS (Laudato Si'),
    AL (Amoris Laetitia), CCC (Catecismo), CDC (Código de Derecho Canónico).

**Textos patrísticos y medievales** — Cita por obra, libro, capítulo y sección.
  Formato Chicago: Autor, *Título* libro.cap.§, en Colección vol:col (año).
  Ejemplo: Agustín de Hipona, *Confessiones* 10.8.15, en PL 32:456.
  Ediciones críticas estándar: PG (Patrologia Graeca, Migne), PL (Patrologia Latina, Migne),
    SC (Sources Chrétiennes), CCL (Corpus Christianorum Latinorum),
    CSEL (Corpus Scriptorum Ecclesiasticorum Latinorum), GCS.
  Para textos ya en edición moderna con traductor, cita también el traductor.

**Estilo Chicago Notes-Bibliography** (estándar en teología católica):
  - Primera cita: nota completa al pie.
  - Citas siguientes del mismo autor en notas consecutivas: *Ibid.*, §N.
  - Citas siguientes no consecutivas: Apellido, *Título corto*, §N.
  - Bibliografía final: autor invertido, título en cursiva, datos editoriales completos.

**Abreviaturas de revistas y series** — Usa siempre las abreviaturas canónicas
  del SBL Handbook of Style (3.ª ed.). Ejemplos: TS (Theological Studies),
  NTS (New Testament Studies), ZNW (Zeitschrift für die neutestamentliche Wissenschaft),
  EstBíb (Estudios Bíblicos), EphThLov (Ephemerides Theologicae Lovanienses).

Cuando el usuario pida insertar o formatear una cita de estas fuentes, aplica estas reglas.
Si no tienes certeza del siglum correcto o la abreviatura de revista, dilo explícitamente.`;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres Scholio, un asistente de escritura académica especializado en filosofía, teología, ciencias sociales y ciencias formales, integrado en una plataforma de investigación.
El usuario trabaja en proyectos académicos (grado, máster, doctorado o investigación) y tu objetivo es ayudarle a estructurar, revisar y desarrollar documentos de alta calidad usando en lo posible los documentos de su proyecto.

## Idioma y estilo

Responde por defecto en el mismo idioma que el mensaje del usuario. Si la pregunta es ambigua respecto al idioma, usa español europeo formal.
Escribe con registro académico: preciso, argumentativo, sin adornos retóricos innecesarios.
Empieza siempre con una respuesta breve y directa (2–3 frases) y luego desarrolla con secciones usando encabezados Markdown cuando la longitud lo justifique.

## Uso de herramientas

**Usa search_documents_semantic** cuando la pregunta requiera información específica del proyecto:
- El usuario pregunta por algo que ya ha escrito (marco teórico, resultados, bibliografía, notas, requisitos, secciones concretas).
- El usuario pide que redactes o generes algo "basándote en mis documentos" o menciona un documento concreto.
- Regla práctica: si la respuesta correcta depende de lo que hay en el proyecto → busca primero.

**No uses search_documents_semantic** para:
- Conocimiento general de escritura académica (qué es un marco teórico, cómo citar en APA, estructura IMRyD, etc.).
- Transformaciones del texto que el usuario ha pegado completo en el mensaje (reescritura, corrección, traducción): trabaja solo con el fragmento recibido.

**Usa create_document** únicamente cuando:
- El usuario pide explícitamente crear un documento nuevo, O
- El usuario acepta explícitamente un borrador que tú has propuesto en la misma conversación.
Nunca llames a create_document sin confirmación previa en la conversación actual.

**Usa create_issue** únicamente cuando:
- El usuario pide explícitamente crear un issue, O
- El usuario acepta explícitamente un issue que tú has propuesto en la misma conversación.
Antes de llamar a create_issue describe siempre en texto el issue que vas a proponer.

## Estructura de respuesta para tareas complejas

Para preguntas que involucren contenido del proyecto, organiza tu respuesta con estas secciones cuando aplique:

### Respuesta directa
(2–3 frases que contesten la pregunta)

### Desarrollo
(1–2 párrafos en estilo formal con la respuesta elaborada)

### Referencias al proyecto
(Qué documentos o fragmentos has usado: "He utilizado 'Marco teórico', sección sobre epistemología, y 'Notas sobre Popper'")

### Sugerencias
(Bullets concretos: frases modelo, cambios de orden, conexiones entre secciones, términos técnicos a reforzar)

### Próximos pasos
(2–4 bullets accionables)

Para generación de texto (borradores, introducciones, estado del arte): produce el borrador en Markdown académico con ## para secciones. Marca las citas bibliográficas sin referencia como placeholders: [Autor, año].

## Rigor sobre el contenido del proyecto

Cuando hables de lo que el usuario ya ha escrito, limita tus afirmaciones estrictamente a lo que aparezca en los fragmentos devueltos por search_documents_semantic y en el mensaje del usuario.
Si una información no está en esos fragmentos, dilo explícitamente: "Esa información no consta en los documentos recuperados" y sugiere al usuario cómo podría redactarla o qué tipo de fuente debería consultar.
Prefiere reconocer incertidumbre antes que inventar contenido, secciones, resultados o citas.
Cuando sea posible, indica qué documento o fragmento fundamenta cada afirmación importante sobre el proyecto.`;

// ---------------------------------------------------------------------------
// Cache (Redis-backed via src/lib/server/cache.ts, in-process Map fallback)
import { cacheGet, cacheSet, CACHE_KEY, TTL } from '$lib/server/cache';

// Router
// ---------------------------------------------------------------------------

export const aiRouter = router({
  listConversations: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: projectId }) => {
      return ctx.withRLS((db) =>
        db
          .select()
          .from(aiConversation)
          .where(eq(aiConversation.projectId, projectId))
          .orderBy(desc(aiConversation.updatedAt))
      );
    }),

  getConversation: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: conversationId }) => {
      const [conv, messages] = await Promise.all([
        ctx.withRLS((db) =>
          db
            .select()
            .from(aiConversation)
            .where(eq(aiConversation.id, conversationId))
            .limit(1)
        ) as Promise<(typeof aiConversation.$inferSelect)[]>,

        ctx.withRLS((db) =>
          db
            .select()
            .from(aiMessage)
            .where(eq(aiMessage.conversationId, conversationId))
            .orderBy(asc(aiMessage.createdAt))
        ) as Promise<(typeof aiMessage.$inferSelect)[]>
      ]);

      if (!conv[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      return { conversation: conv[0], messages };
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        conversationId: z.string().optional(),
        message: z.string().min(1).max(4000),
        modelOverride: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // ── Get or create conversation ────────────────────────────────────
      let convId = input.conversationId;
      if (!convId) {
        convId = crypto.randomUUID();
        const title = input.message.slice(0, 60) + (input.message.length > 60 ? '…' : '');
        await ctx.withRLS((db) =>
          db.insert(aiConversation).values({ id: convId!, projectId: input.projectId, userId, title })
        );
      } else {
        const rows = (await ctx.withRLS((db) =>
          db
            .select({ id: aiConversation.id })
            .from(aiConversation)
            .where(eq(aiConversation.id, convId!))
            .limit(1)
        )) as { id: string }[];
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // ── Load prior history (before saving current message) ────────────
      const history = (await ctx.withRLS((db) =>
        db
          .select({ role: aiMessage.role, content: aiMessage.content })
          .from(aiMessage)
          .where(eq(aiMessage.conversationId, convId!))
          .orderBy(asc(aiMessage.createdAt))
      )) as { role: 'user' | 'assistant'; content: string }[];

      // ── Persist user message ──────────────────────────────────────────
      await ctx.withRLS((db) =>
        db.insert(aiMessage).values({
          id: crypto.randomUUID(),
          conversationId: convId!,
          role: 'user',
          content: input.message
        })
      );

      // ── Resolve key + model for agent task ───────────────────────────
      const { apiKey: userApiKey, model: resolvedModel, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'agent', input.projectId
      );
      // Personal project: allow user to override the model for this request
      const effectiveModel = (!resolvedOrgId && input.modelOverride) ? input.modelOverride : resolvedModel;

      // ── Build project index and run agent loop ────────────────────────
      const [projectIndex, projectRows] = await Promise.all([
        buildProjectIndex(ctx.withRLS as WithRLS, input.projectId),
        ctx.withRLS((db) =>
          (db as Db)
            .select({ agentSystemPrompt: project.agentSystemPrompt })
            .from(project)
            .where(eq(project.id, input.projectId))
            .limit(1)
        ) as Promise<{ agentSystemPrompt: string | null }[]>
      ]);

      const customPrompt = (projectRows[0]?.agentSystemPrompt ?? '').trim();
      const baseSystem = customPrompt
        ? `${customPrompt}\n\n---\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT;
      const systemWithIndex = projectIndex
        ? `${baseSystem}\n\n---\n\n${projectIndex}`
        : baseSystem;

      const { content: assistantContent, pendingActions, docsUsed, inputTokens: agentIn, outputTokens: agentOut } = await runAgentLoop(
        systemWithIndex,
        history,
        input.message,
        ctx.withRLS as WithRLS,
        input.projectId,
        userApiKey,
        effectiveModel
      );

      logUsage(ctx.withRLS, { orgId: resolvedOrgId, projectId: input.projectId, userId, model: effectiveModel, task: 'agent', inputTokens: agentIn, outputTokens: agentOut });

      // ── Persist assistant response ────────────────────────────────────
      const assistantMsgId = crypto.randomUUID();
      await ctx.withRLS((db) =>
        db.insert(aiMessage).values({
          id: assistantMsgId,
          conversationId: convId!,
          role: 'assistant',
          content: assistantContent,
          docsUsed
        })
      );
      await ctx.withRLS((db) =>
        db
          .update(aiConversation)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversation.id, convId!))
      );

      return {
        conversationId: convId,
        message: { id: assistantMsgId, role: 'assistant' as const, content: assistantContent, docsUsed },
        pendingActions: pendingActions.length > 0 ? pendingActions : undefined
      };
    }),

  // ---------------------------------------------------------------------------
  // Apply a pending action confirmed by the user
  // ---------------------------------------------------------------------------
  applyAction: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        action: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('create_document'),
            title: z.string().min(1).max(255),
            docType: z.enum(['paper', 'notes', 'outline', 'bibliography', 'supplementary']),
            content: z.string(),
            requirementId: z.string().optional()
          }),
          z.object({
            type: z.literal('create_issue'),
            title: z.string().min(1).max(255),
            content: z.string().optional(),
            priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium')
          })
        ])
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.action.type === 'create_document') {
        const action = input.action;
        const docId = crypto.randomUUID();
        const versionId = crypto.randomUUID();

        await ctx.withRLS(async (db) => {
          await db.insert(document).values({
            id: docId,
            projectId: input.projectId,
            title: action.title,
            type: action.docType,
            draftContent: action.content,
            generatedByAi: true
          });
          await db.insert(documentVersion).values({
            id: versionId,
            documentId: docId,
            content: '',
            versionNumber: 1,
            changeDescription: 'Created by agent',
            createdBy: ctx.user.id
          });
          await db
            .update(document)
            .set({ currentVersionId: versionId })
            .where(eq(document.id, docId));

          if (action.requirementId) {
            await db
              .update(projectRequirement)
              .set({ fulfilledDocumentId: docId })
              .where(
                and(
                  eq(projectRequirement.id, action.requirementId),
                  eq(projectRequirement.projectId, input.projectId)
                )
              );
          }
        });

        ctx.withRLS((db) =>
          indexDocument(db, docId, input.projectId, action.content)
        ).catch((err) => console.error('[embeddings] indexDocument failed:', err));

        return { type: 'document' as const, id: docId, title: action.title };
      }

      // create_issue
      const action = input.action;
      const issueId = crypto.randomUUID();
      await ctx.withRLS((db) =>
        db.insert(issue).values({
          id: issueId,
          projectId: input.projectId,
          title: action.title,
          content: action.content ?? null,
          priority: action.priority,
          ownerUserId: ctx.user.id
        })
      );

      return { type: 'issue' as const, id: issueId, title: action.title };
    }),

  sendEditorMessage: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        documentId: z.string(),
        documentTitle: z.string(),
        documentContent: z.string().max(200000),
        spellLanguage: z.string().optional(),
        conversationId: z.string().optional(),
        message: z.string().min(1).max(4000),
        modelOverride: z.string().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // ── Get or create conversation ────────────────────────────────────
      let convId = input.conversationId;
      if (!convId) {
        convId = crypto.randomUUID();
        const title = input.message.slice(0, 60) + (input.message.length > 60 ? '…' : '');
        await ctx.withRLS((db) =>
          db.insert(aiConversation).values({ id: convId!, projectId: input.projectId, userId, title })
        );
      } else {
        const rows = (await ctx.withRLS((db) =>
          db.select({ id: aiConversation.id }).from(aiConversation).where(eq(aiConversation.id, convId!)).limit(1)
        )) as { id: string }[];
        if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // ── Load prior history ────────────────────────────────────────────
      const history = (await ctx.withRLS((db) =>
        db
          .select({ role: aiMessage.role, content: aiMessage.content })
          .from(aiMessage)
          .where(eq(aiMessage.conversationId, convId!))
          .orderBy(asc(aiMessage.createdAt))
      )) as { role: 'user' | 'assistant'; content: string }[];

      // ── Persist user message ──────────────────────────────────────────
      await ctx.withRLS((db) =>
        db.insert(aiMessage).values({ id: crypto.randomUUID(), conversationId: convId!, role: 'user', content: input.message })
      );

      // ── Resolve keys + models ─────────────────────────────────────────
      const [
        { apiKey: editorApiKey, model: resolvedModel, resolvedOrgId },
        { apiKey: spellApiKey, model: spellModel },
        { apiKey: grammarApiKey, model: grammarModel }
      ] = await Promise.all([
        resolveTaskKey(ctx.withRLS as WithRLS, ctx.db as Db, userId, 'agent', input.projectId),
        resolveTaskKey(ctx.withRLS as WithRLS, ctx.db as Db, userId, 'spell', input.projectId, 'anthropic/claude-haiku-4-5').catch(() =>
          resolveTaskKey(ctx.withRLS as WithRLS, ctx.db as Db, userId, 'agent', input.projectId)
        ),
        resolveTaskKey(ctx.withRLS as WithRLS, ctx.db as Db, userId, 'grammar', input.projectId, 'anthropic/claude-haiku-4-5').catch(() =>
          resolveTaskKey(ctx.withRLS as WithRLS, ctx.db as Db, userId, 'agent', input.projectId)
        )
      ]);
      const effectiveModel = (!resolvedOrgId && input.modelOverride) ? input.modelOverride : resolvedModel;

      // ── Run editor agent loop ─────────────────────────────────────────
      const { content: assistantContent, pendingEditorActions, inputTokens, outputTokens } = await runEditorAgentLoop(
        input.documentTitle,
        input.documentContent,
        history,
        input.message,
        editorApiKey,
        effectiveModel,
        {
          spellApiKey,
          spellModel,
          spellLanguage: input.spellLanguage ?? 'auto',
          grammarApiKey,
          grammarModel,
          withRLS: ctx.withRLS as WithRLS,
          projectId: input.projectId,
          documentId: input.documentId
        }
      );

      logUsage(ctx.withRLS, { orgId: resolvedOrgId, projectId: input.projectId, userId, model: effectiveModel, task: 'agent', inputTokens, outputTokens });

      // ── Persist assistant response ────────────────────────────────────
      const assistantMsgId = crypto.randomUUID();
      await ctx.withRLS((db) =>
        db.insert(aiMessage).values({ id: assistantMsgId, conversationId: convId!, role: 'assistant', content: assistantContent })
      );
      await ctx.withRLS((db) =>
        db.update(aiConversation).set({ updatedAt: new Date() }).where(eq(aiConversation.id, convId!))
      );

      return {
        conversationId: convId,
        message: { id: assistantMsgId, role: 'assistant' as const, content: assistantContent },
        pendingEditorActions: pendingEditorActions.length > 0 ? pendingEditorActions : undefined
      };
    }),

  deleteConversation: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: conversationId }) => {
      const rows = (await ctx.withRLS((db) =>
        db
          .delete(aiConversation)
          .where(eq(aiConversation.id, conversationId))
          .returning({ id: aiConversation.id })
      )) as { id: string }[];
      if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND' });
      return { id: conversationId };
    }),

  // ---------------------------------------------------------------------------
  // Draft generation  (unchanged — one-shot, not agentic)
  // ---------------------------------------------------------------------------
  generateDraft: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        documentIds: z.array(z.string()),
        outputType: z.enum([
          'full_paper',
          'introduction',
          'abstract',
          'discussion',
          'conclusion',
          'methodology',
          'literature_review'
        ]),
        style: z.enum(['formal', 'technical', 'review']).default('formal'),
        audience: z.enum(['experts', 'general', 'students']).default('experts'),
        extraInstructions: z.string().max(1000).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const { apiKey: userApiKey, model: resolvedModel, resolvedOrgId: draftOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'draft', input.projectId, 'anthropic/claude-sonnet-4-5'
      );

      const [proj, selectedDocs, ctxLinks] = await Promise.all([
        ctx.withRLS((db) =>
          db
            .select({ title: project.title, description: project.description })
            .from(project)
            .where(eq(project.id, input.projectId))
            .limit(1)
        ) as Promise<{ title: string; description: string | null }[]>,

        input.documentIds.length > 0
          ? (ctx.withRLS((db) =>
            db
              .select({ title: document.title, type: document.type, draft: document.draftContent })
              .from(document)
              .where(inArray(document.id, input.documentIds))
              .orderBy(asc(document.updatedAt))
          ) as Promise<{ title: string; type: string; draft: string | null }[]>)
          : Promise.resolve([]),

        ctx.withRLS((db) =>
          db
            .select({
              docTitle: document.title,
              docType: document.type,
              draft: document.draftContent,
              sourceProject: project.title
            })
            .from(projectContextLink)
            .innerJoin(document, eq(document.id, projectContextLink.linkedDocumentId))
            .leftJoin(project, eq(project.id, document.projectId))
            .where(eq(projectContextLink.projectId, input.projectId))
        ) as Promise<{ docTitle: string; docType: string; draft: string | null; sourceProject: string | null }[]>
      ]);

      if (!proj[0]) throw new TRPCError({ code: 'NOT_FOUND' });

      const outputTypeLabels: Record<string, string> = {
        full_paper: 'artículo académico completo',
        introduction: 'sección de Introducción',
        abstract: 'Resumen (Abstract)',
        discussion: 'sección de Discusión',
        conclusion: 'sección de Conclusión',
        methodology: 'sección de Metodología',
        literature_review: 'Revisión de Literatura'
      };
      const styleLabels: Record<string, string> = {
        formal: 'formal y riguroso',
        technical: 'técnico y detallado',
        review: 'de revisión crítica'
      };
      const audienceLabels: Record<string, string> = {
        experts: 'expertos en el área',
        general: 'público general con interés en el tema',
        students: 'estudiantes universitarios'
      };

      const contextBlock =
        selectedDocs.length > 0
          ? selectedDocs
            .map((d) => `### ${d.title} (${d.type})\n${d.draft?.trim() || '*(sin contenido)*'}`)
            .join('\n\n')
          : '*(No se seleccionaron documentos de contexto)*';

      const externalBlock =
        ctxLinks.length > 0
          ? '\n\n## Contexto externo (otros proyectos)\n' +
          ctxLinks
            .map(
              (l) =>
                `### ${l.docTitle} (${l.docType}) — de "${l.sourceProject ?? 'proyecto externo'}"\n${l.draft?.trim() || '*(sin contenido)*'}`
            )
            .join('\n\n')
          : '';

      const systemPrompt = `Eres un asistente de escritura académica de alto nivel. \
Tu tarea es generar un borrador de ${outputTypeLabels[input.outputType]} \
con un estilo ${styleLabels[input.style]}, dirigido a ${audienceLabels[input.audience]}. \
Responde siempre en el mismo idioma que los documentos de contexto. \
Usa formato Markdown: encabezados, listas, párrafos bien estructurados. \
Genera solo el contenido del borrador, sin explicaciones adicionales ni meta-comentarios.`;

      const userMessage = [
        `Project: **${proj[0].title}**`,
        proj[0].description ? `Description: ${proj[0].description}` : '',
        '',
        '## Context documents',
        contextBlock + externalBlock,
        input.extraInstructions ? `\n## Additional instructions\n${input.extraInstructions}` : ''
      ]
        .filter(Boolean)
        .join('\n');

      const draftBaseUrl = OPENROUTER_URL;
      const draftExtraHeaders = { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' };

      const response = await fetch(draftBaseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userApiKey}`,
          'Content-Type': 'application/json',
          ...draftExtraHeaders
        },
        body: JSON.stringify({
          model: resolvedModel,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });

      if (!response.ok) await throwProviderError(response);

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const generatedContent = data.choices[0]?.message?.content ?? '';
      logUsage(ctx.withRLS, { orgId: draftOrgId, projectId: input.projectId, userId, model: resolvedModel, task: 'draft', inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });

      const docId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const typeLabel = outputTypeLabels[input.outputType] ?? input.outputType;
      const docTitle = `Borrador: ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}`;

      await ctx.withRLS(async (db) => {
        await db.insert(document).values({
          id: docId,
          projectId: input.projectId,
          title: docTitle,
          type: 'paper',
          draftContent: generatedContent,
          generatedByAi: true
        });
        await db.insert(documentVersion).values({
          id: versionId,
          documentId: docId,
          content: '',
          versionNumber: 1,
          changeDescription: 'Versión inicial',
          createdBy: ctx.user.id
        });
        await db.update(document).set({ currentVersionId: versionId }).where(eq(document.id, docId));
      });

      return { documentId: docId, title: docTitle };
    }),

  draftSection: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        instruction: z.string().min(1).max(2000),
        documentContext: z.string().max(8000).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const { apiKey: userApiKey, model, resolvedOrgId: sectionOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'draft', input.projectId
      );

      const projectContext = await buildProjectContext(ctx.withRLS, input.projectId);
      if (!projectContext) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Proyecto no encontrado.' });
      }

      const baseUrl = OPENROUTER_URL;
      const extraHeaders = { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' };

      const systemPrompt = `Eres un asistente de escritura académica. Tu tarea es redactar un fragmento de texto según las instrucciones del investigador.

Contexto del proyecto:
${projectContext}

Reglas:
- Responde ÚNICAMENTE con el texto redactado, listo para insertar en el documento. Sin explicaciones ni preámbulos.
- Usa el idioma del investigador (detecta por la instrucción).
- Cita referencias usando su citekey entre corchetes: [@citeKey].
- El texto debe tener un tono académico apropiado para publicación científica.
- No inventes datos, cifras ni afirmaciones que no estén en el contexto.`;

      const userMessage = input.documentContext
        ? `Contexto actual del documento (para mantener coherencia):\n${input.documentContext}\n\n---\nInstrucción: ${input.instruction}`
        : `Instrucción: ${input.instruction}`;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userApiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });

      console.log('[draftSection] request →', { model, projectId: input.projectId });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      logUsage(ctx.withRLS, { orgId: sectionOrgId, projectId: input.projectId, userId, model, task: 'draft', inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });

      console.log('[draftSection] response ←', { chars: text.length });

      return { text };
    }),

  reviewDocument: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        documentId: z.string()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const { apiKey: userApiKey, model: resolvedReviewModel, resolvedOrgId: reviewOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'review', input.projectId
      );

      // Load document content + project context in parallel
      const [docRows, projectContext] = await Promise.all([
        ctx.withRLS((db) =>
          db
            .select({ draftContent: document.draftContent, title: document.title })
            .from(document)
            .where(and(eq(document.id, input.documentId), eq(document.projectId, input.projectId)))
            .limit(1)
        ) as Promise<{ draftContent: string | null; title: string }[]>,
        buildProjectContext(ctx.withRLS, input.projectId)
      ]);

      if (!docRows[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documento no encontrado.' });
      }
      if (!projectContext) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Proyecto no encontrado.' });
      }

      const docContent = docRows[0].draftContent?.trim() ?? '';
      if (!docContent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El documento está vacío. Escribe algo antes de revisarlo.'
        });
      }

      const model = resolvedReviewModel;
      const baseUrl = OPENROUTER_URL;
      const extraHeaders = { 'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174', 'X-Title': 'Scholio' };

      const systemPrompt = `You are an academic writing reviewer. Analyze a document against the project's requirements and bibliography.

Respond ONLY with a valid JSON object (no markdown, no explanation outside the JSON) with this exact shape:
{
  "requirements": [
    { "name": "requirement name", "covered": true, "note": "one sentence explaining why it is or isn't covered" }
  ],
  "uncitedRefs": ["citeKey1", "citeKey2"]
}

Rules:
- "requirements": include every requirement from the project context, in the same order. Set "covered" to true only if the document meaningfully addresses it.
- "uncitedRefs": list citeKeys from the bibliography that are relevant to the document's topic but never mentioned (as [@citeKey]) in the document. Omit refs that are genuinely unrelated to the document content.
- Keep notes concise (max 15 words).
- Use the language of the document.`;

      const userMessage = `Project context:\n${projectContext}\n\n---\nDocument: "${docRows[0].title}"\n\n${docContent.slice(0, 12000)}`;

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userApiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });

      console.log('[reviewDocument] request →', { model, documentId: input.documentId });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content?.trim() ?? '{}';
      const raw = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      logUsage(ctx.withRLS, { orgId: reviewOrgId, projectId: input.projectId, userId, model: resolvedReviewModel, task: 'review', inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });

      console.log('[reviewDocument] response ←', raw.slice(0, 200));

      type ReviewResult = {
        requirements: { name: string; covered: boolean; note: string }[];
        uncitedRefs: string[];
      };
      let parsed: ReviewResult = { requirements: [], uncitedRefs: [] };
      try {
        const p = JSON.parse(raw);
        parsed = {
          requirements: Array.isArray(p.requirements) ? p.requirements.filter(
            (r: unknown) => r && typeof r === 'object' && 'name' in r && 'covered' in r
          ) : [],
          uncitedRefs: Array.isArray(p.uncitedRefs) ? p.uncitedRefs.filter((r: unknown) => typeof r === 'string') : []
        };
      } catch {
        parsed = { requirements: [], uncitedRefs: [] };
      }

      return parsed;
    }),

  generateReviewQuestions: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      documentId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'review', input.projectId
      );

      const [docRows, projectContext] = await Promise.all([
        ctx.withRLS((db) =>
          db
            .select({ draftContent: document.draftContent, title: document.title, type: document.type })
            .from(document)
            .where(and(eq(document.id, input.documentId), eq(document.projectId, input.projectId)))
            .limit(1)
        ) as Promise<{ draftContent: string | null; title: string; type: string }[]>,
        buildProjectContext(ctx.withRLS, input.projectId)
      ]);

      if (!docRows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found.' });

      const docContent = docRows[0].draftContent?.trim() ?? '';
      if (!docContent) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The document is empty.' });

      const systemPrompt = `You are a rigorous academic peer reviewer. Given a document, generate 3–5 critical questions that a real reviewer would raise: gaps in argument, missing evidence, methodological concerns, unclear claims, or citation needs.

Respond ONLY with a valid JSON array of strings. No markdown, no explanation outside the JSON.
Example: ["Why does the author assume X without evidence?", "How does this account for Y?"]

Rules:
- Each question must be specific to the document content, not generic.
- Use the language of the document.`;

      const userMessage = `Document type: ${docRows[0].type}\nDocument: "${docRows[0].title}"\n\n${docContent.slice(0, 10000)}${projectContext ? `\n\n---\nProject context:\n${projectContext}` : ''}`;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json();
      const rawContent = (data.choices?.[0]?.message?.content ?? '[]').trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      logUsage(ctx.withRLS, { orgId: resolvedOrgId, projectId: input.projectId, userId, model, task: 'review', inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 });

      let questions: string[] = [];
      try {
        const parsed = JSON.parse(rawContent);
        if (Array.isArray(parsed)) questions = parsed.filter((q): q is string => typeof q === 'string').slice(0, 5);
      } catch { questions = []; }

      return questions;
    }),

  // Mini author card for [[person:Name]] cursor dwell
  authorInfo: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      projectId: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const cacheKey = CACHE_KEY.authorInfo(input.name.trim());
      const cached = await cacheGet<{ note: string; photo?: string }>(cacheKey);
      if (cached) return cached;

      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS, ctx.db, ctx.user.id, 'lookup', input.projectId
      );

      const prompt = `You are an academic reference assistant. For the person named "${input.name}", provide a brief factual summary in this exact JSON format:\n{"note":"one sentence summary of who they are and why they matter academically"}\nIf the person is unknown or fictional, return {"note":"Unknown person"}.\nReply with ONLY the JSON object, no explanation.`;

      const wikiSlug = encodeURIComponent(input.name.replace(/ /g, '_'));
      const [res, wikiRes] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
            'X-Title': 'Scholio'
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.1
          })
        }),
        fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiSlug}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000)
        }).catch(() => null)
      ]);

      if (!res.ok) await throwProviderError(res);

      const data = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
      const raw = (data.choices[0]?.message?.content ?? '{}').trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      let photo: string | undefined;
      if (wikiRes?.ok) {
        const wikiData = await wikiRes.json() as { thumbnail?: { source: string } };
        photo = wikiData.thumbnail?.source;
      }

      logUsage(ctx.withRLS, {
        userId: ctx.user.id, orgId: resolvedOrgId, projectId: input.projectId,
        model, task: 'lookup',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      });

      type AuthorInfo = { note: string };
      let note: string;
      try {
        note = (JSON.parse(raw) as AuthorInfo).note ?? 'Unknown person';
      } catch {
        note = 'Unknown person';
      }

      await cacheSet(cacheKey, { note, photo }, TTL.authorInfo);
      return { note, photo };
    }),

  // Find untagged persons and informal citations in a document
  findUntagged: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      documentId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'review', input.projectId
      );

      const [docRows, refs] = await Promise.all([
        ctx.withRLS((db) =>
          db.select({ draftContent: document.draftContent, title: document.title })
            .from(document)
            .where(and(eq(document.id, input.documentId), eq(document.projectId, input.projectId)))
            .limit(1)
        ) as Promise<{ draftContent: string | null; title: string }[]>,
        ctx.withRLS((db) =>
          db.select({ citeKey: reference.citeKey, title: reference.title, authors: reference.authors })
            .from(reference)
            .innerJoin(projectReference, eq(projectReference.referenceId, reference.id))
            .where(eq(projectReference.projectId, input.projectId))
        ) as Promise<{ citeKey: string; title: string | null; authors: unknown }[]>
      ]);

      if (!docRows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found.' });
      const docContent = docRows[0].draftContent?.trim() ?? '';
      if (!docContent) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The document is empty.' });

      const citeKeyList = refs.map(r => r.citeKey).join(', ');

      const systemPrompt = `You are an academic text analyst. Given a document, find:
1. Person names mentioned in plain text that are NOT already wrapped in [[person:Name]] tokens.
2. Informal citation patterns (e.g. "Darwin (1859)", "according to Kuhn", "as Barth argues") that match a known citeKey.

Respond ONLY with valid JSON (no markdown) in this exact shape:
{
  "persons": ["Full Name 1", "Full Name 2"],
  "refs": [
    { "context": "~15 words surrounding the informal citation, exact substring of document", "text": "the informal citation itself, exact substring", "citeKey": "matchingCiteKey" }
  ]
}

Rules:
- persons: only full names of real people (scholars, historical figures). Max 10.
- Do NOT include names already in [[person:...]] tokens.
- refs: only if the informal text clearly refers to a known citeKey from the list provided. Max 10.
- context must be a unique substring of the document (~15 words) that contains text within it.
- text must be an exact substring of context.
- Use the document language.`;

      const userMessage = `Known citeKeys: ${citeKeyList || '(none)'}

Document:
${docContent.slice(0, 10000)}`;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model, max_tokens: 800,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json();
      const raw = (data.choices?.[0]?.message?.content ?? '{}').trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      logUsage(ctx.withRLS, {
        orgId: resolvedOrgId, projectId: input.projectId, userId, model, task: 'review',
        inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0
      });

      type UntaggedResult = { persons: string[]; refs: { context: string; text: string; citeKey: string }[] };
      try {
        const parsed = JSON.parse(raw) as UntaggedResult;
        return {
          persons: Array.isArray(parsed.persons) ? parsed.persons.filter((p): p is string => typeof p === 'string').slice(0, 10) : [],
          refs: Array.isArray(parsed.refs) ? parsed.refs.filter((r): r is { context: string; text: string; citeKey: string } =>
            typeof r?.context === 'string' && typeof r?.text === 'string' && typeof r?.citeKey === 'string').slice(0, 10) : []
        };
      } catch {
        return { persons: [], refs: [] };
      }
    }),

  // Quick name lookup for @@ trigger in the editor
  lookupNames: protectedProcedure
    .input(z.object({
      partial: z.string().min(1).max(80),
      context: z.string().max(500).optional(),
      projectId: z.string().optional()
    }))
    .query(async ({ ctx, input }) => {
      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS, ctx.db, ctx.user.id, 'lookup', input.projectId
      );

      const prompt = [
        'You are helping an academic writer. Given a partial name, return 4–6 full names of real people (scholars, historical figures, theologians, philosophers, scientists, etc.) whose first name OR last name STARTS WITH the partial string given. Do not return names based on topic or semantic similarity — only names that literally begin with the partial.',
        'Reply with ONLY a JSON array of strings. No explanation.',
        input.context ? `Document context (last sentences): """${input.context}"""` : '',
        `Partial name (names returned must start with this): "${input.partial}"`
      ].filter(Boolean).join('\n');

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://scholio.review',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.2
        })
      });

      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Lookup failed' });

      const data = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
      const rawContent = data.choices[0]?.message?.content ?? '[]';
      // Strip markdown code fences if the model wraps the response
      const raw = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      let names: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === 'string').slice(0, 6);
      } catch { names = []; }

      logUsage(ctx.withRLS, {
        userId: ctx.user.id,
        orgId: resolvedOrgId, projectId: input.projectId,
        model, task: 'lookup',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      });

      return names;
    }),

  // Explain a citation key in the context of the surrounding text
  explainCitation: protectedProcedure
    .input(z.object({
      projectId: z.string().optional(),
      citeKey: z.string().max(200),
      refTitle: z.string().max(500),
      refAuthors: z.string().max(300),
      refYear: z.string().max(10),
      surrounding: z.string().max(1000)
    }))
    .query(async ({ ctx, input }) => {
      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS, ctx.db, ctx.user.id, 'lookup', input.projectId
      );

      const refLine = [
        input.refTitle,
        input.refAuthors,
        input.refYear
      ].filter(Boolean).join(' — ');

      const prompt = [
        'You are an academic writing assistant. Briefly explain (1–2 sentences) why this citation is likely being used, based on the surrounding text and the reference details.',
        `Reference: ${refLine || input.citeKey}`,
        `Surrounding text: """${input.surrounding}"""`,
        'Reply with only the explanation, no preamble.'
      ].filter(Boolean).join('\n');

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://scholio.review',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3
        })
      });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json() as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
      const explanation = data.choices[0]?.message?.content?.trim() ?? '';

      logUsage(ctx.withRLS, {
        userId: ctx.user.id,
        orgId: resolvedOrgId, projectId: input.projectId,
        model, task: 'lookup',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      });

      return explanation;
    }),

  // Review a selected text fragment with layered context
  reviewSelection: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      selection: z.string().min(1).max(4000),
      before: z.string().max(400),
      after: z.string().max(400),
      headings: z.array(z.string()).max(30),
      docTitle: z.string().max(200),
      reviewType: z.enum(['clarity', 'argument', 'citations', 'terminology'])
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS as WithRLS, ctx.db as Db, userId, 'review', input.projectId
      );

      const typeInstructions: Record<string, string> = {
        clarity: 'Improve clarity and concision. Use academic register. Eliminate redundancy.',
        argument: 'Evaluate logical strength. Identify unsupported claims, missing premises, or weak reasoning.',
        citations: 'Identify claims that need bibliographic support. Note which statements are unsourced.',
        terminology: 'Check terminological consistency. Flag ambiguous or shifting use of key terms.'
      };

      const systemPrompt = `You are an academic writing assistant. Your task: ${typeInstructions[input.reviewType]}

Context: document titled "${input.docTitle}", sections: ${input.headings.join(' > ') || '(no headings)'}.
The text before the selection: "${input.before}"
The text after the selection: "${input.after}"

Respond ONLY with valid JSON (no markdown):
{
  "suggestion": "the improved or annotated version of the selected text (same language as input)",
  "explanation": "1-2 sentences explaining what you changed and why"
}

Rules:
- suggestion must be the same language as the input selection.
- For 'argument' and 'citations' types, suggestion may be the original text with inline annotations like [needs citation] or [unsupported claim].
- Keep suggestion concise — do not expand the text unnecessarily.
- explanation must be plain text, no markdown.`;

      const userMessage = `Selected text to review:\n${input.selection}`;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model, max_tokens: 600,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ]
        })
      });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json();
      const raw = (data.choices?.[0]?.message?.content ?? '{}').trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

      let parsed: { suggestion: string; explanation: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI returned invalid JSON.' });
      }

      logUsage(ctx.withRLS, {
        userId,
        orgId: resolvedOrgId, projectId: input.projectId,
        model, task: 'review',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      });

      return parsed;
    }),

  // ---------------------------------------------------------------------------
  // Spell check — on-demand AI-powered correction
  // ---------------------------------------------------------------------------

  grammarCheck: protectedProcedure
    .input(z.object({
      text: z.string().max(50000),
      projectId: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS, ctx.db, userId, 'grammar', input.projectId,
        'anthropic/claude-haiku-4-5'
      );

      const prompt = `You are an expert English academic writing assistant helping non-native English speakers improve their writing.
Analyze the following text for grammatical errors, awkward phrasing, and issues with academic register.
Return a JSON array of corrections. Each item must have:
- "original": the exact substring from the text that needs correction (can be a word, phrase, or sentence fragment)
- "suggestion": the corrected replacement
- "explanation": a brief explanation in English (max 15 words)

Rules:
- Focus on grammar errors (wrong articles, verb tenses, subject-verb agreement, prepositions, plurals)
- Flag awkward or unnatural phrasing that a native speaker would not use
- Suggest more formal/academic alternatives when the register is too informal
- Do NOT report spelling errors (those are handled separately)
- Do NOT change the meaning or style of the text beyond fixing errors
- Ignore proper nouns, citation keys like [[@smith2023]], and Markdown syntax
- If the text is correct, return an empty array []
- Return ONLY valid JSON, no markdown fences or other text

Text to check:
${input.text}`;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 2000
        })
      });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json() as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      logUsage(ctx.withRLS, {
        userId, orgId: resolvedOrgId, projectId: input.projectId,
        model, task: 'grammar',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      });

      let raw: { original: string; suggestion: string; explanation: string }[];
      try {
        const content = (data.choices[0]?.message?.content ?? '[]')
          .trim()
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
        raw = JSON.parse(content);
        if (!Array.isArray(raw)) raw = [];
      } catch {
        return { corrections: [] };
      }

      // Find positions in text
      const corrections = raw
        .filter((c) => c.original && c.suggestion)
        .flatMap((c) => {
          const results: { original: string; suggestion: string; explanation: string; from: number; to: number }[] = [];
          let idx = 0;
          while ((idx = input.text.indexOf(c.original, idx)) !== -1) {
            results.push({ original: c.original, suggestion: c.suggestion, explanation: c.explanation, from: idx, to: idx + c.original.length });
            idx++;
          }
          return results;
        });

      return { corrections };
    }),

  spellCheck: protectedProcedure
    .input(z.object({
      text: z.string().max(50000),
      language: z.string().default('auto'),
      projectId: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { apiKey, model, resolvedOrgId } = await resolveTaskKey(
        ctx.withRLS, ctx.db, userId, 'spell', input.projectId,
        'anthropic/claude-haiku-4-5'
      );

      // Fetch user allowlist (words previously rejected)
      const allowlistRows = await ctx.withRLS((db) =>
        (db as Db).select({ word: userSpellAllowlist.word })
          .from(userSpellAllowlist)
          .where(eq(userSpellAllowlist.userId, userId))
      ) as { word: string }[];
      const allowlist = new Set(allowlistRows.map((r) => r.word.toLowerCase()));

      const langNote = input.language === 'auto'
        ? 'Detect the language automatically.'
        : `The text is in language code: ${input.language}.`;

      const prompt = `You are a professional proofreader. Analyze the following text for spelling and grammar errors.
${langNote}
Return a JSON array of corrections. Each item must have:
- "original": the exact substring from the text that needs correction
- "suggestion": the corrected replacement
- "explanation": a brief explanation in English (max 15 words)

Rules:
- Only report genuine errors, not stylistic preferences
- Ignore proper nouns, technical terms, citation keys like [[@smith2023]], and Markdown syntax
- If the text is correct, return an empty array []
- Return ONLY valid JSON, no markdown fences or other text

Text to check:
${input.text}`;

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.ORIGIN ?? 'http://localhost:5174',
          'X-Title': 'Scholio'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_tokens: 2000
        })
      });

      if (!res.ok) await throwProviderError(res);

      const data = await res.json() as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      logUsage(ctx.withRLS, {
        userId, orgId: resolvedOrgId, projectId: input.projectId,
        model, task: 'spell',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0
      });

      let raw: { original: string; suggestion: string; explanation: string }[];
      try {
        const content = (data.choices[0]?.message?.content ?? '[]')
          .trim()
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
        raw = JSON.parse(content);
        if (!Array.isArray(raw)) raw = [];
      } catch {
        return { corrections: [] };
      }

      // Find positions in text and filter allowlisted originals
      const corrections = raw
        .filter((c) => c.original && c.suggestion && !allowlist.has(c.original.toLowerCase()))
        .flatMap((c) => {
          const results: { original: string; suggestion: string; explanation: string; from: number; to: number }[] = [];
          let idx = 0;
          while ((idx = input.text.indexOf(c.original, idx)) !== -1) {
            results.push({ original: c.original, suggestion: c.suggestion, explanation: c.explanation, from: idx, to: idx + c.original.length });
            idx++;
          }
          return results;
        });

      return { corrections };
    })
});
