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

### Cuenta y acceso

- Acceso por lista de espera: quien se apunta y el admin aprueba recibe un enlace de registro con email/contraseña
- «Entrar con Seilide» (la cuenta de la nube de JellyCartoon, OpenID Connect): entra directamente, sin lista de espera — ver [Entrar con Seilide](#entrar-con-seilide)
- Verificación en dos pasos (TOTP)
- Sin planes ni pagos: todas las cuentas son iguales

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
| Auth          | Better Auth (email + Seilide, OpenID Connect)        |
| Storage       | MinIO (S3-compatible)                                |
| IA            | Anthropic SDK — Claude Haiku 4.5                     |
| Errores       | Sentry                                               |
| Runtime       | Bun                                                  |

---

## Desarrollo local

### Requisitos

- [Bun](https://bun.sh) >= 1.0
- [Docker](https://www.docker.com)

### Puesta en marcha (desde cero)

```sh
# 1. Instalar dependencias
bun install

# 2. Instalar los git hooks (pre-commit con lint-staged) — el "prepare"
#    de package.json debería hacerlo solo tras el install, pero conviene
#    confirmarlo a mano: si `git config core.hooksPath` no imprime nada,
#    ejecuta esto.
bun run prepare

# 3. Copiar variables de entorno y rellenar las necesarias
cp .env.example .env

# 4. Levantar PostgreSQL (vacío) y los servicios auxiliares
docker compose -f docker-compose.dev.yml up -d

# 5. Preparar la base y aplicar migraciones
bun run db:migrate

# 6. Arrancar el servidor de desarrollo
bun run dev
```

`bun run db:migrate` (`scripts/migrate.mjs`) levanta una base vacía de una vez: crea la extensión
pgvector, el schema `scholio` y el rol de la app (`APP_DB_USER`/`APP_DB_PASSWORD`, sin superuser ni
dueño de las tablas, para que RLS se le aplique siempre), aplica las migraciones de Drizzle, da
permisos al rol y siembra el admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`). Es idempotente. No hay
`init.sh`: el Postgres arranca vacío y todo lo hace este script.

> **Nota**: si `bun run prepare` no deja `.git/hooks` funcionando (`git config core.hooksPath`
> vacío tras el install), los commits pasarán sin pasar por `lint-staged` en local — el `bun run lint`
> de CI seguirá pillando problemas de formato, pero solo al abrir el PR en vez de en el commit.

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

- Fly.io está deshabilitado (`fly.toml` y el job `deploy-fly` quedaron comentados) — el despliegue va solo por Dokploy.

### Un solo stack: `docker-compose.prod.yml`

El despliegue es **un único stack de Dokploy** (Docker Compose apuntando a `docker-compose.prod.yml`) con
la app, su Postgres (`db`), `redis`, `typst`, `kroki`, `kroki-mermaid` y `rustfs`. Su Postgres es solo
suyo y arranca vacío: `scripts/migrate.mjs`, al arrancar la app, crea el rol `scholio_app`, el schema y
las tablas.

- **Sin redes externas propias**: los servicios se hablan por la red por defecto del stack; solo
  `scholio` y `rustfs` están además en `dokploy-network`, para que Traefik les dé dominio. Ya no existe
  `scholio-network`.
- **Volúmenes sin `name:` fijo**: Compose les antepone el nombre del proyecto de Dokploy, así que dos
  stacks nunca comparten volumen por accidente.
- **Sin puertos al host**: Traefik llega por `dokploy-network` (app en el 3000, rustfs en el 9000).

### Configurar la aplicación en Dokploy

1. **New Application → Docker Compose**, apuntando a `docker-compose.prod.yml`
2. En **Environment Variables**, las de la tabla de abajo
3. Dominios (Traefik + Let's Encrypt): `scholio.review` → servicio `scholio`, puerto 3000; el de
   `STORAGE_PUBLIC_URL` → servicio `rustfs`, puerto 9000
4. Deploy

El bucket (`STORAGE_BUCKET`, por defecto `scholio`) y su política de lectura pública los crea la app en
la primera subida (`ensureBucket` en `src/lib/server/storage.ts`).

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

Todas están documentadas en `.env.example`. Las que hay que poner en Dokploy para `docker-compose.prod.yml`:

| Variable                                        | Descripción                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ORIGIN`                                        | `https://scholio.review` (URLs de retorno, cookies)                                |
| `BETTER_AUTH_SECRET`                            | Secreto de sesión (`openssl rand -base64 32`)                                      |
| `POSTGRES_PASSWORD`                             | Contraseña del dueño de la base (`scholio`), la usan las migraciones               |
| `APP_DB_PASSWORD`                               | Contraseña del rol de la app (`scholio_app`, con RLS); `migrate.mjs` crea el rol   |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                | Admin con acceso a `/admin`, sembrado al arrancar                                  |
| `SEILIDE_URL/CLIENT_ID/CLIENT_SECRET`           | «Entrar con Seilide» (opcional: sin las tres no sale el botón)                     |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`       | Credenciales de rustfs; la app las usa también para subir                          |
| `STORAGE_PUBLIC_URL`                            | URL pública desde la que el navegador descarga los ficheros (el dominio de rustfs) |
| `STORAGE_BUCKET`                                | Opcional, por defecto `scholio`                                                    |
| `ORCID_CLIENT_ID/SECRET/REDIRECT_URI/BASE_URL`  | OAuth de ORCID (opcional)                                                          |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM` | Envío de email transaccional                                                       |
| `KMS_MASTER_KEY`                                | Cifra las API keys de usuario (BYOK); cambiarla las pierde                         |
| `OPENAI_API_KEY`                                | Embeddings (`text-embedding-3-small`) para búsqueda semántica                      |
| `SLACK_WEBHOOK_URL`                             | Notificaciones internas (opcional)                                                 |
| `SENTRY_DSN`                                    | DSN de Sentry en servidor (opcional)                                               |
| `PUBLIC_SENTRY_DSN`                             | DSN de Sentry en cliente — **build-time**, se hornea en la imagen de GHCR          |

Ya no existen `GITHUB_CLIENT_ID/SECRET` (sin login con GitHub), `PUBLIC_LIBRARIAN_URL` ni nada de
Stripe.

`SCIPY_SERVICE_URL` se sigue leyendo desde `src/lib/server/scipy.ts`, pero es código muerto (la ruta
`(scipy)` no está en uso).

---

## Checklist de lanzamiento beta

Antes de abrir acceso a usuarios reales:

- [ ] Rellenar todas las variables de entorno de producción (ver tabla anterior)
- [ ] Crear el cliente de Scholio en Seilide (ver [Entrar con Seilide](#entrar-con-seilide))
- [ ] Crear el proyecto en Sentry y copiar el DSN (servidor y cliente)
- [ ] Verificar que el bucket es accesible públicamente para `GET` (la política se aplica automáticamente en el primer upload)

---

## Pendiente (no bloquea el beta)

### Funcionalidades de usuario

- **Perfil editable** — los campos de nombre y email están en la UI pero sin backend; actualmente son de solo lectura
- **Cambio de contraseña** — formulario presente, sin endpoint conectado
- **Avatar de usuario** — muestra iniciales; subida de foto de perfil no implementada

### Infraestructura y operaciones

- **Panel de administración** — sin métricas de uso ni gestión de usuarios desde la propia app; por ahora se gestiona desde el dashboard de Sentry
- **Rate limiting en IA** — sugerencias inline limitadas a 30/día por usuario; chat y borradores requieren BYOK (OpenRouter)
- **Soft delete** para proyectos y documentos — el borrado actual es definitivo; anotado para implementar antes de escalar

### Funcionalidades académicas avanzadas

- **Sugerencias de referencias externas** — el asistente podría enlazar fuentes de Semantic Scholar u OpenLibrary relevantes al contexto del documento (feature 1 del roadmap IA)
- **Exportación PDF** — pendiente; exportación a LaTeX (`.tex`) y Typst (`.typ`) ya implementada
- **Transferencia de propiedad de proyectos** — esquema de base de datos preparado, sin UI ni endpoint
- **Eliminación de cuenta** — botón presente en zona de peligro, sin acción conectada

---

## Créditos

Desarrollado con [Claude Code](https://claude.ai/claude-code).
Asistente IA impulsado por [Claude Haiku 4.5](https://www.anthropic.com) (Anthropic).
