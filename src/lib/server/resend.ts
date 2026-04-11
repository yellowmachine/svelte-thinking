/**
 * Transactional email functions — previously backed by Resend, now SMTP via mailer.ts.
 * Export signatures are unchanged so callers need no modification.
 */

import { sendMail } from './mailer';

export async function sendWaitlistWelcomeEmail({ to, name }: { to: string; name: string }) {
	await sendMail({
		to,
		subject: 'We received your Scholio request',
		html: `
<!DOCTYPE html>
<html lang="en">
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
              Hi ${name},
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Thank you for your interest in Scholio. We have received your request and will review it shortly.
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              You will receive another email once your access has been approved — no action is needed from you right now.
            </p>
            <p style="margin:0;font-size:16px;color:#2a2a26;line-height:1.6;">
              If you have any questions in the meantime, feel free to reply to this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #e8e6e0;">
            <p style="margin:0;font-size:13px;color:#8a8880;line-height:1.6;">
              Scholio · Open source academic writing platform<br>
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

export async function sendWaitlistApprovalEmail({
	to,
	name,
	registrationUrl
}: {
	to: string;
	name: string;
	registrationUrl: string;
}) {
	await sendMail({
		to,
		subject: 'Welcome to Scholio — your access is ready',
		html: `
<!DOCTYPE html>
<html lang="en">
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
              Hi ${name},
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Thank you for joining the Scholio beta. Your request has been accepted and we are glad to have you in this first community of users.
            </p>
            <p style="margin:0 0 20px;font-size:16px;color:#2a2a26;line-height:1.6;">
              Scholio is a collaborative academic writing platform: Markdown editor with citations, version control, role-based collaboration, export to LaTeX and Typst, and an AI assistant that understands your research context.
            </p>
            <p style="margin:0 0 32px;font-size:16px;color:#2a2a26;line-height:1.6;">
              We are at a very early stage and your feedback genuinely matters. If something does not work as expected, or if you have an idea, write to us by replying to this email.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:6px;background:#1a1a18;">
                  <a href="${registrationUrl}"
                     style="display:inline-block;padding:14px 28px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;font-weight:600;color:#f5f3ee;text-decoration:none;letter-spacing:0.01em;">
                    Create my account →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:13px;color:#8a8880;">
              This link is personal and non-transferable. It expires in 7 days.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #e8e6e0;">
            <p style="margin:0;font-size:13px;color:#8a8880;line-height:1.6;">
              Scholio · Open source academic writing platform<br>
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
	await sendMail({
		to,
		subject: `New comment on "${documentTitle}"`,
		html: `
			<p>Hi,</p>
			<p><strong>${authorName}</strong> left a comment on <strong>"${documentTitle}"</strong> (${projectTitle}):</p>
			<blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 16px 0;">
				${commentExcerpt}
			</blockquote>
			<p><a href="${documentUrl}">View the document</a></p>
			<p style="margin-top: 32px; font-size: 12px; color: #999;">
				<a href="${unsubscribeUrl}" style="color: #999;">Mute notifications for this project</a>
			</p>
		`
	});
}

export async function sendCommitNotification({
	to,
	committerName,
	documentTitle,
	projectTitle,
	commitMessage,
	documentUrl,
	unsubscribeUrl
}: {
	to: string;
	committerName: string;
	documentTitle: string;
	projectTitle: string;
	commitMessage: string;
	documentUrl: string;
	unsubscribeUrl: string;
}) {
	await sendMail({
		to,
		subject: `New commit on "${documentTitle}"`,
		html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9f9f7;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e8e6e0;">
        <tr>
          <td style="background:#1a1a18;padding:24px 40px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#f5f3ee;">Scholio</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 24px;">
            <p style="margin:0 0 16px;font-size:15px;color:#2a2a26;line-height:1.6;">
              <strong>${committerName}</strong> saved a new version of <strong>"${documentTitle}"</strong> in project <strong>${projectTitle}</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
              <tr>
                <td style="background:#f5f3ee;border-radius:6px;border-left:3px solid #7c5c3e;padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:#57534e;font-family:ui-sans-serif,system-ui,sans-serif;">Commit message</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#2a2a26;font-style:italic;">"${commitMessage}"</p>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:6px;background:#1a1a18;">
                  <a href="${documentUrl}" style="display:inline-block;padding:12px 24px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;font-weight:600;color:#f5f3ee;text-decoration:none;">
                    View the document →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px 24px;border-top:1px solid #e8e6e0;">
            <p style="margin:0;font-size:12px;color:#a8a29e;line-height:1.6;">
              Scholio · <a href="https://scholio.review" style="color:#a8a29e;">scholio.review</a><br>
              <a href="${unsubscribeUrl}" style="color:#a8a29e;">Mute notifications for this project</a>
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

export async function sendVerificationEmail(email: string, url: string) {
	await sendMail({
		to: email,
		subject: 'Confirm your Scholio account',
		html: `
			<p>Hi,</p>
			<p>Click the link below to confirm your account:</p>
			<p><a href="${url}">${url}</a></p>
			<p>The link expires in 24 hours.</p>
		`
	});
}

export async function sendPasswordResetEmail(email: string, url: string) {
	await sendMail({
		to: email,
		subject: 'Reset your Scholio password',
		html: `
			<p>Hi,</p>
			<p>We received a request to reset the password for your Scholio account.</p>
			<p><a href="${url}">Reset your password</a></p>
			<p>This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
			<p>— The Scholio team</p>
		`
	});
}
