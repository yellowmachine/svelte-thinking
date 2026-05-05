import type { DriveStep } from 'driver.js';

export const documentTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="doc-breadcrumb"]',
		popover: {
			title: 'Navigation',
			description: 'Click the project name to go back. The document title is shown here too.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="doc-toolbar"]',
		popover: {
			title: 'Toolbar',
			description:
				'Save your draft, open the Bibliography panel, review Comments, run AI tools, and switch between editor / split / preview modes — all from here.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="doc-editor-area"]',
		popover: {
			title: 'Editor',
			description:
				'Write in Markdown. Use <code>## Heading</code> for structure, <code>[[@cite-key]]</code> for citations, and <code>%%annotation%%</code> for inline notes.',
			side: 'right',
			align: 'start'
		}
	}
];
