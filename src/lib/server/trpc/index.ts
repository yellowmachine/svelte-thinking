import { router } from './init';
import { healthRouter } from './routers/health';
import { projectsRouter } from './routers/projects';
import { documentsRouter } from './routers/documents';
import { commentsRouter } from './routers/comments';
import { invitationsRouter } from './routers/invitations';
import { usersRouter } from './routers/users';
import { photosRouter } from './routers/photos';
import { aiRouter } from './routers/ai';
import { billingRouter } from './routers/billing';

export const appRouter = router({
	health: healthRouter,
	projects: projectsRouter,
	documents: documentsRouter,
	comments: commentsRouter,
	invitations: invitationsRouter,
	users: usersRouter,
	photos: photosRouter,
	ai: aiRouter,
	billing: billingRouter
});

export type AppRouter = typeof appRouter;
