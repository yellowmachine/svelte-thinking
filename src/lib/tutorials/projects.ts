import type { DriveStep } from 'driver.js';

export const projectsTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="projects-title"]',
		popover: {
			title: 'Your projects',
			description:
				'This is where all your research projects live. Each project can contain documents, bibliography, collaborators, and more.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="new-project-btn"]',
		popover: {
			title: 'Create a project',
			description:
				'Start a new research project here. You can add a title and optional description to get started.',
			side: 'bottom',
			align: 'end'
		}
	},
	{
		element: '[data-tutorial="import-btn"]',
		popover: {
			title: 'Import a project',
			description:
				'Already have a <code>.scholio</code> export? Import it here to restore all your work.',
			side: 'bottom',
			align: 'end'
		}
	}
];
