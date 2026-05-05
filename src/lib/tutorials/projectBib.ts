import type { DriveStep } from 'driver.js';

export const projectBibTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="project-bib-title"]',
		popover: {
			title: 'Project bibliography',
			description:
				'Manage all references for this project. References added here are scoped to this project and available for in-text citation.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="project-bib-doi"]',
		popover: {
			title: 'DOI lookup',
			description:
				'Paste a DOI and Scholio fetches the full metadata automatically — title, authors, journal, year, and more.',
			side: 'bottom',
			align: 'end'
		}
	},
	{
		element: '[data-tutorial="project-bib-url"]',
		popover: {
			title: 'URL → AI',
			description:
				'Point to a web page, preprint, or blog post and the AI extracts the bibliographic metadata for you.',
			side: 'bottom',
			align: 'end'
		}
	},
	{
		element: '[data-tutorial="project-bib-import"]',
		popover: {
			title: 'Import .bib',
			description: 'Paste or upload a BibTeX file to bulk-import references in one go.',
			side: 'bottom',
			align: 'end'
		}
	},
	{
		element: '[data-tutorial="project-bib-new"]',
		popover: {
			title: 'Manual entry',
			description: 'Add a reference by hand if you prefer to fill in each field yourself.',
			side: 'bottom',
			align: 'end'
		}
	}
];
