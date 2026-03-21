#!/bin/bash
# Ejecutado por PostgreSQL al inicializar el contenedor por primera vez.
# Se monta en /docker-entrypoint-initdb.d/ y corre con el usuario superuser.
#
# Usa script .sh en lugar de .sql para poder leer variables de entorno
# (APP_DB_USER, APP_DB_PASSWORD) que no están disponibles en archivos .sql estáticos.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	-- Rol de la aplicación: non-superuser con login.
	-- La app se conecta como este usuario → RLS se aplica normalmente.
	-- Las migraciones corren como POSTGRES_USER (superuser).
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

	-- Schemas de aplicación: creados por drizzle-kit migrate de cada app,
	-- pero los permisos deben existir antes (idempotente con DO).
	DO \$\$ BEGIN
	    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'scholio') THEN
	        CREATE SCHEMA scholio;
	    END IF;
	    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'librarian') THEN
	        CREATE SCHEMA librarian;
	    END IF;
	END \$\$;

	GRANT USAGE ON SCHEMA scholio TO ${APP_DB_USER};
	GRANT USAGE ON SCHEMA librarian TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};
	ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
	    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};
	ALTER DEFAULT PRIVILEGES IN SCHEMA scholio
	    GRANT EXECUTE ON FUNCTIONS TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};
	ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
	    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};
	ALTER DEFAULT PRIVILEGES IN SCHEMA librarian
	    GRANT EXECUTE ON FUNCTIONS TO ${APP_DB_USER};
EOSQL
