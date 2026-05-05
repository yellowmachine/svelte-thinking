import type { DriveStep } from 'driver.js';

export const networkTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="network-title"]',
		popover: {
			title: 'Network',
			description:
				'This is where you manage collaboration invitations — requests from other researchers to join their projects.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="network-invitations"]',
		popover: {
			title: 'Pending invitations',
			description:
				'Each invitation shows the project name, your assigned role, who sent it, and when it expires.',
			side: 'bottom'
		}
	},
	{
		element: '[data-tutorial="network-accept"]',
		popover: {
			title: 'Accept or decline',
			description:
				'Accept to join the project immediately and gain access to its documents, or Decline if it is not the right fit.',
			side: 'left'
		}
	}
];
