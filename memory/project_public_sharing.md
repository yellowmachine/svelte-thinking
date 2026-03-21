---
name: Arquitectura de contenido público y búsqueda
description: Decisión de usar share tokens revocables para publicar documentos, con hoja de ruta de búsqueda en 3 niveles
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

**Ruta pública:** `/p/[token]` — sin autenticación, sin RLS, verifica token no revocado/expirado.

**Hoja de ruta de búsqueda pública (3 niveles):**
1. **Ahora** — Postgres FTS (`tsvector`) sobre title/content. SQL puro, suficiente para empezar.
2. **Medio plazo** — share token + ruta `/p/[token]` operativa con FTS.
3. **Futuro** — pgvector + embeddings para búsqueda semántica. Muy relevante para papers académicos donde el vocabulario es denso y especializado.

**How to apply:** Al implementar, empezar por share_token + ruta pública + FTS. Dejar pgvector para cuando haya volumen de documentos públicos suficiente.
