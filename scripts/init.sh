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

	-- Permisos de conexión y uso del schema
	GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_DB_USER};
	GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};

	-- Default privileges: tablas/secuencias/funciones creadas por POSTGRES_USER
	-- en el futuro (migraciones Drizzle) serán accesibles por APP_DB_USER automáticamente.
	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};

	ALTER DEFAULT PRIVILEGES IN SCHEMA public
	    GRANT EXECUTE ON FUNCTIONS TO ${APP_DB_USER};
EOSQL
