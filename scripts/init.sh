#!/bin/bash
# Ejecutado por PostgreSQL al inicializar el contenedor por primera vez.
# Se monta en /docker-entrypoint-initdb.d/ y corre con el usuario superuser.
#
# Usa script .sh en lugar de .sql para poder leer variables de entorno
# (APP_DB_USER, APP_DB_PASSWORD) que no están disponibles en archivos .sql estáticos.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	-- pgvector extension (requires pgvector/pgvector image)
	CREATE EXTENSION IF NOT EXISTS vector;

	-- Las migraciones corren como POSTGRES_USER (superuser).
	-- search_path explícito para que CREATE TABLE sin schema vaya a public,
	-- no a scholio (que coincide con el nombre del usuario superuser).
	ALTER ROLE ${POSTGRES_USER} SET search_path TO public, scholio;

	-- Rol de la aplicación: non-superuser con login.
	-- La app se conecta como este usuario → RLS se aplica normalmente.
	CREATE ROLE ${APP_DB_USER} WITH LOGIN PASSWORD '${APP_DB_PASSWORD}';

	-- Permisos de conexión y uso de schemas
	GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
	GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};

	-- Default privileges en public (tablas better-auth)
	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT EXECUTE ON FUNCTIONS TO ${APP_DB_USER};

	-- Scholio schema (app principal)
	CREATE SCHEMA IF NOT EXISTS scholio;

	GRANT USAGE ON SCHEMA scholio TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
	    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
	    GRANT EXECUTE ON FUNCTIONS TO ${APP_DB_USER};

	-- Librarian schema (app hermana, comparte DB y rol)
	CREATE SCHEMA IF NOT EXISTS librarian;

	GRANT USAGE ON SCHEMA librarian TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
	    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
	    GRANT EXECUTE ON FUNCTIONS TO ${APP_DB_USER};

	-- Devuelve los miembros de un grupo solo si el usuario en app.current_user_id
	-- (seteado por withRLS) es miembro. SECURITY DEFINER bypasea RLS internamente
	-- para evitar la recursión group_members → groups → group_members.
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
	LANGUAGE sql AS \$\$
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
	\$\$;

	GRANT EXECUTE ON FUNCTION librarian.get_group_members(text) TO ${APP_DB_USER};

	ALTER ROLE ${APP_DB_USER} SET search_path = librarian, scholio, public;

EOSQL
