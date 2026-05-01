interface InviteEmailParams {
  inviteUrl: string;
  inviterName: string;
  spaceName: string;
}

interface InviteAuthPathParams {
  email: string;
  hasAccount: boolean;
  token: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeSubjectPart(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildInviteAuthPath({ email, hasAccount, token }: InviteAuthPathParams): string {
  const params = new URLSearchParams({
    email,
    returnUrl: `/invites/${token}`,
  });

  return `${hasAccount ? "/login" : "/register"}?${params.toString()}`;
}

export function buildInviteEmail({ inviteUrl, inviterName, spaceName }: InviteEmailParams) {
  const safeInviteUrl = escapeHtml(inviteUrl);
  const safeInviterName = escapeHtml(inviterName);
  const safeSpaceName = escapeHtml(spaceName);
  const subject = `${sanitizeSubjectPart(inviterName)} invited you to ${sanitizeSubjectPart(spaceName)} on Quick Cuts`;
  const text = `${inviterName} invited you to join ${spaceName} on Quick Cuts.\n\nAccept your invite: ${inviteUrl}\n\nIf you were not expecting this invite, you can ignore this email.`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5; background: #f9fafb; padding: 32px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 18px; padding: 32px;">
        <p style="margin: 0 0 8px; color: #6c5ce7; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">Quick Cuts</p>
        <h1 style="font-size: 24px; line-height: 1.25; margin: 0 0 16px; color: #111827;">You're invited to ${safeSpaceName}</h1>
        <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px;">
          ${safeInviterName} invited you to join <strong style="color: #111827;">${safeSpaceName}</strong> so you can review videos, leave comments, and collaborate with the team.
        </p>
        <a href="${safeInviteUrl}" style="display: inline-block; background: #6c5ce7; color: #ffffff; text-decoration: none; font-weight: 700; border-radius: 10px; padding: 12px 18px;">Accept invite</a>
        <p style="margin: 24px 0 0; color: #6b7280; font-size: 13px;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${safeInviteUrl}" style="color: #6c5ce7; word-break: break-all;">${safeInviteUrl}</a>
        </p>
        <p style="margin: 24px 0 0; color: #9ca3af; font-size: 12px;">If you were not expecting this invite, you can ignore this email.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}
