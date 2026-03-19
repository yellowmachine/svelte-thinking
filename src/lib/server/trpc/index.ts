import { router } from './init';
import { healthRouter } from './routers/health';
import { projectsRouter } from './routers/projects';
import { documentsRouter } from './routers/documents';
import { commentsRouter } from './routers/comments';
import { invitationsRouter } from './routers/invitations';
import { usersRouter } from './routers/users';
import { photosRouter } from './routers/photos';

export const appRouter = router({
	health: healthRouter,
	projects: projectsRouter,
	documents: documentsRouter,
	comments: commentsRouter,
	invitations: invitationsRouter,
	users: usersRouter,
	photos: photosRouter
});

export type AppRouter = typeof appRouter;
