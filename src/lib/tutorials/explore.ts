import type { DriveStep } from 'driver.js';

export const exploreTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="explore-title"]',
		popover: {
			title: 'Explore',
			description:
				'Browse open research projects and find potential collaborators across the platform.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="explore-tabs"]',
		popover: {
			title: 'Projects or researchers',
			description:
				'Switch between searching for open projects by topic or finding researchers by their academic specialty.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="explore-search"]',
		popover: {
			title: 'Semantic search',
			description:
				'Type a topic or specialty — results are ranked by semantic similarity, not just keywords. Use "Ver todos" to browse all public projects.',
			side: 'bottom'
		}
	}
];
