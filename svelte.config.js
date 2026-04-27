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
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
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
