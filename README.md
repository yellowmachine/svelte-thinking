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

## Sintaxis del editor

El editor usa Markdown estándar extendido con las siguientes funcionalidades propias de Scholio:

### Citas bibliográficas

```markdown
La selección natural opera sobre variaciones heredables [@darwin1859].
Algunos autores discrepan en el mecanismo [@dawkins1976; @gould1979].
```

Las citas se renderizan según el estilo seleccionado (APA 7, IEEE o Vancouver).
Al final del documento se genera la bibliografía automáticamente.

### Matemáticas (KaTeX)

```markdown
La entropía de Shannon se define como $H = -\sum_{i} p_i \log p_i$.

Para distribuciones continuas:

$$
H(X) = -\int_{-\infty}^{\infty} f(x) \log f(x) \, dx
$$
```

### Wikilinks

```markdown
Como se desarrolla en [[Introducción]], la hipótesis central es...

Para más detalle ver [[Metodología:a3f9b2c1]] (documento externo público).
```

- `[[Título]]` — enlaza a un documento del mismo proyecto por título
- `[[Título:hash]]` — enlaza a un documento público de otro usuario (los primeros 8 caracteres de su UUID)

El panel "Mencionado en" del editor muestra los backlinks entrantes al documento actual.

### Gráficos Vega-Lite

````markdown
```vega-lite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": { "$ref": "dataset:resultados" },
  "mark": "bar",
  "encoding": {
    "x": { "field": "grupo", "type": "nominal" },
    "y": { "field": "valor", "type": "quantitative" }
  }
}
```
````

`"$ref": "dataset:nombre"` hace referencia a un dataset subido al proyecto (CSV, TSV o JSON).

### Ejemplo de documento completo

````markdown
# La paradoja de la inducción y el problema de Gettier

## Introducción

El problema de la justificación epistémica ocupa un lugar central en la
filosofía analítica desde al menos [[Conocimiento y creencia]] [@ayer1956].
La formulación clásica del conocimiento como *creencia verdadera justificada*
fue cuestionada definitivamente por Edmund Gettier [@gettier1963].

## Formalización

Sea $K$ el operador de conocimiento. La definición tripartita establece:

$$
K(s, p) \iff B(s, p) \land V(p) \land J(s, p)
$$

donde $B$ es creencia, $V$ es verdad y $J$ es justificación.

Gettier demostró que esta condición es **necesaria pero no suficiente**
[@gettier1963; @chisholm1966].

## Distribución de casos en la literatura

```vega-lite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "data": { "$ref": "dataset:casos_gettier" },
  "mark": "arc",
  "encoding": {
    "theta": { "field": "frecuencia", "type": "quantitative" },
    "color": { "field": "tipo", "type": "nominal" }
  }
}
```

## Conclusión

Las soluciones contemporáneas al problema se discuten en
[[Epistemología contemporánea:b7c3d1e2]].
````

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
- [Docker](https://www.docker.com)

### Puesta en marcha

```sh
# 1. Instalar dependencias
bun install

# 2. Levantar PostgreSQL + MinIO (compose de dev, puertos locales)
docker compose -f docker-compose.dev.yml up -d

# 3. Copiar variables de entorno y rellenar las necesarias
cp .env.example .env

# 4. Aplicar migraciones
bun run db:migrate

# 5. Arrancar el servidor de desarrollo
bun run dev
```

---

## Despliegue en producción (Hetzner + Coolify)

### Infraestructura recomendada
- **Servidor**: Hetzner CX22 (2 vCPU / 4 GB RAM / 40 GB SSD) — ~3.85 €/mes
- **PaaS**: [Coolify](https://coolify.io) self-hosted — gestiona deploys, SSL, env vars y reverse proxy

### Preparación del servidor

```sh
# Instalar Coolify en el servidor Hetzner (una sola vez)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Accede a Coolify en `http://TU_IP:8000` y completa el onboarding.

### Configurar la aplicación en Coolify

1. **New Resource → Docker Compose**
2. Apunta al repositorio Git (GitHub/GitLab)
3. Coolify detecta el `docker-compose.yml` automáticamente
4. En **Environment Variables**, añade todas las variables del checklist de abajo
5. En **Build Variables**, añade `PUBLIC_SENTRY_DSN` con tu DSN real (se bake en el build)
6. Configura el dominio y activa SSL (Let's Encrypt automático)
7. Deploy

### Variables de entorno en Coolify

Copia todas las variables del `.env.example` en la sección **Environment Variables** de Coolify.
Las variables `PUBLIC_*` (Sentry client DSN) van en **Build Variables** porque se incrustan en el bundle.

> **Nota sobre `DATABASE_URL` y `MIGRATION_DATABASE_URL`**: apuntan al servicio `postgres`
> interno del compose. Ejemplo:
> ```
> DATABASE_URL=postgres://scholarly_app:TU_PASSWORD@postgres:5432/scholarly
> MIGRATION_DATABASE_URL=postgres://scholarly:TU_PASSWORD@postgres:5432/scholarly
> ```
> Nota que el host es `postgres` (nombre del servicio en el compose), no `localhost`.

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
- **Rate limiting en IA** — sugerencias inline limitadas a 30/día por usuario; chat y borradores requieren BYOK (OpenRouter)
- **Soft delete** para proyectos y documentos — el borrado actual es definitivo; anotado para implementar antes de escalar

### Funcionalidades académicas avanzadas
- **Sugerencias de referencias externas** — el asistente podría enlazar fuentes de Semantic Scholar u OpenLibrary relevantes al contexto del documento (feature 1 del roadmap IA)
- **Exportación PDF** — pendiente; exportación a LaTeX (`.tex`) y Typst (`.typ`) ya implementada
- **SSO / SAML** — anunciado en el plan Team, pendiente de implementación
- **Transferencia de propiedad de proyectos** — esquema de base de datos preparado, sin UI ni endpoint
- **Eliminación de cuenta** — botón presente en zona de peligro, sin acción conectada

---

## Créditos

Desarrollado con [Claude Code](https://claude.ai/claude-code).
Asistente IA impulsado por [Claude Haiku 4.5](https://www.anthropic.com) (Anthropic).
