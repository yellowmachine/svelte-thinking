---
name: Arquitectura de contenido público y búsqueda
description: Decisión de usar share tokens revocables para publicar documentos, con SEO como discovery externo y hoja de ruta de búsqueda interna
type: project
---

Patrón elegido: **share token** (igual que Notion, Figma, Google Docs).

**Why:** `isPublic` booleano solo no permite revocar acceso por documento sin afectar otros. El token da control granular y es revocable individualmente.

**Tabla planificada:**
```sql
share_token (
  token       text PK,          -- crypto.randomUUID()
  document_id text FK,
  created_at  timestamp,
  expires_at  timestamp NULL,
  revoked_at  timestamp NULL
)
```

**Ruta pública:** `/p/[token]` — sin autenticación, sin RLS, verifica token no revocado/expirado. Debe hacer SSR para ser indexable.

**SEO como discovery externo:**
Google indexa `/p/[token]` si la ruta hace SSR — cubre el discovery externo sin búsqueda interna. Suficiente para fases iniciales. Requiere buenos meta tags (title, description, Open Graph). Caveat: tokens revocados pueden seguir en caché de Google días/semanas — responder 410 Gone al revocar para acelerar desindexación.

**Hoja de ruta de búsqueda interna (solo cuando haya necesidad de explorar contenido público dentro de la app):**
1. **Postgres FTS** (`tsvector`) sobre title/content — SQL puro, sin dependencias extra.
2. **pgvector + embeddings** — búsqueda semántica. Muy relevante para papers académicos con vocabulario especializado.

**How to apply:** Empezar por share_token + ruta `/p/[token]` SSR + meta tags. SEO cubre el discovery. Añadir búsqueda interna solo cuando usuarios necesiten explorar contenido público de otros sin salir de la plataforma.
