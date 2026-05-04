import type { DriveStep } from 'driver.js';

export const projectReviewTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="project-review-title"]',
		popover: {
			title: 'Open comments',
			description:
				'This page collects all unresolved comment threads across every document in the project — your central review inbox.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="project-review-thread"]',
		popover: {
			title: 'Comment thread',
			description:
				"Each card shows the highlighted passage, the author's comment, and any replies.",
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="project-review-resolve"]',
		popover: {
			title: 'Resolve a thread',
			description:
				'Click Resolve to close a thread once the feedback has been addressed. Resolved threads are hidden from this view.',
			side: 'left'
		}
	}
];
