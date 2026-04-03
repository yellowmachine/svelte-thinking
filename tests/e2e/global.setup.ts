import { execSync } from 'child_process';

export default async function globalSetup() {
	// Levantar postgres de test (--wait respeta el healthcheck)
	execSync('docker compose -f docker-compose.test.yml up -d --wait', { stdio: 'inherit' });

	// Migrar esquema contra la DB de test
	execSync('bun run db:migrate', {
		stdio: 'inherit',
		env: {
			...process.env,
			DATABASE_URL: 'postgres://scholarly_app:scholarly_app_test@localhost:5434/scholio_test',
			MIGRATION_DATABASE_URL:
				'postgres://scholarly:scholarly_test@localhost:5434/scholio_test'
		}
	});
}
