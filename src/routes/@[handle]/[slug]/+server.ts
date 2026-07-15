// EXPERIMENT (see memory: instapaper-parse-error-investigation): Instapaper's
// server-side fetcher fails to parse this route when it's a normal
// +page.svelte, even though every independently-verifiable technical avenue
// (HTML validity, headers, compression, TLS) checked out clean. The one
// untested remaining suspect is SvelteKit's own SSR scaffolding (hydration
// marker comments, the inline devalue'd `data` payload). This file replaces
// +page.svelte/+page.server.ts/+page.ts entirely for this route so the
// response is hand-built HTML with zero framework artifacts — no +layout,
// no hydration payload, no marker comments. If a fresh Instapaper attempt on
// this still fails, roll back to the +page.* version (see git history around
// this commit) — the failure is confirmed to be on Instapaper's end, not
// something fixable by changing our HTML further.
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userProfile } from '$lib/server/db/schemas/users.schema';
import { blogPost, blogPostComment } from '$lib/server/db/schemas/blog.schema';
import { excerptFromHtml } from '$lib/server/blogExcerpt';
import { runCommentModerationCheck } from '$lib/server/blogCommentModeration';
import proseCss from '$lib/styles/prose-content.css?raw';

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
const commentFmt = new Intl.DateTimeFormat('es', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

type Comment = {
	id: string;
	authorId: string;
	authorName: string;
	content: string;
	createdAt: Date;
};

type LoadedPost = {
	author: { userId: string; displayName: string | null; handle: string };
	post: {
		id: string;
		title: string;
		renderedHtml: string;
		slug: string;
		publishedAt: Date;
		commentsEnabled: boolean;
		commentsVisible: boolean;
	};
	description: string;
	comments: Comment[];
};

async function loadPost(handle: string, slug: string): Promise<LoadedPost> {
	const profileRows = await db
		.select({
			userId: userProfile.userId,
			displayName: userProfile.displayName,
			handle: userProfile.handle
		})
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);
	if (!profileRows[0]) error(404, 'Este blog no existe');
	const author = profileRows[0] as { userId: string; displayName: string | null; handle: string };

	const postRows = await db
		.select({
			id: blogPost.id,
			title: blogPost.title,
			renderedHtml: blogPost.renderedHtml,
			slug: blogPost.slug,
			publishedAt: blogPost.publishedAt,
			commentsEnabled: blogPost.commentsEnabled,
			commentsVisible: blogPost.commentsVisible
		})
		.from(blogPost)
		.where(and(eq(blogPost.userId, author.userId), eq(blogPost.slug, slug)))
		.limit(1);
	if (!postRows[0]) error(404, 'Esta publicación no existe');
	const post = postRows[0];

	const description =
		excerptFromHtml(post.renderedHtml, 160) ||
		`${post.title} — publicado por @${author.handle} en Scholio.`;

	const comments = await loadComments(post.id, post.commentsVisible);

	return { author, post, description, comments };
}

async function loadComments(blogPostId: string, commentsVisible: boolean): Promise<Comment[]> {
	if (!commentsVisible) return [];
	const rows = await db
		.select({
			id: blogPostComment.id,
			authorId: blogPostComment.authorId,
			authorName: sql<string>`(SELECT name FROM "user" WHERE "user".id = ${blogPostComment.authorId})`,
			content: blogPostComment.content,
			createdAt: blogPostComment.createdAt
		})
		.from(blogPostComment)
		.where(and(eq(blogPostComment.blogPostId, blogPostId), eq(blogPostComment.status, 'approved')))
		.orderBy(desc(blogPostComment.createdAt));
	return rows;
}

