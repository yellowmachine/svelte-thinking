import type { DriveStep } from 'driver.js';

export const projectIssuesTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="project-issues-title"]',
		popover: {
			title: 'Issues',
			description:
				'Track tasks, ideas, and open questions for your project. Issues can have a status and priority to keep work organized.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="project-issues-new"]',
		popover: {
			title: 'Create an issue',
			description:
				'Click here to quickly open a new issue. You can set the title, priority, and description in the detail view.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="project-issues-tabs"]',
		popover: {
			title: 'Filter by status',
			description:
				'Switch between All, Open, In progress, and Closed to focus on what matters right now.',
			side: 'bottom'
		}
	}
];
