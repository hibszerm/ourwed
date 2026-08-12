/**
 * Branded transactional notification email templates (server-side).
 * No questionnaire answers / tokens / sensitive PII.
 */

export type NotificationEmailInput = {
  eventType: string
  appBaseUrl: string
  payload: Record<string, unknown>
}

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shell(args: {
  preheader: string
  eyebrow: string
  heading: string
  bodyHtml: string
  ctaLabel: string
  ctaUrl: string
  contextLines?: string[]
}): string {
  const context =
    args.contextLines && args.contextLines.length > 0
      ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#6b6560;">${args.contextLines
          .map((l) => escapeHtml(l))
          .join('<br/>')}</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OurWed</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d272b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(args.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ec;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;">
          <tr>
            <td style="padding:0 0 20px;">
              <span style="font-size:18px;font-weight:650;letter-spacing:-0.03em;color:#1d272b;">OurWed</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e6e0d6;border-radius:16px;padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#8a6a3d;">${escapeHtml(args.eyebrow)}</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:650;letter-spacing:-0.03em;color:#1d272b;">${escapeHtml(args.heading)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#4a4540;">${args.bodyHtml}</div>
              ${context}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
                <tr>
                  <td style="border-radius:10px;background:#1d272b;">
                    <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#f4f1ec;text-decoration:none;">${escapeHtml(args.ctaLabel)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:#6e6e73;">
              Preferencje powiadomień możesz zmienić w ustawieniach OurWed:
              <a href="${escapeHtml(args.ctaUrl.split('/').slice(0, 3).join('/') + '/ustawienia/powiadomienia')}" style="color:#1d272b;">Ustawienia → Powiadomienia</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function renderNotificationEmail(
  input: NotificationEmailInput,
): RenderedEmail {
  const couple = str(input.payload.coupleLabel)
  const weddingDate = str(input.payload.weddingDate)
  const targetPath = str(input.payload.targetPath) || '/dashboard'
  const ctaUrl = `${input.appBaseUrl}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`
  const context: string[] = []
  if (couple) context.push(couple)
  if (weddingDate) context.push(`Data ślubu: ${weddingDate}`)

  if (input.eventType === 'questionnaire.contract.completed') {
    const html = shell({
      preheader: 'Para uzupełniła dane do umowy.',
      eyebrow: 'OurWed',
      heading: 'Para uzupełniła dane do umowy.',
      bodyHtml:
        '<p style="margin:0;">Otrzymałeś nowe odpowiedzi. Są gotowe do sprawdzenia w OurWed.</p>',
      ctaLabel: 'Sprawdź odpowiedzi',
      ctaUrl,
      contextLines: context,
    })
    return {
      subject: 'Nowe dane do umowy w OurWed',
      html,
      text: [
        'Para uzupełniła dane do umowy.',
        'Otrzymałeś nowe odpowiedzi. Są gotowe do sprawdzenia w OurWed.',
        ...context,
        `Sprawdź odpowiedzi: ${ctaUrl}`,
      ].join('\n\n'),
    }
  }

  if (input.eventType === 'questionnaire.prewedding.completed') {
    const html = shell({
      preheader: 'Ankieta przedślubna jest gotowa.',
      eyebrow: 'OurWed',
      heading: 'Para uzupełniła ankietę przedślubną.',
      bodyHtml:
        '<p style="margin:0;">Plan dnia i informacje organizacyjne czekają na Twoją weryfikację w OurWed.</p>',
      ctaLabel: 'Zobacz odpowiedzi',
      ctaUrl,
      contextLines: context,
    })
    return {
      subject: 'Ankieta przedślubna jest gotowa',
      html,
      text: [
        'Para uzupełniła ankietę przedślubną.',
        'Plan dnia i informacje organizacyjne czekają na Twoją weryfikację w OurWed.',
        ...context,
        `Zobacz odpowiedzi: ${ctaUrl}`,
      ].join('\n\n'),
    }
  }

  const html = shell({
    preheader: 'Nowe powiadomienie OurWed',
    eyebrow: 'OurWed',
    heading: 'Masz nowe powiadomienie.',
    bodyHtml: '<p style="margin:0;">Otwórz OurWed, aby zobaczyć szczegóły.</p>',
    ctaLabel: 'Otwórz OurWed',
    ctaUrl,
    contextLines: context,
  })
  return {
    subject: 'Powiadomienie OurWed',
    html,
    text: `Masz nowe powiadomienie.\n\n${ctaUrl}`,
  }
}
