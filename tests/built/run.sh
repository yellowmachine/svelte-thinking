#!/bin/bash
# Prueba de punta a punta sobre la app compilada (build/index.js), no sobre
# `vite dev`: ahí la comprobación CSRF de SvelteKit no actúa. Los POST van de
# servidor a servidor con curl, como los mandaría un navegador.
#
# Levanta un Postgres vacío y desechable, lo migra con scripts/migrate.mjs,
# arranca un Seilide falso (fake-seilide.ts) y la app, comprueba el login con
# contraseña y con Seilide, y lo para todo al salir.
#
#   bun run test:built               # compila y prueba
#   SKIP_BUILD=1 bun run test:built  # usa el build/ que haya
#
# Puertos (cámbialos si están ocupados): DB_PORT, FAKE_SEILIDE_PORT, APP_PORT.
set -uo pipefail
cd "$(dirname "$0")/../.."

DB_PORT=${DB_PORT:-5444}
FAKE_SEILIDE_PORT=${FAKE_SEILIDE_PORT:-5446}
APP_PORT=${APP_PORT:-5447}
APP=http://localhost:$APP_PORT
FAKE=http://localhost:$FAKE_SEILIDE_PORT
CONTAINER=scholio-built-test
ADMIN_EMAIL=admin@scholio.test
ADMIN_PASSWORD=admin-pass-123
APP_DB_PASSWORD=app_built_test

LOGS=$(mktemp -d)
JAR=$LOGS/cookies.txt
FAKE_PID=
APP_PID=

