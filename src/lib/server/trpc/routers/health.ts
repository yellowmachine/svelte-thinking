import { publicProcedure, router } from '../init';

export const healthRouter = router({
	ping: publicProcedure.query(() => ({ status: 'ok' }))
});
