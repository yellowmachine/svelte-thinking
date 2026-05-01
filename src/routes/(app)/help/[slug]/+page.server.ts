import { error } from '@sveltejs/kit';
import { getSampleBySlug } from '$lib/server/sampleDocs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const sample = getSampleBySlug(params.slug);
	if (!sample) error(404, 'Help page not found');
	return { sample };
};
