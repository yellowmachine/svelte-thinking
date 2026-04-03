---
name: Drizzle ORM — interpolación de columnas en subqueries raw SQL
description: Usar ${table.column} en sql`` dentro de subqueries con JOINs puede generar referencias ambiguas
type: feedback
---

Cuando se usa `${table.column}` dentro de un template `sql``...``` de Drizzle en un subquery correlacionado, Drizzle genera solo el nombre de columna sin cualificar (e.g. `"id"` en lugar de `project."id"`). Si el subquery tiene un JOIN que introduce otra tabla con la misma columna, PostgreSQL lanza `column reference is ambiguous`.

**Why:** El error ocurrió en el subquery de `open_comments` en `/projects/+page.server.ts` — `${project.id}` generaba `"id"`, ambiguo con `document.id` dentro del JOIN.

**How to apply:** En subqueries raw SQL con JOINs, usar el nombre de tabla literal en lugar de interpolación de Drizzle:
- ❌ `WHERE document.project_id = ${project.id}` → genera `"id"` sin tabla
- ✅ `WHERE document.project_id = project.id` → referencia explícita y sin ambigüedad

Usar `${table.column}` es seguro cuando el subquery no tiene JOINs que introduzcan columnas homónimas.
