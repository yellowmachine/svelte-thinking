import { router } from './init';
import { healthRouter } from './routers/health';
import { projectsRouter } from './routers/projects';
import { documentsRouter } from './routers/documents';
import { commentsRouter } from './routers/comments';
import { invitationsRouter } from './routers/invitations';
import { usersRouter } from './routers/users';
import { photosRouter } from './routers/photos';
import { aiRouter } from './routers/ai';
import { aiConfigRouter } from './routers/aiConfig';
import { billingRouter } from './routers/billing';
import { datasetsRouter } from './routers/datasets';
import { referencesRouter } from './routers/references';
import { contextLinksRouter } from './routers/contextLinks';
import { feedbackRouter } from './routers/feedback';

export const appRouter = router({
	health: healthRouter,
	projects: projectsRouter,
	documents: documentsRouter,
	comments: commentsRouter,
	invitations: invitationsRouter,
	users: usersRouter,
	photos: photosRouter,
	ai: aiRouter,
	aiConfig: aiConfigRouter,
	billing: billingRouter,
	datasets: datasetsRouter,
	references: referencesRouter,
	contextLinks: contextLinksRouter,
	feedback: feedbackRouter
});

export type AppRouter = typeof appRouter;
