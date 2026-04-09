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
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		...(enableSW ? [VitePWA({
			registerType: 'autoUpdate',
			devOptions: { enabled: process.env.NODE_ENV !== 'production', type: 'module' },
			// injectManifest: use our custom SW (src/sw.ts) so we can use setCatchHandler
			// for the offline fallback — navigateFallback (SPA mode) is wrong for SSR apps
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.ts',
			manifest: {
				name: 'Scholio',
				short_name: 'Scholio',
				description: 'Escritura académica colaborativa',
				theme_color: '#2C1E14',
				background_color: '#F5F0E8',
				display: 'standalone',
				scope: '/',
				start_url: '/projects',
				icons: [
					{ src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			injectManifest: {
				// html excluded — no hash in filename, must always revalidate from network.
				// /offline is the exception: precached so setCatchHandler can serve it when offline.
				globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
				additionalManifestEntries: [{ url: '/offline', revision: String(Date.now()) }]
			}
		})] : []),
		devtoolsJson()
	],
	server: { port: 5174, host: true, allowedHosts: ['scholio-dev.local'] },
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
