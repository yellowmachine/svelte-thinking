import '../src/routes/layout.css';
import type { Preview } from '@storybook/sveltekit';

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},
		backgrounds: {
			default: 'paper',
			values: [
				{ name: 'paper', value: '#F9F7F4' },
				{ name: 'paper-ui', value: '#F0EDE8' },
				{ name: 'dark', value: '#1A1917' }
			]
		},
		a11y: { test: 'todo' }
	}
};

export default preview;
