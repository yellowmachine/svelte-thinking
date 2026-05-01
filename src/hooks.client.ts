import * as Sentry from '@sentry/sveltekit';

const PUBLIC_SENTRY_DSN = import.meta.env.PUBLIC_SENTRY_DSN;

Sentry.init({
	dsn: PUBLIC_SENTRY_DSN,
	enabled: !!PUBLIC_SENTRY_DSN,
	tracesSampleRate: 1.0,
	replaysSessionSampleRate: 0.1,
	replaysOnErrorSampleRate: 1.0,
	integrations: [Sentry.replayIntegration()]
});

export const handleError = Sentry.handleErrorWithSentry();
