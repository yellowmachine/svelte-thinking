import type { PageServerLoad } from './$types';

interface PostMeta {
	title: string;
	date: string;
	slug: string;
	summary: string;
}

export const load: PageServerLoad = async () => {
	const modules = import.meta.glob<{ metadata: PostMeta }>('/src/posts/*.md', { eager: true });

	const posts = Object.values(modules)
		.map((mod) => mod.metadata)
		.filter((m): m is PostMeta => !!m?.slug)
		.sort((a, b) => (a.date < b.date ? 1 : -1));

	return { posts };
};
