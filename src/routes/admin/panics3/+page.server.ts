import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { users: [], totalUsedBytes: 0, quotaBytes: 0 };
};
