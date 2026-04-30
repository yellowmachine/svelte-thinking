-- =============================================================================
-- neon-init.sql — inicialización única de la base de datos en Neon
-- =============================================================================
-- Ejecutar UNA SOLA VEZ como superuser (MIGRATION_DATABASE_URL) antes del
-- primer deploy. Las migraciones de Drizzle se encargan del resto.
--
-- Uso con psql:
--   psql "$MIGRATION_DATABASE_URL" \
--     -v appuser=scholio_app \
--     -v apppass=<contraseña-segura> \
--     -v dbname=neondb \
--     -f scripts/neon-init.sql
--
-- Notas:
--   - MIGRATION_DATABASE_URL → URL directa de Neon (sin -pooler)
--   - appuser / apppass → los mismos valores que usarás en DATABASE_URL de la app
--   - dbname → el nombre de tu base de datos en Neon (por defecto: neondb)
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector: búsqueda semántica (1536 dims)
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigramas: búsqueda de texto difuso

-- ── App role ──────────────────────────────────────────────────────────────────
-- Usuario no-superuser con el que corre la app. RLS se aplica normalmente.
-- DATABASE_URL de la app usa este usuario; MIGRATION_DATABASE_URL usa el superuser.
CREATE ROLE :"appuser" WITH LOGIN PASSWORD :'apppass';

GRANT CONNECT ON DATABASE :"dbname" TO :"appuser";

-- ── Schemas ───────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS scholio;
CREATE SCHEMA IF NOT EXISTS librarian;

GRANT USAGE ON SCHEMA public    TO :"appuser";
GRANT USAGE ON SCHEMA scholio   TO :"appuser";
GRANT USAGE ON SCHEMA librarian TO :"appuser";

-- ── Default privileges ────────────────────────────────────────────────────────
-- Las tablas que creen las migraciones (como superuser) serán accesibles al
-- app user automáticamente, sin GRANT explícito por tabla.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"appuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"appuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO :"appuser";

ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"appuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"appuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
    GRANT EXECUTE ON FUNCTIONS TO :"appuser";

ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"appuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"appuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
    GRANT EXECUTE ON FUNCTIONS TO :"appuser";

-- ── search_path del app role ──────────────────────────────────────────────────
ALTER ROLE :"appuser" SET search_path = librarian, scholio, public;

-- ── Función helper de Librarian ───────────────────────────────────────────────
-- Devuelve los miembros de un grupo solo si app.current_user_id es miembro.
-- SECURITY DEFINER bypasea RLS para evitar recursión en las políticas de
-- group_members. check_function_bodies=off porque la tabla group_members la
-- crea Drizzle después; diferimos la validación del cuerpo.
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION librarian.get_group_members(p_group_id text)
RETURNS TABLE(
    user_id   text,
    role      text,
    joined_at timestamp,
    name      text,
    email     text
)
SECURITY DEFINER
STABLE
LANGUAGE sql AS $$
    SELECT
        gm.user_id,
        gm.role::text,
        gm.joined_at,
        u.name,
        u.email
    FROM librarian.group_members gm
    JOIN public.user u ON u.id = gm.user_id
    WHERE gm.group_id = p_group_id
      AND EXISTS (
          SELECT 1 FROM librarian.group_members me
          WHERE me.group_id = p_group_id
            AND me.user_id = current_setting('app.current_user_id', true)
      );
$$;

GRANT EXECUTE ON FUNCTION librarian.get_group_members(text) TO :"appuser";

SET check_function_bodies = true;

-- ── Verificación final ────────────────────────────────────────────────────────
SELECT
    'Inicialización completada.' AS status,
    :'appuser'                   AS app_role,
    :'dbname'                    AS database;
