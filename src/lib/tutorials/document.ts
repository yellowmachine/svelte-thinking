import type { DriveStep } from 'driver.js';

/**
 * The only onboarding tour: the editor, where what matters (the syntax, the side rail) is not
 * visible at a glance. Shown once, on desktop; replayable from /help#editor.
 */
export const documentTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="doc-editor-area"]',
		popover: {
			title: 'Write in Markdown',
			description:
				'<code>## Heading</code> for structure, <code>[[@key]]</code> to cite a reference (start typing for suggestions), <code>$x^2$</code> for math and <code>[[Document title]]</code> to link another document of the project.',
			side: 'right',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="doc-toolbar"]',
		popover: {
			title: 'Toolbar',
			description:
				'Switch between editor, split and preview, insert citations and diagrams. Share and save are on the right.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="doc-side-rail"]',
		popover: {
			title: 'Side panels',
			description:
				'Comments, subnotes, bibliography, version history and the AI assistant. One panel at a time: click an icon to open it, again to close it.',
			side: 'left',
			align: 'start'
		}
	},
	{
		popover: {
			title: 'More in Help',
			description:
				'The full syntax — footnotes, callouts, charts, exports — is in Help, where you can also replay this tour.'
		}
	}
];
