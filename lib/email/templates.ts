/**
 * Minimal branded email template. Returns { html, text } from a plain-text
 * message body. Keeps things simple — no external template engine required.
 *
 * Intentionally has NO "Hi <name>" greeting: guests imported from a CSV are
 * stored individually without their plus-ones, so a personal greeting reads
 * weird when only one member of a couple actually receives the email. The
 * heading + body carry the message instead.
 */
export interface BuildEmailArgs {
  weddingName: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bodyToHtml(body: string): string {
  return escapeHtml(body)
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px;">${para.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function buildGuestEmail(args: BuildEmailArgs): { html: string; text: string } {
  const {
    weddingName,
    heading,
    body,
    ctaLabel,
    ctaUrl,
    footerNote,
  } = args;

  const bodyHtml = bodyToHtml(body);
  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<div style="text-align:center;margin:28px 0 8px;">
           <a href="${escapeHtml(ctaUrl)}"
              style="display:inline-block;padding:14px 28px;border-radius:999px;background:linear-gradient(135deg,#8a6d1f,#c6a355);color:#FDFBF7;text-decoration:none;font-family:Georgia,serif;font-size:15px;font-weight:600;letter-spacing:0.02em;">
             ${escapeHtml(ctaLabel)}
           </a>
         </div>`
      : '';

  const footer = footerNote
    ? `<p style="margin:24px 0 0;font-size:12px;color:#8a8580;">${escapeHtml(footerNote)}</p>`
    : '';

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#FAF9F5;font-family:Georgia,'Times New Roman',serif;color:#1b1c1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
            <tr>
              <td style="padding:32px 32px 8px;text-align:center;">
                <p style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:22px;color:#8a6d1f;letter-spacing:0.02em;">ReWed</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px;text-align:center;">
                <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#8a8580;font-family:Arial,sans-serif;">${escapeHtml(weddingName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;text-align:center;">
                <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:500;color:#1b1c1a;line-height:1.25;">${escapeHtml(heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px 32px;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#3b3a36;">
                ${bodyHtml}
                ${ctaHtml}
                ${footer}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;text-align:center;border-top:1px solid #F0EBE1;">
                <p style="margin:0;font-size:11px;color:#a8a29e;font-family:Arial,sans-serif;letter-spacing:0.4px;">
                  Sent with love via ReWed
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [body];
  if (ctaLabel && ctaUrl) {
    textLines.push('', `${ctaLabel}: ${ctaUrl}`);
  }
  if (footerNote) {
    textLines.push('', footerNote);
  }
  textLines.push('', '— Sent with love via ReWed');

  return { html, text: textLines.join('\n') };
}
