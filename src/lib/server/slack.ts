import { env } from '$env/dynamic/private';

type SlackEvent =
	| { type: 'waitlist_signup'; name: string; email: string }
	| { type: 'waitlist_approved'; name: string; email: string }
	| { type: 'waitlist_rejected'; name: string; email: string }
	| { type: 'feedback'; user: string | null; message: string }
	| { type: 'error'; route: string; message: string; stack?: string };

function format(event: SlackEvent): string {
	switch (event.type) {
		case 'waitlist_signup':
			return `📋 *New waitlist signup*\n*Name:* ${event.name}\n*Email:* ${event.email}`;
		case 'waitlist_approved':
			return `✅ *Waitlist approved*\n*Name:* ${event.name}\n*Email:* ${event.email}`;
		case 'waitlist_rejected':
			return `❌ *Waitlist rejected*\n*Name:* ${event.name}\n*Email:* ${event.email}`;
		case 'feedback':
			return `💬 *Feedback received*${event.user ? `\n*From:* ${event.user}` : ''}\n*Message:* ${event.message.slice(0, 300)}${event.message.length > 300 ? '…' : ''}`;
		case 'error':
			return `🚨 *Unexpected error*\n*Route:* ${event.route}\n*Error:* ${event.message}${event.stack ? `\n\`\`\`${event.stack.slice(0, 500)}\`\`\`` : ''}`;
	}
}

export async function notifySlack(event: SlackEvent): Promise<void> {
	if (!env.SLACK_WEBHOOK_URL) return;
	try {
		await fetch(env.SLACK_WEBHOOK_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: format(event) })
		});
	} catch {
		// Never block the main request
	}
}
