// Public, static, SEO-focused page with no client interactivity (the
// toolbar is plain <a> links) — skip hydration entirely. Ships pure
// server-rendered HTML with no framework runtime, no inline hydration
// payload duplicating the article content in a <script> tag, and no
// hydration marker comments — simpler output for any consumer, and a
// candidate fix for read-later services whose parser may choke on
// SvelteKit's hydration scaffolding.
export const csr = false;
