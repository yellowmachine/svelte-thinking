# Memory Index

## Infraestructura
- [project_infra.md](project_infra.md) — Estado de servicios: AWS KMS ✓, Cloudflare ✓, Hetzner+Coolify (pendiente), Sentry (pendiente)

## Project
- [project_plan.md](project_plan.md) — Full architecture and phased plan for the academic writing platform (stack, schemas, roles, fases 1-6, decisiones técnicas)
- [project_public_docs.md](project_public_docs.md) — Idea pendiente: documentos públicos opt-in para compartir como contexto de IA entre usuarios
- [project_future_ideas.md](project_future_ideas.md) — Ideas a futuro: beta VIP roadmap con recompensa en meses Pro
- [project_business_model.md](project_business_model.md) — Modelo de negocio compatible con open source: Open Source+SaaS u Open Core, segmento institucional
- [project_beta_feedback.md](project_beta_feedback.md) — Tickets de usuarios beta via GitHub API (repo privado + metadatos automáticos)
- [project_public_sharing.md](project_public_sharing.md) — Arquitectura de contenido público: share tokens revocables + ruta /p/[token] + hoja de ruta FTS → pgvector

## User
- [user_profile.md](user_profile.md) — Developer learning academic publishing while building this tool; uses SvelteKit 5, TypeScript, bun

## Feedback
- [feedback_storybook_trpc.md](feedback_storybook_trpc.md) — Patrón preferido para componentes con trpc en Storybook
- [feedback_drizzle_sql.md](feedback_drizzle_sql.md) — Drizzle: ${table.column} en subqueries con JOINs puede generar referencias ambiguas — usar nombre literal en su lugar