const PAGE_CSS = `
:root {
	--color-paper: #f9f7f4;
	--color-paper-ui: #f0ede8;
	--color-paper-border: #e8e2da;
	--color-ink: #1c1917;
	--color-ink-muted: #57534e;
	--color-ink-faint: #a8a29e;
	--color-accent: #7c5c3e;
	--color-accent-hover: #6b4f35;
	--font-sans: 'Inter', system-ui, sans-serif;
	--font-serif: 'Source Serif 4', Georgia, serif;
}
@media (prefers-color-scheme: dark) {
	:root {
		--color-paper: #1c1917;
		--color-paper-ui: #292524;
		--color-paper-border: #44403c;
		--color-ink: #f5f5f4;
		--color-ink-muted: #d6d3d1;
		--color-ink-faint: #78716c;
		--color-accent: #c9a583;
		--color-accent-hover: #dbbc9f;
	}
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--color-paper-ui);
	color: var(--color-ink);
	font-family: var(--font-sans);
	line-height: 1.6;
}
a { color: inherit; }
header.site {
	position: sticky;
	top: 0;
	border-bottom: 1px solid var(--color-paper-border);
	background: var(--color-paper);
}
header.site .bar {
	max-width: 42rem;
	margin: 0 auto;
	padding: 0.75rem 1.5rem;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}
header.site .brand {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-family: var(--font-serif);
	font-weight: 600;
	text-decoration: none;
}
header.site .logo {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1.75rem;
	height: 1.75rem;
	border-radius: 0.25rem;
	background: var(--color-accent);
	color: #fff;
	font-size: 0.75rem;
}
header.site nav a {
	margin-left: 0.5rem;
	padding: 0.375rem 0.75rem;
	border-radius: 0.375rem;
	font-size: 0.875rem;
	color: var(--color-ink-muted);
	text-decoration: none;
}
main {
	max-width: 42rem;
	margin: 0 auto;
	padding: 3rem 1.5rem;
}
.post-header {
	margin-bottom: 2rem;
	padding-bottom: 1.5rem;
	border-bottom: 1px solid var(--color-paper-border);
}
.post-header .author-link {
	font-size: 0.875rem;
	color: var(--color-ink-muted);
	text-decoration: underline dotted;
}
.post-header h1 {
	margin: 0.5rem 0 0;
	font-family: var(--font-serif);
	font-size: 1.875rem;
	font-weight: 600;
}
.post-meta {
	margin-top: 0.75rem;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 1rem;
}
.post-meta .date {
	font-size: 0.75rem;
	color: var(--color-ink-faint);
}
.post-meta .links {
	display: flex;
	gap: 0.75rem;
}
.post-meta .links a {
	font-size: 0.75rem;
	color: var(--color-ink-faint);
	text-decoration: none;
}
.post-meta .links a.icon-link {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
}
article.prose {
	font-family: var(--font-serif);
	font-size: 1.0625rem;
}
article.prose :is(h1, h2, h3, h4, h5, h6) {
	font-family: var(--font-serif);
	font-weight: 600;
	line-height: 1.3;
}
article.prose p, article.prose ul, article.prose ol, article.prose blockquote {
	margin: 1rem 0;
}
article.prose blockquote {
	margin-left: 0;
	padding-left: 1rem;
	border-left: 3px solid var(--color-paper-border);
	color: var(--color-ink-muted);
}
article.prose a { color: var(--color-accent); }
article.prose code {
	font-family: monospace;
	background: var(--color-paper-ui);
	padding: 0.125rem 0.3rem;
	border-radius: 0.25rem;
	font-size: 0.9em;
}
article.prose pre {
	background: var(--color-paper-ui);
	padding: 1rem;
	border-radius: 0.5rem;
	overflow-x: auto;
}
article.prose pre code { background: none; padding: 0; }
.comments-section {
	margin-top: 4rem;
	padding-top: 2rem;
	border-top: 1px solid var(--color-paper-border);
}
.comments-section h2 {
	font-family: var(--font-serif);
	font-size: 1.125rem;
	font-weight: 600;
	margin: 0;
}
.comment-form textarea {
	width: 100%;
	border: 1px solid var(--color-paper-border);
	background: var(--color-paper-ui);
	color: var(--color-ink);
	border-radius: 0.375rem;
	padding: 0.5rem 0.75rem;
	font-family: var(--font-sans);
	font-size: 0.875rem;
	resize: vertical;
}
.comment-form button {
	margin-top: 0.5rem;
	border: none;
	border-radius: 0.375rem;
	background: var(--color-accent);
	color: #fff;
	padding: 0.5rem 1rem;
	font-family: var(--font-sans);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
}
.comment-form button:hover { background: var(--color-accent-hover); }
.notice {
	margin-top: 0.75rem;
	font-size: 0.875rem;
}
.notice.pending { color: var(--color-ink-muted); }
.notice.error { color: #dc2626; }
ul.comment-list {
	list-style: none;
	margin: 1.5rem 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}
ul.comment-list li {
	border-bottom: 1px solid var(--color-paper-border);
	padding-bottom: 1rem;
}
ul.comment-list .meta {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
}
ul.comment-list .author {
	font-size: 0.875rem;
	font-weight: 500;
}
ul.comment-list .when {
	font-size: 0.75rem;
	color: var(--color-ink-faint);
}
ul.comment-list p {
	margin: 0.25rem 0 0;
	font-size: 0.875rem;
	color: var(--color-ink-muted);
	white-space: pre-wrap;
}
footer.site {
	margin-top: 4rem;
	padding: 3rem 1.5rem;
	border-top: 1px solid var(--color-paper-border);
	background: var(--color-paper-ui);
	text-align: center;
}
footer.site p {
	font-size: 0.875rem;
	color: var(--color-ink-muted);
}
${proseCss}
`;

