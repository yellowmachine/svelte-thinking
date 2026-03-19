import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

export async function sendVerificationEmail(email: string, url: string) {
	if (!env.RESEND_API_KEY) {
		console.log(`[dev] Verification URL for ${email}: ${url}`);
		return;
	}

	const resend = new Resend(env.RESEND_API_KEY);
	const from = env.EMAIL_FROM || 'Scholio <noreply@scholio.tech>';

	await resend.emails.send({
		from,
		to: email,
		subject: 'Confirma tu cuenta en Scholio',
		html: `
			<p>Hola,</p>
			<p>Haz clic en el siguiente enlace para confirmar tu cuenta:</p>
			<p><a href="${url}">${url}</a></p>
			<p>El enlace expira en 24 horas.</p>
		`
	});
}
