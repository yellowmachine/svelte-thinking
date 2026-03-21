import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

export async function sendWaitlistApprovalEmail({
	to,
	name,
	registrationUrl
}: {
	to: string;
	name: string;
	registrationUrl: string;
}) {
	if (!env.RESEND_API_KEY) {
		console.log(`[dev] Waitlist approval for ${to}: ${registrationUrl}`);
		return;
	}

	const resend = new Resend(env.RESEND_API_KEY);
	const from = env.EMAIL_FROM || 'Scholio <noreply@scholio.tech>';

	await resend.emails.send({
		from,
		to,
		subject: 'Bienvenido/a a Scholio — tu acceso está listo',
		html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f9f7;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e8e6e0;">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a18;padding:32px 40px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#f5f3ee;letter-spacing:0.02em;">Scholio</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Hola ${name},
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Gracias por unirte a la beta de Scholio. Tu solicitud ha sido aceptada y nos alegra mucho tenerte en esta primera comunidad de usuarios.
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Scholio es una plataforma de escritura académica colaborativa: editor Markdown con citas, control de versiones, colaboración con roles, exportación a LaTeX y Typst, y un asistente IA que entiende el contexto de tu investigación.
            </p>
            <p style="margin:0 0 32px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Estamos en una fase muy temprana y tu opinión importa de verdad. Si algo no funciona como esperas, o si tienes una idea, escríbenos directamente respondiendo a este correo.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:6px;background:#1a1a18;">
                  <a href="${registrationUrl}"
                     style="display:inline-block;padding:14px 28px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;font-weight:600;color:#f5f3ee;text-decoration:none;letter-spacing:0.01em;">
                    Crear mi cuenta →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:13px;color:#8a8880;">
              Este enlace es personal e intransferible. Expira en 7 días.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #e8e6e0;">
            <p style="margin:0;font-size:13px;color:#8a8880;line-height:1.6;">
              Scholio · Software libre para escritura académica<br>
              <a href="https://scholio.review" style="color:#8a8880;">scholio.review</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
		`
	});
}

export async function sendNewCommentNotification({
	to,
	authorName,
	documentTitle,
	projectTitle,
	commentExcerpt,
	documentUrl,
	unsubscribeUrl
}: {
	to: string;
	authorName: string;
	documentTitle: string;
	projectTitle: string;
	commentExcerpt: string;
	documentUrl: string;
	unsubscribeUrl: string;
}) {
	if (!env.RESEND_API_KEY) {
		console.log(`[dev] New comment notification for ${to}: ${documentUrl}`);
		return;
	}

	const resend = new Resend(env.RESEND_API_KEY);
	const from = env.EMAIL_FROM || 'Scholio <noreply@scholio.tech>';

	await resend.emails.send({
		from,
		to,
		subject: `Nuevo comentario en "${documentTitle}"`,
		html: `
			<p>Hola,</p>
			<p><strong>${authorName}</strong> ha dejado un comentario en <strong>"${documentTitle}"</strong> (${projectTitle}):</p>
			<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 16px 0;">
				${commentExcerpt}
			</blockquote>
			<p><a href="${documentUrl}">Ver el documento</a></p>
			<p style="margin-top: 32px; font-size: 12px; color: #999;">
				<a href="${unsubscribeUrl}" style="color: #999;">Silenciar notificaciones de este proyecto</a>
			</p>
		`
	});
}

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
