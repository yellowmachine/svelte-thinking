// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest/config" />
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const dirname =
	typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Set ENABLE_SW=true at build time to include the Service Worker.
// Without it (default), the PWA plugin is omitted entirely — no SW, no offline, no interference.
const enableSW = process.env.ENABLE_SW === 'true';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const isDev = process.env.NODE_ENV !== 'production';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		...(enableSW
			? [
					VitePWA({
						registerType: 'autoUpdate',
						devOptions: { enabled: process.env.NODE_ENV !== 'production', type: 'module' },
						// injectManifest: use our custom SW (src/sw.ts) so we can use setCatchHandler
						// for the offline fallback — navigateFallback (SPA mode) is wrong for SSR apps
						strategies: 'injectManifest',
						srcDir: 'src',
						filename: 'sw.ts',
						// The manifest lives in static/manifest.webmanifest so the app is installable
						// even without the SW; don't let the plugin emit a second one.
						manifest: false,
						injectManifest: {
							// html excluded — no hash in filename, must always revalidate from network.
							// /offline is the exception: precached so setCatchHandler can serve it when offline.
							globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
							additionalManifestEntries: [{ url: '/offline', revision: String(Date.now()) }]
						}
					})
				]
			: []),
		...(isDev ? [devtoolsJson()] : [])
	],
	server: {
		port: 5174,
		host: true,
		allowedHosts: ['scholio-dev.local', 'scholio-dev.scholio.review']
	},
	ssr: { noExternal: ['zod'] },
	test: {
		expect: {
			requireAssertions: true
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [
							{
								browser: 'chromium',
								headless: true
							}
						]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: true,
				plugins: [
					// The plugin will run tests for the stories defined in your Storybook config
					// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
					storybookTest({
						configDir: path.join(dirname, '.storybook')
					})
				],
				test: {
					name: 'storybook',
					exclude: [
						// Navbar uses $app/navigation which triggers SvelteKit server
						// init in the browser test context — excluded until resolved.
						'**/Navbar.stories.svelte'
					],
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [
							{
								browser: 'chromium'
							}
						]
					}
				}
			}
		]
	}
});
