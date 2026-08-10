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
La formulación clásica del conocimiento como _creencia verdadera justificada_
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

| Capa          | Tecnología                                           |
| ------------- | ---------------------------------------------------- |
| Frontend      | SvelteKit 5, Svelte 5 (runes), TailwindCSS           |
| API           | tRPC v11 con procedimientos protegidos               |
| Base de datos | PostgreSQL con Row-Level Security (RLS), Drizzle ORM |
| Auth          | Better Auth (email + GitHub OAuth)                   |
| Storage       | MinIO (S3-compatible)                                |
| IA            | Anthropic SDK — Claude Haiku 4.5                     |
| Pagos         | Stripe (Checkout + Customer Portal + Webhooks)       |
| Errores       | Sentry                                               |
| Runtime       | Bun                                                  |

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

## Despliegue en producción (Hetzner + Dokploy)

### Infraestructura actual

- **Servidor**: Hetzner — 75 GB disco, 2 GB RAM
- **PaaS**: [Dokploy](https://dokploy.com) self-hosted — gestiona deploys, SSL (Traefik), env vars y reverse proxy
- **Dashboard Dokploy**: `dokploy.scholio.review`
- **Imágenes**: `.github/workflows/build-ghcr.yml` construye y publica en GHCR en cada push a `main`:
  - `ghcr.io/yellowmachine/svelte-thinking:latest` — app
  - `ghcr.io/yellowmachine/scholio-typst:latest` — typst (solo si cambió `typst-service/**`, o con `workflow_dispatch`)

  Dokploy hace `pull` de estas imágenes, no construye desde el `Dockerfile`. Si el paquete de GHCR es privado, hay que configurar credenciales de registry en Dokploy (usuario + token con scope `read:packages`).

- **Deploy automático**: el job `deploy-dokploy` de `build-ghcr.yml` llama al webhook de Dokploy justo después de que `build-app` (y `build-typst`, si corrió) terminen en éxito — así Dokploy hace `pull` de la imagen recién publicada y redeploya sin intervención manual. Requiere un secret en **Settings → Secrets and variables → Actions** del repo de GitHub:

  | Secret               | Dónde se obtiene                                                                                   |
  | -------------------- | --------------------------------------------------------------------------------------------------- |
  | `DOKPLOY_WEBHOOK_URL` | Dashboard Dokploy → aplicación `scholio` → **General** → **Deployments** → botón "Copy Webhook" — el token va incrustado en la propia URL (`/api/deploy/compose/<id>`), no hace falta cabecera aparte |

  Si el webhook falla (URL mal puesta, Dokploy caído), el `curl --fail` hace fallar el job y no se manda la notificación de Slack de éxito — así no queda la falsa impresión de que se desplegó.

- Fly.io está deshabilitado (`fly.toml` y el job `deploy-fly` quedaron comentados) — el despliegue va solo por Dokploy.

Postgres vive en su propio stack de Dokploy, separado del de la app, para poder compartir la misma base de datos con otras apps (p. ej. `librarian`) sin acoplar su ciclo de vida al de ninguna de ellas.

### Red compartida `scholio-network`

Ambos stacks (`docker-compose.prod.postgres.yml` y `docker-compose.prod.app.yml`) declaran `scholio-network` como `external: true`. Compose **nunca crea** una red marcada como external — debe existir ya en el servidor antes del primer deploy de cualquiera de los dos stacks:

```bash
docker network create scholio-network
```

Si no existe, el deploy falla con `network scholio-network declared as external, but could not be found`. `dokploy-network` no hace falta crearla, la gestiona Dokploy.

Dokploy no tiene una opción de UI para crear redes custom ([issue abierto](https://github.com/Dokploy/dokploy/issues/3670)). Algunas versiones exponen una terminal del servidor en el dashboard (ligada a la feature de _Remote Servers_), pero no está garantizado que aparezca para el servidor local en el que corre el propio Dokploy — la vía fiable es SSH directo al servidor:

```bash
ssh usuario@tu-servidor
docker network create scholio-network
```

### Configurar Postgres en Dokploy

1. **New Application → Docker Compose**, apuntando a `docker-compose.prod.postgres.yml`
2. Environment Variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `APP_DB_USER`, `APP_DB_PASSWORD`
3. Deploy

No publica el puerto `5432` al host — solo es alcanzable dentro de `scholio-network` como `postgres:5432`. `scripts/init.sh` crea el rol de la app y los schemas `scholio`/`librarian` al arrancar por primera vez.

### Configurar la aplicación en Dokploy

1. **New Application → Docker Compose**, apuntando a `docker-compose.prod.app.yml`
2. Este stack despliega también `redis`, `typst`, `rustfs` (storage S3-compatible) y `backup` junto con la app — `scholio` y `typst` hacen `pull` de GHCR, `redis`/`rustfs` usan imagen oficial, `backup` se construye localmente desde `backup-service/Dockerfile` y sube los dumps a `rustfs` por API S3
3. En **Environment Variables**, añade todas las variables del checklist de abajo
4. Configura el dominio y activa SSL (Traefik + Let's Encrypt automático)
5. Deploy

> **Nota sobre el disco de `rustfs`**: `rustfs` monta `/rustfsdata:/data`, así que el servidor
> necesita el disco de datos montado en `/rustfsdata` **antes** del primer deploy (por ejemplo, un
> volumen adicional de Hetzner). Si el punto de montaje no existe, Docker crea un directorio vacío
> en el disco raíz y `rustfs` escribe ahí en lugar de en el disco dedicado.

> **Nota sobre el bucket de `rustfs`**: `rustfs` no crea buckets automáticamente. Tras el primer
> deploy hay que crear a mano el bucket `scholio-backups` (o el que tenga `R2_BUCKET`) una vez,
> desde la consola de `rustfs` en el puerto `9001`, o por CLI:
>
> ```bash
> docker exec $(docker ps -qf name=backup) sh -c \
>   'AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
>    aws s3 mb "s3://$R2_BUCKET" --endpoint-url "$R2_ENDPOINT" --region auto'
> ```
>
> Sin esto, `backup.sh` corre igualmente (dump y `pg_dump` funcionan) pero la subida falla con
> `NoSuchBucket`, y el trap de error dispara la notificación de Slack como si hubiera fallado todo.

### Variables de entorno en Dokploy

Copia todas las variables del `.env.example` en la sección **Environment Variables** de Dokploy.
Las variables `PUBLIC_*` (Sentry client DSN) van también aquí — Dokploy las inyecta en build time.

> **Nota sobre `DATABASE_URL` y `MIGRATION_DATABASE_URL`**: apuntan al servicio `postgres`
> del stack de Postgres, alcanzable por nombre gracias a `scholio-network`. Ejemplo:
>
> ```
> DATABASE_URL=postgres://scholarly_app:TU_PASSWORD@postgres:5432/scholarly
> MIGRATION_DATABASE_URL=postgres://scholarly:TU_PASSWORD@postgres:5432/scholarly
> ```
>
> El host es `postgres` (nombre del servicio en el compose de Postgres), no `localhost`.

### Migraciones (automáticas)

`scripts/entrypoint.sh` ejecuta `bun scripts/migrate.mjs` antes de arrancar el servidor — corre las migraciones de Drizzle pendientes y sembra el usuario admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) si aún no existe. Es idempotente, así que corre sin problema en cada arranque/redeploy del contenedor `scholio`, no solo en el primero.

Usa `MIGRATION_DATABASE_URL` (superusuario, con permisos de `CREATE TABLE`) en vez de `DATABASE_URL` (rol de la app, sin esos permisos).

Si necesitas lanzarlas a mano (por ejemplo para depurar), entra a la terminal del contenedor desde Dokploy (o `docker exec`) y ejecuta el mismo comando:

```bash
bun scripts/migrate.mjs
```

### ⚠️ `pull_policy: always` — por qué está en el compose

Dokploy tiene un bug conocido por el que un deploy normal reutiliza la imagen cacheada en lugar de descargar la nueva. En vez de depender del toggle "Pull always" de la UI de Dokploy (fácil de olvidar si se recrea la app), `scholio` y `typst` en `docker-compose.prod.app.yml` llevan `pull_policy: always` — un campo nativo del Compose Spec (Docker Compose v2.10+) que fuerza el `pull` antes de levantar el servicio, queda versionado y no depende de un ajuste manual en la UI.

**Consecuencia**: cada deploy descarga la imagen completa, lo que acumula capas antiguas en `/var/lib/docker/overlay2`. Sin limpieza periódica, el disco se llena (incidente real: 75 GB llenos en producción). Ver sección de mantenimiento abajo.

---

## Mantenimiento del servidor

### Limpieza de imágenes Docker (cron semanal)

Con `pull_policy: always` las imágenes antiguas se acumulan en cada deploy. Hay un cron configurado en el servidor que limpia automáticamente cada domingo a las 3:00:

```
0 3 * * 0 docker image prune -af >> /var/log/docker-prune.log 2>&1
```

Para aplicarlo manualmente en cualquier momento (no afecta a contenedores en ejecución):

```bash
docker image prune -af
```

### Log rotation de contenedores

`/etc/docker/daemon.json` en el servidor tiene configurada rotación de logs para evitar que los logs de los contenedores crezcan sin límite:

```json
{
	"log-driver": "json-file",
	"log-opts": {
		"max-size": "50m",
		"max-file": "3"
	}
}
```

### Monitorizar disco

```bash
df -h /
du -sh /var/lib/docker/*  | sort -rh | head -10
```

Si el disco supera el 80%, ejecutar:

```bash
docker system prune -af
```

---

## Variables de entorno necesarias

Todas están documentadas en `.env.example`. Lista revisada contra el uso real en `src/` (`env.*` de `$env/dynamic/private`), no contra versiones anteriores de este documento:

| Variable                                        | Descripción                                                                     |          En `docker-compose.prod.app.yml`          |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | :------------------------------------------------: |
| `ORIGIN`                                        | Dominio público de la app (URLs de retorno, cookies)                            |                         ✅                         |
| `BETTER_AUTH_SECRET`                            | Secreto de sesión (generar con `openssl rand -base64 32`)                       |                         ✅                         |
| `ADMIN_EMAIL`                                   | Email con acceso a `/admin`                                                     |                         ✅                         |
| `DATABASE_URL`                                  | Conexión a PostgreSQL (rol app, con RLS)                                        |                         ✅                         |
| `REDIS_URL`                                     | Conexión a Redis (cache/rate limiting)                                          |                         ✅                         |
| `TYPST_SERVICE_URL`                             | URL interna del servicio de generación de PDF                                   |                         ✅                         |
| `STORAGE_ENDPOINT`                              | Endpoint S3-compatible                                                          |                         ✅                         |
| `STORAGE_ACCESS_KEY`                            | Access key del storage                                                          |                         ✅                         |
| `STORAGE_SECRET_KEY`                            | Secret key del storage                                                          |                         ✅                         |
| `STORAGE_PUBLIC_URL`                            | URL pública desde la que el navegador descarga los ficheros                     |                         ✅                         |
| `GITHUB_CLIENT_ID/SECRET`                       | OAuth de GitHub                                                                 |                         ✅                         |
| `ORCID_CLIENT_ID/SECRET/REDIRECT_URI/BASE_URL`  | OAuth de ORCID                                                                  |                         ✅                         |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` | Envío de email transaccional                                                    |                         ✅                         |
| `KMS_MASTER_KEY`                                | Clave para cifrar API keys de usuario (BYOK)                                    |                         ✅                         |
| `PUBLIC_LIBRARIAN_URL`                          | URL de la app hermana, expuesta al navegador                                    |                         ✅                         |
| `SLACK_WEBHOOK_URL`                             | Notificaciones internas (opcional)                                              |                         ✅                         |
| `OPENAI_API_KEY`                                | Embeddings (`text-embedding-3-small`) para búsqueda semántica                   |                         ✅                         |
| `SENTRY_DSN`                                    | DSN de Sentry en servidor (`sentry.server.config.ts`)                           |                         ✅                         |
| `MIGRATION_DATABASE_URL`                        | Conexión superusuario, la usa `scripts/migrate.mjs` en el arranque (ver arriba) |                         ✅                         |
| `ADMIN_PASSWORD`                                | Password del admin, seed en la migración                                        |                         ✅                         |
| `PUBLIC_SENTRY_DSN`                             | DSN de Sentry en cliente — **build-time**, no runtime                           | se hornea en la imagen de GHCR, no en este compose |

`STORAGE_BUCKET` sigue en el compose pero no lo lee ningún sitio de `src/` actualmente — no rompe nada, pero es una variable muerta.

`OPENROUTER_APP_KEY` sigue en el compose pero no la lee ningún sitio de `src/` — la única referencia es una línea comentada en `api/openrouter/callback/+server.ts`, que ni siquiera importa `env`. Es otra variable muerta.

`SCIPY_SERVICE_URL` se quitó del compose y sigue leyéndose desde `src/lib/server/scipy.ts` — confirmado como código muerto (la ruta `(scipy)` no está en uso), así que no hace falta reintroducirla.

No hay ni rastro en el código de `ANTHROPIC_API_KEY`, `STRIPE_*`, `AWS_KMS_KEY_ID`/`AWS_REGION`, `LANGUAGETOOL_URL`, `COOKIE_DOMAIN` ni `TRUSTED_ORIGINS` — la tabla anterior de este README las listaba como imprescindibles, pero no corresponden a ninguna lectura de `env.*` en `src/`. El asistente IA usa OpenRouter, pero el intercambio code→key no autentica la app (no hay `OPENROUTER_APP_KEY` real en uso), y no hay integración de Stripe en el código actual.

### Variables de los servicios auxiliares del stack

No las lee la app (`src/`), pero las necesitan los otros servicios de `docker-compose.prod.app.yml`:

| Variable                                              | Servicio           | Descripción                                                                              |
| ----------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`             | `rustfs`, `backup` | Credenciales del storage S3-compatible; `backup` las reutiliza para autenticar la subida |
| `R2_BUCKET`                                           | `backup`           | Bucket destino del dump (por defecto `scholio-backups`, dentro de `rustfs`)              |
| `R2_ENDPOINT`                                         | `backup`           | Endpoint S3 destino (por defecto `http://rustfs:9000`, el propio `rustfs` del stack)     |
| `BACKUP_RETENTION_DAYS`                               | `backup`           | Días que se conservan los dumps antes de borrarse (por defecto 30)                       |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `backup`           | Mismas credenciales que el stack de Postgres, para poder hacer `pg_dump`                 |
| `POSTGRES_HOST`                                       | `backup`           | Host de Postgres alcanzable en `scholio-network` (por defecto `postgres`)                |

---

## Checklist de lanzamiento beta

Antes de abrir acceso a usuarios reales:

- [ ] Rellenar todas las variables de entorno de producción (ver tabla anterior)
- [ ] Crear los productos **Pro** y **Team** en el dashboard de Stripe y copiar sus `price_id`
- [ ] Registrar el endpoint de webhook en Stripe: `POST https://tu-dominio.com/api/stripe/webhook`
  - Eventos a escuchar: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Crear el proyecto en Sentry y copiar el DSN (servidor y cliente)
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
