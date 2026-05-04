import type { DriveStep } from 'driver.js';

export const projectSearchTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="project-search-input"]',
		popover: {
			title: 'Semantic search',
			description:
				'Search across all committed documents in this project. Results are ranked by semantic similarity, not just keyword matching.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="project-search-results"]',
		popover: {
			title: 'Search results',
			description:
				'Each result shows the document title and a matching excerpt. Click to open the document at the relevant passage.',
			side: 'top'
		}
	}
];
