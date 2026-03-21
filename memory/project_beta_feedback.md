---
name: Sistema de tickets para usuarios beta
description: Usuarios avanzados en beta pueden abrir issues directamente en GitHub desde la app
type: project
---

Decisión: usar **GitHub API desde el backend** (opción más limpia para beta VIP).

**Why:** El repo permanece privado, el usuario percibe acceso directo y privilegiado, y el backend puede enriquecer el issue automáticamente con metadatos útiles.

**Flujo:**
```
Usuario beta → form en /feedback → API de Scholio → GitHub API (token propio) → Issue en repo privado
```

**Metadatos automáticos a incluir en el issue:**
- Plan del usuario
- Navegador / OS
- Ruta donde estaba en la app
- Versión del deploy

**Alternativas descartadas:**
- Repo público `scholio-feedback` — expone issues entre usuarios
- Enlace directo a GitHub Issue forms — requiere que el repo sea público o que el usuario tenga acceso

**How to apply:** Implementar cuando haya usuarios beta VIP. Añadir badge o sección "Acceso beta" en settings que muestre el formulario solo a usuarios con ese plan.
