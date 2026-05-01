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
import { datasetsRouter } from './routers/datasets';
import { referencesRouter } from './routers/references';
import { contextLinksRouter } from './routers/contextLinks';
import { feedbackRouter } from './routers/feedback';
import { requirementsRouter } from './routers/requirements';
import { discoverRouter } from './routers/discover';
import { jupyterRouter } from './routers/jupyter';
import { orgsRouter } from './routers/orgs';
import { s3ConfigRouter } from './routers/s3Config';
import { usageRouter } from './routers/usage';
import { versionSharesRouter } from './routers/versionShares';
import { notificationsRouter } from './routers/notifications';
import { issuesRouter } from './routers/issues';
import { tagsRouter } from './routers/tags';

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
	datasets: datasetsRouter,
	references: referencesRouter,
	contextLinks: contextLinksRouter,
	feedback: feedbackRouter,
	requirements: requirementsRouter,
	discover: discoverRouter,
	jupyter: jupyterRouter,
	orgs: orgsRouter,
	s3Config: s3ConfigRouter,
	usage: usageRouter,
	versionShares: versionSharesRouter,
	notifications: notificationsRouter,
	issues: issuesRouter,
	tags: tagsRouter
});

export type AppRouter = typeof appRouter;
