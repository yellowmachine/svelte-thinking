import type { DriveStep } from 'driver.js';

export const bibTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="bib-title"]',
		popover: {
			title: 'Global bibliography',
			description:
				'All references from all your projects in one place. Each project has its own bibliography too, accessible from the project sidebar.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="bib-search"]',
		popover: {
			title: 'Search references',
			description: 'Filter by title, author, cite key, project, year, journal, or book title.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="bib-import"]',
		popover: {
			title: 'Import .bib',
			description:
				'Paste a BibTeX file to bulk-import references. Duplicates are detected automatically.',
			side: 'bottom',
			align: 'end'
		}
	}
];
