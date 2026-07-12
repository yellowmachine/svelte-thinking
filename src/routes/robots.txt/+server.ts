import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const body = `# allow crawling everything by default
User-agent: *
Disallow:

Sitemap: ${url.origin}/sitemap-blog.xml
`;

	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
