import { createTRPCClient, httpBatchLink, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import superjson from 'superjson';
import type { AppRouter } from '$lib/server/trpc';
import { notifyAiUsed } from '$lib/utils/aiUsedEvent';

// Procedures that call a model (and so log AI usage), besides every ai.* mutation.
const SPENDS_AI = new Set([
	'requirements.generate',
	'references.fetchUrl',
	'documents.commit', // the document summary, in the background
	'projects.createFromSample', // same, for each sample document
	'blogComments.create' // the optional moderation pre-check
]);

const spendsAi = (path: string, type: string) =>
	(type === 'mutation' && path.startsWith('ai.')) || SPENDS_AI.has(path);

/** Tells the spending banner (if shown) that a call that spends AI credit just finished. */
const aiUsedLink: TRPCLink<AppRouter> = () => {
	return ({ op, next }) =>
		observable((observer) =>
			next(op).subscribe({
				next: (value) => observer.next(value),
				error: (err) => observer.error(err),
				complete: () => {
					if (spendsAi(op.path, op.type)) notifyAiUsed();
					observer.complete();
				}
			})
		);
};

export const trpc = createTRPCClient<AppRouter>({
	links: [
		aiUsedLink,
		httpBatchLink({
			url: '/api/trpc',
			transformer: superjson
		})
	]
});