cleanup() {
	[ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
	[ -n "$FAKE_PID" ] && kill "$FAKE_PID" 2>/dev/null
	docker stop "$CONTAINER" >/dev/null 2>&1
	rm -rf "$LOGS"
}
trap cleanup EXIT

die() {
	echo "✖ $1" >&2
	[ -f "$LOGS/$2" ] && tail -20 "$LOGS/$2" >&2
	exit 1
}

wait_for() { # descripción, comando
	for _ in $(seq 1 60); do
		eval "$2" >/dev/null 2>&1 && return 0
		sleep 1
	done
	return 1
}

# ── Preparación ──────────────────────────────────────────────────────────────
if [ -z "${SKIP_BUILD:-}" ]; then
	echo "· Compilando..."
	bun run build >"$LOGS/build.log" 2>&1 || die "falló el build" build.log
fi
[ -f build/index.js ] || die "no hay build/index.js (quita SKIP_BUILD)"

echo "· Postgres vacío en el puerto $DB_PORT..."
docker run -d --rm --name "$CONTAINER" \
	-e POSTGRES_USER=scholio -e POSTGRES_PASSWORD=scholio_test -e POSTGRES_DB=scholio \
	--tmpfs /var/lib/postgresql/data -p "127.0.0.1:$DB_PORT:5432" \
	pgvector/pgvector:pg16 >/dev/null || die "no arrancó Postgres (¿puerto $DB_PORT ocupado?)"
wait_for "postgres" "docker exec $CONTAINER pg_isready -U scholio -d scholio -h 127.0.0.1" ||
	die "Postgres no responde"

echo "· Migrando..."
MIGRATION_DATABASE_URL="postgres://scholio:scholio_test@localhost:$DB_PORT/scholio" \
	APP_DB_USER=scholio_app APP_DB_PASSWORD=$APP_DB_PASSWORD \
	ADMIN_EMAIL=$ADMIN_EMAIL ADMIN_PASSWORD=$ADMIN_PASSWORD \
	bun --no-env-file scripts/migrate.mjs >"$LOGS/migrate.log" 2>&1 || die "fallaron las migraciones" migrate.log

echo "· Seilide falso y app..."
FAKE_SEILIDE_PORT=$FAKE_SEILIDE_PORT bun --no-env-file tests/built/fake-seilide.ts >"$LOGS/fake.log" 2>&1 &
FAKE_PID=$!
PORT=$APP_PORT ORIGIN=$APP \
	DATABASE_URL="postgres://scholio_app:$APP_DB_PASSWORD@localhost:$DB_PORT/scholio" \
	BETTER_AUTH_SECRET=built-test-secret-built-test-secret-0123 \
	SEILIDE_URL=$FAKE SEILIDE_CLIENT_ID=scholio-built SEILIDE_CLIENT_SECRET=built-secret \
	ADMIN_EMAIL=$ADMIN_EMAIL \
	bun --no-env-file build/index.js >"$LOGS/app.log" 2>&1 &
APP_PID=$!
wait_for "seilide" "curl -sf $FAKE/api/auth/.well-known/openid-configuration" || die "el Seilide falso no responde" fake.log
wait_for "app" "curl -sf $APP/api/health" || die "la app no responde" app.log

# ── Comprobaciones ───────────────────────────────────────────────────────────
pass=0
fail=0
check() { # descripción, obtenido, esperado
	if [ "$2" = "$3" ]; then
		echo "  ok   $1"
		pass=$((pass + 1))
	else
		echo "  FAIL $1 (esperado '$3', llegó '$2')"
		fail=$((fail + 1))
	fi
}
location() { grep -i '^location:' | tr -d '\r' | sed 's/^[Ll]ocation: //'; }
# Accept: text/html como un navegador; sin él SvelteKit contesta a las acciones en JSON.
form_post() { # ruta, datos, [origin]
	curl -s -D - -o /dev/null -c "$JAR" -X POST "$APP$1" \
		-H "Origin: ${3:-$APP}" -H 'Accept: text/html' \
		-H 'content-type: application/x-www-form-urlencoded' --data "$2"
}
seilide_says() { curl -s -X POST "$FAKE/profile" -d "$1" >/dev/null; }
# Pulsa «Continue with Seilide» y sigue las redirecciones; deja authz, back y final.
signin_seilide() {
	: >"$JAR"
	authz=$(form_post '/login?/signInSeilide' '' | location)
	back=$(curl -s -D - -o /dev/null "$authz" | location)
	final=$(curl -s -D - -o /dev/null -b "$JAR" -c "$JAR" "$back" | location)
}
session_cookies() { grep -c 'scholio.session_token' "$JAR"; }
status_of() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$APP$1"; }

echo "· CSRF"
code=$(form_post '/login?/signInEmail' "email=$ADMIN_EMAIL&password=$ADMIN_PASSWORD" https://evil.example |
	head -1 | awk '{print $2}')
check "POST con Origin ajeno rechazado" "$code" "403"

echo "· Login con contraseña sobre la base nueva"
: >"$JAR"
check "redirige a /projects" "$(form_post '/login?/signInEmail' "email=$ADMIN_EMAIL&password=$ADMIN_PASSWORD" | location)" "/projects"
check "cookie scholio.session_token" "$(session_cookies)" "1"
check "/projects responde 200" "$(status_of /projects)" "200"

echo "· Página de login"
html=$(curl -s "$APP/login")
check "sale «Continue with Seilide»" "$(grep -c 'Continue with Seilide' <<<"$html")" "1"
check "no sale GitHub" "$(grep -ci 'github' <<<"$html")" "0"

echo "· Entrar con Seilide: cuenta nueva, sin lista de espera"
signin_seilide
check "el botón lleva al authorize de Seilide" "${authz%%\?*}" "$FAKE/api/auth/oauth2/authorize"
check "redirect_uri" "${back%%\?*}" "$APP/api/auth/oauth2/callback/seilide"
check "vuelve a /projects" "$final" "/projects"
check "token con client_secret_basic" "$(curl -s "$FAKE/last-token-auth" | cut -c1-6)" "Basic "
check "/projects 200 (tiene perfil, no /no-access)" "$(status_of /projects)" "200"

echo "· Seilide con el email sin verificar"
seilide_says '{"sub":"seilide-x","email":"nadie@example.com","email_verified":false,"name":"X"}'
signin_seilide
check "error=email_not_verified" "$(grep -c 'error=email_not_verified' <<<"$final")" "1"
check "sin sesión" "$(session_cookies)" "0"

echo "· Seilide con el email del admin sin verificar"
seilide_says "{\"sub\":\"seilide-intruso\",\"email\":\"$ADMIN_EMAIL\",\"email_verified\":false,\"name\":\"I\"}"
signin_seilide
check "no se enlaza: error=account_not_linked" "$(grep -c 'error=account_not_linked' <<<"$final")" "1"
check "sin sesión" "$(session_cookies)" "0"

echo "· Seilide con el email del admin verificado"
seilide_says "{\"sub\":\"seilide-admin\",\"email\":\"$ADMIN_EMAIL\",\"email_verified\":true,\"name\":\"Admin\"}"
signin_seilide
check "se enlaza y vuelve a /projects" "$final" "/projects"
check "/projects 200" "$(status_of /projects)" "200"

echo "── $pass ok, $fail fallos"
[ "$fail" = 0 ]
