import type { ComponentType } from 'svelte';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

interface PostMeta {
	title: string;
	date: string;
	slug: string;
	summary: string;
}

export const load: PageLoad = async ({ params }) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const modules = import.meta.glob<{ default: ComponentType; metadata: PostMeta }>('/src/posts/*.md');

	const entry = Object.entries(modules).find(([path]) => {
		const filename = path.split('/').at(-1)!;
		// Match slug from filename like "2026-03-21-bienvenida.md"
		const slug = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
		return slug === params.slug;
	});

	if (!entry) {
		error(404, 'Post no encontrado');
	}

	const mod = await entry[1]();
	return {
		content: mod.default,
		meta: mod.metadata
	};
};
