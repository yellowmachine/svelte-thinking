# Scholio — Plataforma de escritura académica colaborativa (Beta)

Scholio es una herramienta web para investigadores y equipos académicos que necesitan redactar,
revisar y versionar documentos de forma colaborativa, con asistencia de inteligencia artificial
integrada. En producción en [scholio.review](https://scholio.review). La interfaz está en inglés;
este README, en español.

La guía de uso está dentro de la app, en `/help` (con proyectos de ejemplo que se crean con un clic).
Este README es la parte técnica.

---

## Funcionalidades

### Proyectos

Cada proyecto tiene sus secciones en pestañas: documentos, bibliografía, fotos, datasets, notebooks,
requisitos, revisión, issues, búsqueda y asistente.

- **Documentos** — editor Markdown con borradores guardados solos, historial de versiones (commits con
  mensaje), diff entre versiones, modo foco y corrector ortográfico y gramatical
- **Bibliografía** — referencias por proyecto y biblioteca personal (`/bib`); alta por DOI (CrossRef),
  URL o BibTeX; PDF adjunto por referencia y subnotas (`[[@clave:slug]]`)
- **Fotos** — galería con descripción por imagen, lightbox y copia como Markdown
- **Datasets** — CSV, TSV o JSON (hasta 5 MB), guardados en la base, para los gráficos Vega-Lite
- **Notebooks** — Jupyter (`.ipynb`, hasta 50 MB)
- **Requisitos** — lo que pide la revista o el tribunal; el asistente revisa los documentos contra ellos
- **Revisión e issues** — hilos de comentarios del proyecto y tareas abiertas
- **Búsqueda** — semántica (pgvector + embeddings de OpenAI); sin `OPENAI_API_KEY` devuelve vacío
- **Exportar** — documento a LaTeX, Typst o PDF (servicio Typst; diagramas Mermaid por Kroki), libro
  a partir de varios documentos, y el proyecto entero como zip, que se puede volver a importar
- **Ficheros** en el S3 propio de cada usuario u organización (Settings → Storage): Scholio no guarda
  ficheros en su servidor

### Colaboración

- Roles: owner, author, coauthor, reviewer, commenter. Reviewers y commenters solo pueden crear
  documentos privados (sus notas)
- Comentarios anclados a la selección exacta del texto, con respuestas y resolución/reapertura
- Organizaciones con sus miembros e invitaciones; red de colaboradores (`/network`)
- Notificaciones, también por email (con enlace para darse de baja)
- Enlaces de vista previa de una versión (`/preview/[token]`), sin cuenta

### Publicar

- Proyectos públicos o privados; `/explore` para encontrar proyectos e investigadores
- Blog personal en `/@handle`, con listas, RSS y PDF de cada entrada; y el blog del sitio (`/blog`)

### Asistente IA

- Chat por proyecto (agente con herramientas: leer documentos, búsqueda semántica, crear documentos…)
  y chat en el editor que propone cambios como antes/después que se aceptan o rechazan
- Revisión contra los requisitos, borradores de sección, enriquecimiento (personas y citas sin marcar),
  ortografía y gramática
- Modelos vía [OpenRouter](https://openrouter.ai) con la clave de cada usuario u organización (BYOK);
  el modelo se elige por tarea en Settings → AI, y el coste real de cada llamada queda registrado
  (`/usage`, `/usage/org`)

### Cuenta y acceso

- Acceso por lista de espera: quien se apunta y el admin aprueba (`/admin`) recibe un enlace de
  registro con email/contraseña
- «Entrar con Seilide» (la cuenta de la nube de JellyCartoon, OpenID Connect): entra directamente, sin
  lista de espera — ver [Entrar con Seilide](#entrar-con-seilide)
- Verificación en dos pasos (TOTP) y enlace con ORCID
- Sin planes ni pagos: todas las cuentas son iguales

### Otros

- PWA instalable; modo sin conexión solo si la imagen se construye con `ENABLE_SW=true`
- Un único tour de bienvenida, en el editor (driver.js), que se repite desde `/help#editor`
- Errores de cliente y servidor en Sentry

---

## Sintaxis del editor

Markdown estándar con extensiones propias. La referencia completa, con ejemplos, está en `/help`;
aquí el resumen y dónde vive cada cosa en el código.

| Sintaxis                                      | Qué hace                                                      | Código                    |
| --------------------------------------------- | ------------------------------------------------------------- | ------------------------- |
| `[[@clave]]`, `[[@a; @b]]`, `[[@clave:slug]]` | Cita (y subnota de una referencia); también `[@clave]` Pandoc | `utils/citationSyntax.ts` |
| `$…$`, `$$…$$`                                | Matemáticas (KaTeX)                                           |                           |
| `[[Título]]`                                  | Enlace a otro documento del proyecto, por título              | `utils/wikilinks.ts`      |
| `[[Título:hash]]`                             | Documento público de otro usuario (8 primeros del UUID)       | `utils/wikilinks.ts`      |
| `[[doc:uuid\|Título]]`                        | Enlace estable por UUID (capítulos de un libro)               | `utils/wikilinks.ts`      |
| `[[diagram:uuid\|Título]]`                    | Diagrama incrustado como SVG                                  | `utils/wikilinks.ts`      |
| `[[#Encabezado]]`                             | Enlace a una sección del mismo documento                      | `utils/wikilinks.ts`      |
| `[[person:Nombre]]`, `[[index:persons]]`      | Mención de una persona e índice onomástico                    | `utils/wikilinks.ts`      |
| `[[index:toc]]`                               | Índice de contenidos                                          | `utils/wikilinks.ts`      |
| `[^1]`                                        | Notas al pie                                                  |                           |
| `> [!note]`, `warning`, `tip`, `caution`      | Callouts                                                      | `utils/callouts.ts`       |
| `> [!epigraph]`                               | Epígrafe                                                      | `utils/epigraphs.ts`      |
| ` ```vega-lite `                              | Gráfico; `"data": { "$ref": "dataset:fichero.csv" }`          |                           |
| ` ```mermaid `                                | Diagrama (en el PDF, renderizado por Kroki)                   |                           |

- Las citas salen en el estilo del proyecto (APA 7, IEEE, Vancouver o Chicago) y la bibliografía se
  genera al final. El editor inserta `[[@clave]]`; en Typst/PDF, una clave que no está en la
  bibliografía sale como texto `[clave]`.
- El `$ref` de un dataset es su **nombre de fichero completo, con extensión** (`dataset:resultados.csv`),
  tal como lo copia la página de Datasets.
- El panel «Mentioned in» del editor muestra los documentos que enlazan al actual.

---

## Stack técnico

| Capa          | Tecnología                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| Frontend      | SvelteKit 2, Svelte 5 (runes), TailwindCSS, Lucide                         |
| API           | tRPC v11 con procedimientos protegidos                                     |
| Base de datos | PostgreSQL 16 con Row-Level Security (RLS) y pgvector, Drizzle ORM         |
| Caché         | Redis (`src/lib/server/cache.ts`)                                          |
| Auth          | Better Auth (email + Seilide, OpenID Connect), TOTP                        |
| Storage       | S3 propio de cada usuario u organización (BYO S3)                          |
| IA            | OpenRouter (BYOK, modelo por tarea); embeddings de OpenAI                  |
| Documentos    | KaTeX, Vega-Lite, Mermaid; servicio Typst (`typst-service/`) y Kroki (PDF) |
| Errores       | Sentry                                                                     |
| Runtime       | Bun, `svelte-adapter-bun`                                                  |
| Tests         | Vitest, Playwright (e2e, fuera de CI), Storybook                           |

---

## Desarrollo local

### Requisitos

- [Bun](https://bun.sh) >= 1.0
- [Docker](https://www.docker.com)

### Puesta en marcha (desde cero)

```sh
bun install                 # instala dependencias y, con "prepare", los git hooks (husky + lint-staged)
cp .env.example .env        # y rellenar lo necesario
bun run db:up               # Postgres vacío y los servicios auxiliares (espera a que estén listos)
bun run db:migrate          # prepara la base y aplica las migraciones
bun run dev                 # http://localhost:5174
```

Si `git config core.hooksPath` no imprime nada tras el install, `bun run prepare` instala los hooks; sin
ellos los commits no pasan por `lint-staged` y los problemas de formato solo salen en CI.

`docker-compose.dev.yml` levanta Postgres (pgvector, en el 5433 según `.env.example`), Redis, el servicio
Typst, Kroki con Mermaid y un S3 local (rustfs) para probar Settings → Storage sin uno de verdad.

`bun run db:migrate` (`scripts/migrate.mjs`) levanta una base vacía de una vez: crea la extensión
pgvector, el schema `scholio` y el rol de la app (`APP_DB_USER`/`APP_DB_PASSWORD`, sin superuser ni
dueño de las tablas, para que RLS se le aplique siempre), aplica las migraciones de Drizzle, da
permisos al rol y siembra el admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`). Es idempotente. No hay
`init.sh`: el Postgres arranca vacío y todo lo hace este script. **Sin `APP_DB_PASSWORD` no arranca**
(ni la app tampoco): mejor un despliegue en rojo que una app levantada que no puede leer la base. Si
el rol ya existe, no le cambia la contraseña (`ALTER ROLE scholio_app PASSWORD '…'` en el contenedor
`db`).

### Scripts

| Script                     | Para qué                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| `check`, `lint`, `format`  | svelte-check; prettier + eslint (lo mismo que CI); formatear           |
| `test:unit`                | Vitest (proyecto `server`)                                             |
| `db:test:ready`            | Postgres de tests en el 5434, migrado, para los tests de integración   |
| `test:built`               | La app compilada contra un Seilide falso (ver abajo)                   |
| `test:e2e`                 | Playwright                                                             |
| `db:generate`              | Nueva migración de Drizzle a partir de los schemas                     |
| `db:studio`                | Drizzle Studio                                                         |
| `auth:schema`              | Regenera el schema de Better Auth (`src/lib/server/db/auth.schema.ts`) |
| `storybook`                | Storybook en el 6006                                                   |
| `tunnel`, `preview:tunnel` | La app compilada detrás del túnel `scholio-dev` (ver abajo)            |
| `genpwd`                   | Una contraseña o secreto aleatorio                                     |

### Entrar con Seilide

Seilide es la cuenta de la nube de JellyCartoon, un proveedor OpenID Connect hecho con Better Auth.
Scholio lo usa con el plugin `genericOAuth` (providerId `seilide`, PKCE, `client_secret_basic`,
scopes `openid profile email`; ni `family` ni `offline_access`). Está en `src/lib/server/auth-options.ts`.

**Crear el cliente.** El administrador de Seilide lo crea en `<SEILIDE_URL>/admin/apps`:

- **Sin** marcar «para familias», confidencial (`client_secret_basic`), sin pantalla de consentimiento
- URL de vuelta: `<ORIGIN>/api/auth/oauth2/callback/seilide` — en producción
  `https://scholio.review/api/auth/oauth2/callback/seilide`

Salen tres líneas para el `.env` (o las variables de Dokploy): `SEILIDE_URL`, `SEILIDE_CLIENT_ID` y
`SEILIDE_CLIENT_SECRET`. **Sin las tres, el botón no sale** y la ruta de Seilide no existe.
`SEILIDE_URL` hoy es `https://nube.scholio.review`; será `https://seilide.app`.

**Cuentas.**

- Quien entra por primera vez con Seilide tiene su cuenta (y su perfil de Scholio) al momento, **sin
  pasar por la lista de espera**. Empieza igual que cualquier cuenta: no hay planes.
- Si ya había una cuenta con ese email, se enlaza — **solo** si Seilide dice `email_verified: true`.
  Seilide no está en `trustedProviders` a propósito: con él, Better Auth enlazaría aunque el email no
  estuviera verificado. Si no está verificado, ni se crea cuenta ni se enlaza
  (`/auth/error?error=email_not_verified` o `account_not_linked`).
- Si se enlaza a una cuenta cuyo email nunca se verificó, se borra su contraseña: así nadie que la
  hubiera creado con el email de otro sigue entrando en ella.
- Una vez enlazada, la persona se reconoce por el `sub` de Seilide (`account.account_id`), nunca por
  el email.

**Sin Seilide de verdad**, `bun run test:built` (`tests/built/run.sh`) compila la app, levanta un
Postgres vacío y desechable, lo migra, arranca un Seilide falso (`tests/built/fake-seilide.ts`) y
comprueba sobre la app compilada el rechazo CSRF, el login con contraseña y con Seilide (cuenta nueva,
email sin verificar, no enlazar y enlazar). Lo para todo al terminar. Necesita Docker y los puertos
5444, 5446 y 5447 libres (`DB_PORT`, `FAKE_SEILIDE_PORT`, `APP_PORT` para cambiarlos);
`SKIP_BUILD=1` reutiliza el `build/` que haya.

**Probarlo de punta a punta** necesita que Seilide pueda volver por `https`: se usa el túnel de
Cloudflare `scholio-dev.scholio.review` → `localhost:5176` y un cliente de pruebas en Seilide con la
vuelta `https://scholio-dev.scholio.review/api/auth/oauth2/callback/seilide`.

```sh
bun run tunnel          # en una terminal: el túnel (~/.cloudflared/scholio-dev.yml)
bun run preview:tunnel  # en otra: la app compilada con ORIGIN=https://scholio-dev.scholio.review
```

Usa `preview:tunnel` (la app compilada) y no `dev:tunnel` para probar formularios y POSTs: la
comprobación CSRF de SvelteKit no actúa en `vite dev`.

### Librarian

Librarian es una app independiente, con su propia base de datos y su propio login. En Scholio ya no
queda nada que las una: ni sesión compartida entre subdominios (`crossSubDomainCookies`, la cookie con
`Domain=scholio.review`), ni el schema `librarian`, ni `PUBLIC_LIBRARIAN_URL`.
`src/lib/no-librarian.test.ts` lo comprueba. Las cookies de Scholio llevan el prefijo `scholio.` para
no confundirse con las que quedaran de antes en el navegador.

---

## Ramas y CI

- Se trabaja en `development`; `staging` y `main` reciben los merges. Un push a `main` despliega
  producción.
- `.github/workflows/ci.yml`, en cada push y PR a `main` y `staging`: `check`, `lint`, `build` y los
  tests unitarios. El job de e2e está comentado hasta que Playwright funcione en CI.
- `.github/workflows/build-ghcr.yml`, en cada push a `main`: construye las imágenes y despliega (abajo).

---

## Despliegue en producción (Dokploy)

### Infraestructura

- **Servidor**: un VPS de netcup con [Dokploy](https://dokploy.com) self-hosted, que gestiona deploys,
  SSL (Traefik), variables de entorno y reverse proxy. Dashboard en `dokploy.scholio.review`
- **Imágenes**: `.github/workflows/build-ghcr.yml` construye y publica en GHCR en cada push a `main`:
  - `ghcr.io/yellowmachine/svelte-thinking:latest` — app
  - `ghcr.io/yellowmachine/scholio-typst:latest` — typst (solo si cambió `typst-service/**`, o con `workflow_dispatch`)

  Dokploy hace `pull` de estas imágenes, no construye desde el `Dockerfile`. Si el paquete de GHCR es privado, hay que configurar credenciales de registry en Dokploy (usuario + token con scope `read:packages`).

- **Deploy automático**: el job `deploy-dokploy` de `build-ghcr.yml` llama al webhook de Dokploy justo después de que `build-app` (y `build-typst`, si corrió) terminen en éxito — así Dokploy hace `pull` de la imagen recién publicada y redeploya sin intervención manual. Requiere un secret en **Settings → Secrets and variables → Actions** del repo de GitHub:

  | Secret                | Dónde se obtiene                                                                                |
  | --------------------- | ----------------------------------------------------------------------------------------------- |
  | `DOKPLOY_WEBHOOK_URL` | Dashboard Dokploy → aplicación `scholio` → **General** → **Deployments** → botón "Copy Webhook" |

  Antes de llamar al webhook, el job espera (`docker buildx imagetools inspect`, hasta 30×5s) a que el tag `:latest` en GHCR resuelva al digest que se acaba de publicar — sin esto, `pull_policy: always` puede tirar de la imagen anterior si Dokploy pulla justo antes de que el tag propague.

  ⚠️ **El endpoint del webhook es el mismo que usa el trigger nativo de Dokploy por push de GitHub** (`/api/deploy/compose/<refreshToken>`, ver [código fuente](https://github.com/Dokploy/dokploy/blob/main/apps/dokploy/pages/api/deploy/compose/%5BrefreshToken%5D.ts)). Solo cuenta como deploy real si la petición lleva la cabecera `x-github-event` y un `ref` en el body que coincida con la rama configurada en Dokploy — si no, responde `301 "Branch Not Match"` sin desplegar nada, y como no es un código ≥400 pasa desapercibido para un `curl --fail` normal (así estuvo meses en silencio). Por eso el `curl` de este job manda:

  ```
  -H "x-github-event: push" -d '{"ref": "refs/heads/main", "commits": []}'
  ```

  y valida explícitamente `HTTP 200` en vez de confiar en `curl --fail`. También requiere el toggle **Auto Deploy** activo en el tab **General** de la app en Dokploy — desactivarlo devuelve `400 "Automatic deployments are disabled for this compose"` y bloquea el webhook igual que al trigger nativo (es el mismo flag para los dos, no hay forma de separarlos).

  Como el trigger nativo de Dokploy también dispara en cuanto detecta el push (antes de que termine el build de la imagen), es normal ver **dos deploys por cada push a `main`**: uno prematuro (puede coger la imagen vieja) y el de este job, que siempre llega después de confirmar que la imagen está lista. Con `pull_policy: always`, el segundo vuelve a hacer `pull` y queda como estado final — no hace falta desactivar el trigger nativo.

### Un solo stack: `docker-compose.prod.yml`

El despliegue es **un único stack de Dokploy** (Docker Compose apuntando a `docker-compose.prod.yml`) con
la app, su Postgres (`db`), `redis`, `typst`, `kroki` y `kroki-mermaid`. Su Postgres es solo
suyo y arranca vacío: `scripts/migrate.mjs`, al arrancar la app, crea el rol `scholio_app`, el schema y
las tablas.

- **Sin redes externas propias**: los servicios se hablan por la red por defecto del stack; solo
  `scholio` está además en `dokploy-network`, para que Traefik le dé dominio.
- **Volúmenes sin `name:` fijo**: Compose les antepone el nombre del proyecto de Dokploy, así que dos
  stacks nunca comparten volumen por accidente.
- **Sin puertos al host**: Traefik llega por `dokploy-network` (app en el 3000).

### Configurar la aplicación en Dokploy

1. **New Application → Docker Compose**, apuntando a `docker-compose.prod.yml`
2. En **Environment Variables**, las de la tabla de abajo
3. Dominio (Traefik + Let's Encrypt): `scholio.review` → servicio `scholio`, puerto 3000
4. Deploy

Los ficheros (fotos, PDFs de referencias) van al S3 que cada usuario u organización configura en
Settings → Storage. El stack no lleva almacenamiento propio.

> **Backups de Postgres**: no forman parte de este stack. Se hacen fuera, contra un S3 externo,
> para que sobrevivan a la pérdida del servidor.

### Migraciones (automáticas)

`scripts/entrypoint.sh` ejecuta `bun scripts/migrate.mjs` antes de arrancar el servidor — prepara la base (extensión, schema, rol de la app y sus permisos), corre las migraciones de Drizzle pendientes y siembra el usuario admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) si aún no existe. Es idempotente, así que corre sin problema en cada arranque/redeploy del contenedor `scholio`, no solo en el primero.

Usa `MIGRATION_DATABASE_URL` (superusuario, con permisos de `CREATE TABLE`) en vez de `DATABASE_URL` (rol de la app, sin esos permisos).

Si necesitas lanzarlas a mano (por ejemplo para depurar), entra a la terminal del contenedor desde Dokploy (o `docker exec`) y ejecuta el mismo comando:

```bash
bun scripts/migrate.mjs
```

### ⚠️ `pull_policy: always` — por qué está en el compose

Dokploy tiene un bug conocido por el que un deploy normal reutiliza la imagen cacheada en lugar de descargar la nueva. En vez de depender del toggle "Pull always" de la UI de Dokploy (fácil de olvidar si se recrea la app), `scholio` y `typst` en `docker-compose.prod.yml` llevan `pull_policy: always` — un campo nativo del Compose Spec (Docker Compose v2.10+) que fuerza el `pull` antes de levantar el servicio, queda versionado y no depende de un ajuste manual en la UI.

**Consecuencia**: cada deploy descarga la imagen completa, lo que acumula capas antiguas en `/var/lib/docker/overlay2`. Sin limpieza periódica, el disco se llena (ya pasó en producción). Ver la sección de mantenimiento.

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

### Email

netcup bloquea por defecto la salida a los puertos 25, 465 y 587 (política «netcup Mail block» del
firewall en el SCP). En este servidor está quitada; si el email deja de llegar, o en un servidor nuevo,
mirar eso primero (`nc -vz -w 5 smtp.protonmail.ch 587`).

---

## Variables de entorno

Todas están documentadas en `.env.example`. Las que hay que poner en Dokploy para `docker-compose.prod.yml`:

| Variable                                        | Descripción                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ORIGIN`                                        | `https://scholio.review` (URLs de retorno, cookies)                                          |
| `BETTER_AUTH_SECRET`                            | Secreto de sesión (`openssl rand -base64 32`)                                                |
| `POSTGRES_PASSWORD`                             | Contraseña del dueño de la base (`scholio`), la usan las migraciones                         |
| `APP_DB_PASSWORD`                               | Contraseña del rol de la app (`scholio_app`, con RLS); sin ella no arranca                   |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                | Admin con acceso a `/admin`, sembrado al arrancar                                            |
| `SEILIDE_URL/CLIENT_ID/CLIENT_SECRET`           | «Entrar con Seilide» (opcional: sin las tres no sale el botón)                               |
| `ORCID_CLIENT_ID/SECRET/REDIRECT_URI/BASE_URL`  | OAuth de ORCID (opcional)                                                                    |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` | Envío de email transaccional                                                                 |
| `KMS_MASTER_KEY`                                | Cifra las API keys de usuario (BYOK); cambiarla las pierde                                   |
| `OPENAI_API_KEY`                                | Embeddings (`text-embedding-3-small`) para la búsqueda semántica (opcional: sin ella, vacía) |
| `SLACK_WEBHOOK_URL`                             | Notificaciones internas (opcional)                                                           |
| `SENTRY_DSN`                                    | DSN de Sentry en servidor (opcional)                                                         |
| `PUBLIC_SENTRY_DSN`                             | DSN de Sentry en cliente (opcional; se lee al arrancar, suele ser el mismo que `SENTRY_DSN`) |

Fijadas en el propio compose, sin tocar en Dokploy: `DATABASE_URL`, `MIGRATION_DATABASE_URL`,
`APP_DB_USER`, `REDIS_URL`, `TYPST_SERVICE_URL`, `KROKI_URL`, `BODY_SIZE_LIMIT` (`20M`), y
`ADDRESS_HEADER`/`XFF_DEPTH` (la IP real del cliente detrás de Traefik).

Otras:

- `ENABLE_SW` — argumento de build (`Dockerfile`): `true` incluye el Service Worker y el modo sin
  conexión. CI no lo pasa, así que producción va sin él.
- `ALLOW_PRIVATE_URLS` — `true` deja que las URLs que da el usuario (importar por URL, Jupyter,
  endpoint S3) apunten a direcciones privadas, que `safeFetch` rechaza por defecto. En `bun run dev`
  ya se permiten; en producción, solo si Jupyter o el S3 están en la misma red privada.

> ⚠️ **Límite de subida**: `BODY_SIZE_LIMIT` es `20M` en producción, pero la app acepta más: importar
> un proyecto hasta 200 MB, PDFs de referencias y notebooks hasta 50 MB. En producción, todo lo que
> pase de 20 MB falla antes de llegar a la app. `.env.example` usa `100M`.

---

## Pendiente

- **Email editable** — nombre y bio se cambian en Settings; el email no
- **Avatar de usuario** — muestra iniciales; subida de foto de perfil no implementada
- **Soft delete** de documentos — el borrado actual es definitivo
- **Transferencia de propiedad de proyectos** — sin UI ni endpoint
- **Sugerencias de referencias externas** para el asistente (Semantic Scholar, OpenLibrary); el alta
  por DOI (CrossRef) ya existe
- **e2e en CI** — Playwright está, el job no

---

## Créditos

Desarrollado con [Claude Code](https://claude.ai/claude-code).
