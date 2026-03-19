import { router } from './init';
import { healthRouter } from './routers/health';
import { projectsRouter } from './routers/projects';
import { documentsRouter } from './routers/documents';
import { commentsRouter } from './routers/comments';
import { invitationsRouter } from './routers/invitations';
import { usersRouter } from './routers/users';

export const appRouter = router({
	health: healthRouter,
	projects: projectsRouter,
	documents: documentsRouter,
	comments: commentsRouter,
	invitations: invitationsRouter,
	users: usersRouter
});

export type AppRouter = typeof appRouter;
