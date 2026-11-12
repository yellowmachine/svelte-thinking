import { sendMail } from '$lib/server/mailer';

export async function sendOrgInvitation({
	to,
	inviterName,
	orgName,
	token,
	origin
}: {
	to: string;
	inviterName: string;
	orgName: string;
	token: string;
	origin: string;
}) {
	const link = `${origin}/org-invitations/${token}`;

	await sendMail({
		to,
		subject: `${inviterName} invited you to join "${orgName}" on Scholio`,
		html: `
			<p>Hello,</p>
			<p><strong>${inviterName}</strong> has invited you to join the organization <strong>"${orgName}"</strong> on Scholio.</p>
			<p><a href="${link}">Accept invitation</a></p>
			<p>This link expires in 7 days.</p>
		`
	});
}

export async function sendProjectInvitation({
	to,
	inviterName,
	projectTitle,
	role,
	token,
	origin
}: {
	to: string;
	inviterName: string;
	projectTitle: string;
	role: string;
	token: string;
	origin: string;
}) {
	const link = `${origin}/invitations/${token}`;

	await sendMail({
		to,
		subject: `${inviterName} invited you to collaborate on "${projectTitle}" on Scholio`,
		html: `
			<p>Hello,</p>
			<p><strong>${inviterName}</strong> has invited you to collaborate on the project <strong>"${projectTitle}"</strong> on Scholio as <strong>${role}</strong>.</p>
			<p><a href="${link}">Accept invitation</a></p>
			<p>This link expires in 7 days.</p>
		`
	});
}
