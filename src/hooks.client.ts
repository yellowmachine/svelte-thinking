import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

// Read at runtime (not baked into the build): the GHCR image is built without it.
const PUBLIC_SENTRY_DSN = env.PUBLIC_SENTRY_DSN;

Sentry.init({
	dsn: PUBLIC_SENTRY_DSN,
	enabled: !!PUBLIC_SENTRY_DSN,
	tracesSampleRate: 0.2,
	replaysSessionSampleRate: 0.1,
	replaysOnErrorSampleRate: 1.0,
	integrations: [Sentry.replayIntegration()]
});

export const handleError = Sentry.handleErrorWithSentry();
