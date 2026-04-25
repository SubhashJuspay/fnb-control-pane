export interface InvitationEmailParams {
  inviteUrl: string;
  tenantName: string;
  role: string;
  locationName?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function invitationEmail(params: InvitationEmailParams): RenderedEmail {
  const scope = params.locationName
    ? `the ${params.locationName} location`
    : `${params.tenantName} (tenant-wide)`;
  const subject = `You're invited to ${params.tenantName} on F&B Control Pane`;
  const text = [
    `Hi,`,
    ``,
    `You've been invited to join ${params.tenantName} as ${params.role} for ${scope}.`,
    ``,
    `Accept your invitation by visiting this link (valid for 24 hours):`,
    params.inviteUrl,
    ``,
    `If you weren't expecting this invitation, you can safely ignore this email.`,
    ``,
    `— F&B Control Pane`,
  ].join('\n');
  const html = `
    <p>Hi,</p>
    <p>You've been invited to join <strong>${escapeHtml(params.tenantName)}</strong>
       as <strong>${escapeHtml(params.role)}</strong> for ${escapeHtml(scope)}.</p>
    <p>
      <a href="${escapeAttr(params.inviteUrl)}">Accept your invitation</a>
      (valid for 24 hours)
    </p>
    <p style="color:#666;font-size:12px">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  `.trim();
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
