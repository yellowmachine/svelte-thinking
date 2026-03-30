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

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			devOptions: { enabled: false },
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
			workbox: {
				// html excluded — no hash in filename, must always revalidate from network
				globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
				navigateFallback: null,
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'html-cache',
							networkTimeoutSeconds: 3,
							cacheableResponse: { statuses: [200] }
						}
					},
					// tRPC document and project queries — NetworkFirst with offline fallback
					{
						urlPattern: ({ url }) =>
							url.pathname.startsWith('/api/trpc/documents.') ||
							url.pathname.startsWith('/api/trpc/projects.'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'trpc-data-cache',
							networkTimeoutSeconds: 5,
							cacheableResponse: { statuses: [200] },
							expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }
						}
					},
					// Auth session — cached manually for offline use
					{
						urlPattern: ({ url }) => url.pathname === '/api/auth/session',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'auth-session-cache',
							networkTimeoutSeconds: 5,
							cacheableResponse: { statuses: [200] },
							expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 }
						}
					}
				],
				navigateFallbackDenylist: [/^\/api/, /^\/trpc/]
			}
		}),
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
