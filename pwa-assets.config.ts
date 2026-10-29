import { defineConfig, minimalPreset } from '@vite-pwa/assets-generator/config';

// Maskable and Apple icons get cropped by the OS, so they bleed the icon's brown
// to the edge instead of the default white padding.
const fullBleed = { padding: 0.1, resizeOptions: { background: '#7c5c3e' } };

export default defineConfig({
	preset: {
		...minimalPreset,
		maskable: { ...minimalPreset.maskable, ...fullBleed },
		apple: { ...minimalPreset.apple, ...fullBleed }
	},
	images: ['static/icon.svg']
});