function renderPage(
	data: LoadedPost & { canonicalUrl: string; currentUserId: string | null; notice: string | null }
): string {
	const { author, post, description, comments, canonicalUrl, currentUserId, notice } = data;
	const handle = escapeHtml(author.handle);
	const title = escapeHtml(post.title);
	const authorDisplay = escapeHtml(author.displayName ?? `@${author.handle}`);
	const desc = escapeHtml(description);
	const pdfUrl = `/@${encodeURIComponent(author.handle)}/${encodeURIComponent(post.slug)}/pdf`;
	const instapaperUrl = `https://www.instapaper.com/hello2?url=${encodeURIComponent(canonicalUrl)}&title=${encodeURIComponent(post.title)}`;
	const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(canonicalUrl)}&text=${encodeURIComponent(post.title)}`;

	const noticeHtml =
		notice === 'pending'
			? '<p class="notice pending">Tu comentario se ha enviado y está pendiente de moderación.</p>'
			: notice === 'empty'
				? '<p class="notice error">Escribe algo antes de enviar.</p>'
				: '';

	const commentsHtml = comments.length
		? `<ul class="comment-list">${comments
				.map(
					(c) => `
			<li>
				<div class="meta">
					<span class="author">${escapeHtml(c.authorName)}</span>
					<span class="when">${commentFmt.format(new Date(c.createdAt))}</span>
				</div>
				<p>${escapeHtml(c.content)}</p>
			</li>`
				)
				.join('')}</ul>`
		: '';

	const commentFormHtml = post.commentsEnabled
		? currentUserId
			? `
			<form class="comment-form" method="POST">
				<textarea name="content" rows="3" maxlength="5000" required placeholder="Escribe un comentario..."></textarea>
				${noticeHtml}
				<button type="submit">Comentar</button>
			</form>`
			: `<p class="notice"><a href="/login">Inicia sesión</a> para comentar.</p>`
		: '';

	const commentsSection =
		post.commentsEnabled || comments.length > 0
			? `
		<section class="comments-section">
			<h2>Comentarios${comments.length ? ` (${comments.length})` : ''}</h2>
			${commentFormHtml}
			${commentsHtml}
		</section>`
			: '';

	return `<!doctype html>
<html lang="es">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${title} — ${authorDisplay}</title>
	<meta name="description" content="${desc}" />
	<meta property="og:type" content="article" />
	<meta property="og:title" content="${title}" />
	<meta property="og:description" content="${desc}" />
	<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="${title}" />
	<meta name="twitter:description" content="${desc}" />
	<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet" />
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.39/dist/katex.min.css" />
	<style>${PAGE_CSS}</style>
</head>
<body>
	<header class="site">
		<div class="bar">
			<a class="brand" href="/">
				<span class="logo">S</span>
				Scholio
			</a>
			<nav>
				<a href="/blogs">Blogs</a>
				<a href="/login">Sign in</a>
			</nav>
		</div>
	</header>
	<main>
		<div class="post-header">
			<a class="author-link" href="/@${handle}">@${handle}</a>
			<h1>${title}</h1>
			<div class="post-meta">
				<span class="date">${dateFmt.format(new Date(post.publishedAt))}</span>
				<span class="links">
					<a href="${pdfUrl}">PDF</a>
					<a href="${instapaperUrl}" target="_blank" rel="noopener noreferrer" title="Guardar en Instapaper" aria-label="Guardar en Instapaper" class="icon-link"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>Instapaper</a>
					<a href="${twitterUrl}" target="_blank" rel="noopener noreferrer">X</a>
				</span>
			</div>
		</div>
		<article class="prose">${post.renderedHtml}</article>
		${commentsSection}
	</main>
	<footer class="site">
		<p>Publicado con <a href="/">Scholio</a>.</p>
	</footer>
</body>
</html>`;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const loaded = await loadPost(params.handle.toLowerCase(), params.slug);
	const html = renderPage({
		...loaded,
		canonicalUrl: url.origin + url.pathname,
		currentUserId: locals.user?.id ?? null,
		notice: url.searchParams.get('notice')
	});
	return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	if (!locals.user) error(401, 'Debes iniciar sesión para comentar.');

	const handle = params.handle.toLowerCase();
	const profileRows = await db
		.select({ userId: userProfile.userId })
		.from(userProfile)
		.where(eq(userProfile.handle, handle))
		.limit(1);
	if (!profileRows[0]) error(404, 'Este blog no existe');

	const postRows = await db
		.select({ id: blogPost.id, commentsEnabled: blogPost.commentsEnabled })
		.from(blogPost)
		.where(and(eq(blogPost.userId, profileRows[0].userId), eq(blogPost.slug, params.slug)))
		.limit(1);
	if (!postRows[0]) error(404, 'Esta publicación no existe');
	const post = postRows[0];

	const form = await request.formData();
	const content = (form.get('content')?.toString() ?? '').trim();
	if (!content) redirect(303, `${url.pathname}?notice=empty`);
	if (!post.commentsEnabled) {
		error(403, 'Los comentarios están desactivados en esta publicación.');
	}

	const check = await runCommentModerationCheck(locals.withRLS, db, locals.user.id, content);

	await locals.withRLS((tx) =>
		tx.insert(blogPostComment).values({
			id: crypto.randomUUID(),
			blogPostId: post.id,
			authorId: locals.user!.id,
			content,
			aiFlagged: check?.flagged ?? false,
			aiReason: check?.reason ?? null
		})
	);

	redirect(303, `${url.pathname}?notice=pending`);
};
