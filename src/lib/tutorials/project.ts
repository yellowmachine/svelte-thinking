import type { DriveStep } from 'driver.js';

export const projectTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="project-title"]',
		popover: {
			title: 'Project title',
			description: 'This is your project. If you are the owner, click the title to rename it.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="project-docs-section"]',
		popover: {
			title: 'Documents',
			description:
				'All your documents live here — articles, notes, outlines, bibliography, and more. Sort them by date or alphabetically.',
			side: 'top',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="project-new-doc"]',
		popover: {
			title: 'Create a document',
			description:
				'Click here to create a new document. Choose its type: article, notes, outline, and more.',
			side: 'bottom',
			align: 'end'
		}
	},
	{
		element: '[data-tutorial="project-sidebar"]',
		popover: {
			title: 'Project sidebar',
			description:
				'The sidebar shows collaborators, bibliography, requirements, and project settings like status and citation style.',
			side: 'left',
			align: 'start'
		}
	}
];
