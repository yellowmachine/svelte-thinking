---
name: Estado de infraestructura y servicios externos
description: Qué servicios están configurados, pendientes o decididos para producción
type: project
---

## Hecho
- **AWS KMS** — cifrado de claves configurado
- **Cloudflare DNS** — dominio `scholio.review` comprado y gestionado en Cloudflare ($10.18/yr)

## En proceso
- **Hetzner VPS** — pendiente de contratar (tarde del 2026-03-21). Plan: CX22 mínimo (2 vCPU, 4GB RAM)
- **Coolify** — se instalará en el VPS para gestionar deploys, SSL y Postgres

## Pendiente
- **Sentry** — monitoreo de errores, pendiente de integrar en la app SvelteKit

## Arquitectura de producción decidida
```
scholio.review (Cloudflare DNS + proxy CDN)
       ↓
Coolify (Hetzner VPS)
       ├── SvelteKit app
       └── Postgres
```
Cloudflare SSL/TLS mode: Full (strict). Puerto 22 restringido a IP propia.
