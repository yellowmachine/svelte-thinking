import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';

Sentry.init({
	dsn: env.SENTRY_DSN,
	enabled: !!env.SENTRY_DSN,
	tracesSampleRate: 1.0,
	environment: env.NODE_ENV ?? 'development'
});
