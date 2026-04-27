/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();


// /offline route must be registered BEFORE precacheAndRoute so our NetworkFirst
// handler takes precedence over the precache route (Workbox checks routes in
// registration order). Without this, navigating to /offline while online serves
// stale precached HTML whose chunk hashes no longer exist after a rebuild.
registerRoute(
	({ request, url }) => request.mode === 'navigate' && url.pathname === '/offline',
	new NetworkFirst({
		cacheName: 'html-cache',
		networkTimeoutSeconds: 3,
		plugins: [new CacheableResponsePlugin({ statuses: [200] })]
	})
);

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigate: NetworkFirst — cache pages as they are visited so they work offline
registerRoute(
	({ request }) => request.mode === 'navigate',
	new NetworkFirst({
		cacheName: 'html-cache',
		networkTimeoutSeconds: 3,
		plugins: [new CacheableResponsePlugin({ statuses: [200] })]
	})
);

// SvelteKit __data.json (client-side navigation payload)
// matchOptions.ignoreSearch: SvelteKit appends ?x-sveltekit-invalidated=... which changes
// on every navigation — ignoring search params ensures offline cache hits still work.
registerRoute(
	({ url }) => url.pathname.endsWith('/__data.json'),
	new NetworkFirst({
		cacheName: 'sveltekit-data-cache',
		networkTimeoutSeconds: 3,
		matchOptions: { ignoreSearch: true },
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })
		]
	})
);

// tRPC queries for documents and projects
registerRoute(
	({ url }) =>
		url.pathname.startsWith('/api/trpc/documents.') ||
		url.pathname.startsWith('/api/trpc/projects.'),
	new NetworkFirst({
		cacheName: 'trpc-data-cache',
		networkTimeoutSeconds: 5,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 })
		]
	})
);

// Auth session
registerRoute(
	({ url }) => url.pathname === '/api/auth/session',
	new NetworkFirst({
		cacheName: 'auth-session-cache',
		networkTimeoutSeconds: 5,
		plugins: [
			new CacheableResponsePlugin({ statuses: [200] }),
			new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 })
		]
	})
);

// Fallback: when a navigate request fails (offline + not cached), serve /offline
// /offline is precached via additionalManifestEntries so it's always available
setCatchHandler(async ({ event }) => {
	const req = (event as FetchEvent).request;
	if (req.mode === 'navigate') {
		const cached = await caches.match('/offline');
		return cached ?? Response.error();
	}
	return Response.error();
});
