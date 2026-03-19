# Scholio — Plataforma de escritura académica colaborativa (Beta)

Scholio es una herramienta web para investigadores y equipos académicos que necesitan redactar, revisar y versionar documentos de forma colaborativa, con asistencia de inteligencia artificial integrada.

---

## Funcionalidades implementadas

### Proyectos y documentos
- Creación de proyectos con título, descripción y visibilidad (público / privado)
- Documentos con editor Markdown, guardado automático de borradores y historial de versiones (commits con mensaje de cambio)
- Comparación visual entre versiones (diff)

### Colaboración
- Invitación de colaboradores por email con roles (editor / viewer)
- Comentarios inline anclados al texto: los comentarios se asocian a la selección exacta del documento
- Respuestas a comentarios y resolución/reapertura de hilos

### Fotos y recursos visuales
- Subida de imágenes por proyecto con área de previsualización antes de confirmar
- Campo de descripción/nota por imagen
- Galería con lightbox, copia como Markdown y eliminación
- Almacenamiento en MinIO (S3-compatible), seguridad por oscuridad mediante UUID doble en la URL

### Asistente IA
- Chat por proyecto: el asistente recibe como contexto todos los borradores activos del proyecto
- Sugerencias inline en el editor: se activan con un toggle y proponen reemplazos de fragmentos con explicación
- Filtros antes de llamar a la IA: mínimo 100 palabras en el documento y mínimo 30 palabras de diferencia respecto a la última consulta (sin coste innecesario)
- Modelo: Claude Haiku 4.5 (Anthropic)

### Cuenta y facturación
- Registro e inicio de sesión con email/contraseña y GitHub OAuth
- Página de ajustes con pestañas de perfil y plan
- Planes Free / Pro (9 €/mes) / Team (29 €/mes) con Stripe Checkout
- Portal de cliente Stripe para gestionar o cancelar suscripción
- Sincronización de plan vía webhooks de Stripe

### Observabilidad
- Captura de errores en cliente y servidor con Sentry

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | SvelteKit 5, Svelte 5 (runes), TailwindCSS |
| API | tRPC v11 con procedimientos protegidos |
| Base de datos | PostgreSQL con Row-Level Security (RLS), Drizzle ORM |
| Auth | Better Auth (email + GitHub OAuth) |
| Storage | MinIO (S3-compatible) |
| IA | Anthropic SDK — Claude Haiku 4.5 |
| Pagos | Stripe (Checkout + Customer Portal + Webhooks) |
| Errores | Sentry |
| Runtime | Bun |

---

## Desarrollo local

### Requisitos
- [Bun](https://bun.sh) >= 1.0
- [Docker](https://www.docker.com) (PostgreSQL + MinIO)

### Puesta en marcha

```sh
# 1. Instalar dependencias
bun install

# 2. Levantar servicios (PostgreSQL + MinIO)
docker compose up -d

# 3. Copiar variables de entorno y rellenar las necesarias
cp .env.example .env

# 4. Aplicar migraciones
bun run db:migrate

# 5. Arrancar el servidor de desarrollo
bun run dev
```

---

## Variables de entorno necesarias

Todas están documentadas en `.env.example`. Las imprescindibles para producción:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (rol app, con RLS) |
| `MIGRATION_DATABASE_URL` | Conexión a PostgreSQL (superusuario, solo migraciones) |
| `BETTER_AUTH_SECRET` | Secreto para sesiones (generar con `openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | API key de Anthropic para el asistente IA |
| `STORAGE_ENDPOINT` | Endpoint MinIO / S3 |
| `STORAGE_ACCESS_KEY` | Access key de MinIO / S3 |
| `STORAGE_SECRET_KEY` | Secret key de MinIO / S3 |
| `STRIPE_SECRET_KEY` | API key secreta de Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook de Stripe |
| `STRIPE_PRICE_PRO_MONTHLY` | Price ID del plan Pro en Stripe |
| `STRIPE_PRICE_TEAM_MONTHLY` | Price ID del plan Team en Stripe |
| `SENTRY_DSN` | DSN de Sentry (servidor) |
| `PUBLIC_SENTRY_DSN` | DSN de Sentry (cliente, se expone al navegador) |

---

## Checklist de lanzamiento beta

Antes de abrir acceso a usuarios reales:

- [ ] Rellenar todas las variables de entorno de producción (ver tabla anterior)
- [ ] Crear los productos **Pro** y **Team** en el dashboard de Stripe y copiar sus `price_id`
- [ ] Registrar el endpoint de webhook en Stripe: `POST https://tu-dominio.com/api/stripe/webhook`
  - Eventos a escuchar: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Crear el proyecto en Sentry y copiar el DSN (servidor y cliente)
- [ ] Ejecutar `bun run db:migrate` en el entorno de producción
- [ ] Verificar que el bucket de MinIO es accesible públicamente para `GET` (la política se aplica automáticamente en el primer upload)
- [ ] Configurar el `ORIGIN` con el dominio real (necesario para las URLs de retorno de Stripe)

---

## Pendiente (no bloquea el beta)

### Funcionalidades de usuario
- **Perfil editable** — los campos de nombre y email están en la UI pero sin backend; actualmente son de solo lectura
- **Cambio de contraseña** — formulario presente, sin endpoint conectado
- **Avatar de usuario** — muestra iniciales; subida de foto de perfil no implementada

### Infraestructura y operaciones
- **Panel de administración** — sin métricas de uso ni gestión de usuarios desde la propia app; por ahora se gestiona desde los dashboards de Stripe y Sentry
- **Rate limiting en IA** — sin límite por usuario en los endpoints de sugerencias y chat; en un crecimiento rápido podría suponer coste no controlado
- **Soft delete** para proyectos y documentos — el borrado actual es definitivo; anotado para implementar antes de escalar

### Funcionalidades académicas avanzadas
- **Sugerencias de referencias externas** — el asistente podría enlazar fuentes de Semantic Scholar u OpenLibrary relevantes al contexto del documento (feature 1 del roadmap IA)
- **Exportación PDF / LaTeX** — anunciado en el plan Pro, pendiente de implementación
- **SSO / SAML** — anunciado en el plan Team, pendiente de implementación
- **Transferencia de propiedad de proyectos** — esquema de base de datos preparado, sin UI ni endpoint
- **Eliminación de cuenta** — botón presente en zona de peligro, sin acción conectada

---

## Créditos

Desarrollado con [Claude Code](https://claude.ai/claude-code).
Asistente IA impulsado por [Claude Haiku 4.5](https://www.anthropic.com) (Anthropic).
