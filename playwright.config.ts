import { defineConfig } from '@playwright/test';

export default defineConfig({
	globalSetup: './tests/e2e/global.setup.ts',
	globalTeardown: './tests/e2e/global.teardown.ts',
	webServer: {
		command: 'vite dev --mode test --port 5175',
		port: 5175,
		reuseExistingServer: false,
		timeout: 30_000
	},
	use: {
		baseURL: 'http://localhost:5175'
	},
	projects: [
		{
			name: 'setup',
			testMatch: 'tests/e2e/setup.e2e.ts'
		},
		{
			name: 'e2e',
			dependencies: ['setup'],
			testMatch: 'tests/e2e/**/*.e2e.ts',
			testIgnore: 'tests/e2e/setup.e2e.ts'
		}
	]
});
