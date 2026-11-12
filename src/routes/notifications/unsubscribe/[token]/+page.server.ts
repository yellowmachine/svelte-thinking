import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { unsubscribeByToken } from '$lib/server/definerFunctions';
import type { PageServerLoad } from './$types';

// Opened from an email, usually without a session: RLS hides every
// notification_preference row here, so the token goes through
// scholio.unsubscribe_by_token, which only touches the row it names.
export const load: PageServerLoad = async ({ params }) => {
	const result = await unsubscribeByToken(db, params.token);
	if (result === 'invalid') error(404, 'Invalid link');
	return { alreadyUnsubscribed: result === 'already' };
};
