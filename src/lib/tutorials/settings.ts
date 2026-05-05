import type { DriveStep } from 'driver.js';

export const settingsTutorialSteps: DriveStep[] = [
	{
		element: '[data-tutorial="settings-title"]',
		popover: {
			title: 'Settings',
			description: 'Manage your account, preferences, and integrations from here.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="settings-tabs"]',
		popover: {
			title: 'Sections',
			description:
				'Profile, AI Assistant, Security, Appearance, Organizations, and Storage — each tab covers a different area of your account.',
			side: 'bottom',
			align: 'start'
		}
	},
	{
		element: '[data-tutorial="settings-ai-tab"]',
		popover: {
			title: 'AI Assistant',
			description:
				'Add your AI API key here to unlock writing assistance, draft generation, review, and citation tools in your documents.',
			side: 'bottom',
			align: 'start'
		}
	}
];
