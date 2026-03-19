import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

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
	const resend = new Resend(env.RESEND_API_KEY);

	await resend.emails.send({
		from: env.EMAIL_FROM ?? 'noreply@yourdomain.com',
		to,
		subject: `${inviterName} te invitó a colaborar en "${projectTitle}"`,
		html: `
			<p>Hola,</p>
			<p><strong>${inviterName}</strong> te ha invitado a colaborar en el proyecto <strong>"${projectTitle}"</strong> como <strong>${role}</strong>.</p>
			<p><a href="${link}">Aceptar invitación</a></p>
			<p>Este enlace expira en 7 días.</p>
		`
	});
}
