import { mdsvex } from 'mdsvex';
import adapter from 'svelte-adapter-bun';

// mdsvex 0.12.x still emits `<script context="module">` which Svelte 5 rejects.
// This preprocessor rewrites it to `<script module>` after mdsvex runs.
const fixModuleScript = {
	markup({ content }) {
		return { code: content.replace(/<script\s+context="module"(\s*)/g, '<script module$1') };
	}
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Bun server (build/index.js), run by the Docker image.
		adapter: adapter()
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	},
	preprocess: [mdsvex({ extensions: ['.svx', '.md'] }), fixModuleScript],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
