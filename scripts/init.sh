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

EOSQL
