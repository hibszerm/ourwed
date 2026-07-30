/**
 * OurWed auth email templates — shared branded shell.
 *
 * Generates production HTML + plain text for Supabase Auth,
 * plus browser previews with sample action URLs.
 *
 * Placeholders must remain exact Go template syntax for GoTrue:
 *   Recovery CTA: token_hash={{ .TokenHash }}&type=recovery
 *   Other flows:  {{ .ConfirmationURL }}
 *   {{ .SiteURL }} / {{ .Email }} / {{ .NewEmail }} (email_change)
 *
 * Run: npx tsx scripts/buildAuthEmails.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'supabase/templates/auth')
const PREVIEWS = join(OUT, 'previews')

const CONFIRMATION_URL = '{{ .ConfirmationURL }}'

/** Production recovery CTA — TokenHash + verifyOtp (cross-device). */
const RECOVERY_ACTION_URL =
  'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery'

const SAMPLE_CONFIRMATION_URL =
  'https://xyycwllsovpxlcustpcv.supabase.co/auth/v1/verify?token=example-token-hash&type=recovery&redirect_to=https://ourwed.pl/reset-password'

const SAMPLE_RECOVERY_ACTION_URL =
  'https://ourwed.pl/auth/callback?token_hash=example-token-hash&type=recovery'

type AuthEmailId =
  | 'recovery'
  | 'confirmation'
  | 'magic_link'
  | 'email_change'
  | 'invite'

interface AuthEmailSpec {
  id: AuthEmailId
  /** Supabase config.toml key / dashboard template name */
  supabaseKey: AuthEmailId
  subject: string
  heading: string
  paragraphs: string[]
  buttonLabel: string
  /** Optional note under the button, before fallback URL */
  fallbackIntro: string
  /** Optional footer disclaimer (security / ignore) */
  disclaimer?: string
  /** Extra HTML block after body paragraphs (still before CTA) */
  extraHtml?: string
  /** Extra plain-text lines after body paragraphs */
  extraText?: string[]
  /** Override CTA href (defaults to ConfirmationURL). */
  actionUrl?: string
  /**
   * When true, do not print the action URL as visible text
   * (used for recovery so token_hash is not shown in the email body).
   */
  hideVisibleActionUrl?: boolean
  /** Optional safe fallback href when hideVisibleActionUrl is true. */
  safeFallbackUrl?: string
  safeFallbackLabel?: string
}

const EMAILS: AuthEmailSpec[] = [
  {
    id: 'recovery',
    supabaseKey: 'recovery',
    subject: 'Zmień hasło do konta OurWed',
    heading: 'Reset hasła',
    paragraphs: [
      'Otrzymaliśmy prośbę o zmianę hasła do Twojego konta OurWed.',
      'Kliknij przycisk poniżej, aby ustawić nowe hasło.',
    ],
    buttonLabel: 'Zmień hasło',
    fallbackIntro:
      'Jeżeli przycisk nie działa, poproś o nowy link na stronie resetu hasła:',
    disclaimer:
      'Jeżeli to nie Ty wysłałeś tę prośbę, po prostu zignoruj tę wiadomość.',
    actionUrl: RECOVERY_ACTION_URL,
    hideVisibleActionUrl: true,
    safeFallbackUrl: 'https://ourwed.pl/forgot-password',
    safeFallbackLabel: 'https://ourwed.pl/forgot-password',
  },
  {
    id: 'confirmation',
    supabaseKey: 'confirmation',
    subject: 'Potwierdź adres e-mail',
    heading: 'Witamy w OurWed',
    paragraphs: [
      'Dziękujemy za założenie konta.',
      'Potwierdź swój adres e-mail, aby rozpocząć korzystanie z aplikacji.',
    ],
    buttonLabel: 'Potwierdź adres e-mail',
    fallbackIntro: 'Jeżeli przycisk nie działa, skopiuj poniższy adres:',
    disclaimer:
      'Jeżeli konto nie zostało utworzone przez Ciebie, zignoruj tę wiadomość.',
  },
  {
    id: 'magic_link',
    supabaseKey: 'magic_link',
    subject: 'Zaloguj się do OurWed',
    heading: 'Jednorazowe logowanie',
    paragraphs: ['Kliknij przycisk poniżej, aby zalogować się do OurWed.'],
    buttonLabel: 'Zaloguj się',
    fallbackIntro: 'Jeżeli przycisk nie działa, skopiuj poniższy adres:',
    disclaimer:
      'Jeżeli nie prosiłeś o ten link, możesz bezpiecznie zignorować tę wiadomość.',
  },
  {
    id: 'email_change',
    supabaseKey: 'email_change',
    subject: 'Potwierdź zmianę adresu e-mail',
    heading: 'Zmiana adresu e-mail',
    paragraphs: [
      'Otrzymaliśmy prośbę o zmianę adresu e-mail przypisanego do Twojego konta.',
    ],
    buttonLabel: 'Potwierdź zmianę',
    fallbackIntro: 'Jeżeli przycisk nie działa, skopiuj poniższy adres:',
    disclaimer:
      'Jeżeli to nie Ty wysłałeś tę prośbę, zignoruj tę wiadomość.',
    extraHtml:
      '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#5c5c5c;">Nowy adres: <strong style="color:#0a0a0a;font-weight:600;">{{ .NewEmail }}</strong></p>',
    extraText: ['Nowy adres: {{ .NewEmail }}'],
  },
  {
    id: 'invite',
    supabaseKey: 'invite',
    subject: 'Zaproszenie do OurWed',
    heading: 'Otrzymałeś zaproszenie',
    paragraphs: [
      'Zostałeś zaproszony do korzystania z aplikacji OurWed.',
    ],
    buttonLabel: 'Akceptuję zaproszenie',
    fallbackIntro: 'Jeżeli przycisk nie działa, skopiuj poniższy adres:',
    disclaimer:
      'Jeżeli nie spodziewałeś się tego zaproszenia, możesz zignorować tę wiadomość.',
  },
]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function resolveActionUrl(spec: AuthEmailSpec): string {
  return spec.actionUrl ?? CONFIRMATION_URL
}

function resolvePreviewActionUrl(spec: AuthEmailSpec): string {
  if (spec.id === 'recovery') return SAMPLE_RECOVERY_ACTION_URL
  return SAMPLE_CONFIRMATION_URL
}

function renderHtml(
  spec: AuthEmailSpec,
  actionUrl: string,
  options?: { newEmail?: string },
): string {
  const paragraphs = spec.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#5c5c5c;">${escapeHtml(p)}</p>`,
    )
    .join('\n                  ')

  const disclaimer = spec.disclaimer
    ? `<p class="ow-disclaimer" style="margin:28px 0 0;font-size:13px;line-height:1.55;color:#8f8f8f;">${escapeHtml(spec.disclaimer)}</p>`
    : ''

  let extra = spec.extraHtml ?? ''
  if (options?.newEmail && extra.includes('{{ .NewEmail }}')) {
    extra = extra.replaceAll('{{ .NewEmail }}', escapeHtml(options.newEmail))
  }

  const visibleFallbackUrl = spec.hideVisibleActionUrl
    ? (spec.safeFallbackUrl ?? 'https://ourwed.pl/forgot-password')
    : actionUrl
  const visibleFallbackLabel = spec.hideVisibleActionUrl
    ? (spec.safeFallbackLabel ?? visibleFallbackUrl)
    : actionUrl

  return `<!DOCTYPE html>
<html lang="pl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(spec.subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media only screen and (max-width: 620px) {
      .ow-shell { padding: 24px 16px !important; }
      .ow-card { padding: 32px 24px !important; }
      .ow-heading { font-size: 24px !important; }
      .ow-button { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    }
    @media (prefers-color-scheme: dark) {
      .ow-body { background-color: #0a0a0a !important; }
      .ow-card {
        background-color: #141414 !important;
        border-color: #2a2a2a !important;
      }
      .ow-brand, .ow-heading, .ow-url { color: #f5f5f5 !important; }
      .ow-copy, .ow-fallback-label { color: #a3a3a3 !important; }
      .ow-disclaimer, .ow-footer-copy { color: #737373 !important; }
      .ow-footer-brand { color: #e5e5e5 !important; }
      .ow-button {
        background-color: #f5f5f5 !important;
        color: #0a0a0a !important;
      }
      .ow-divider { border-color: #2a2a2a !important; }
    }
  </style>
</head>
<body class="ow-body" style="margin:0;padding:0;background-color:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <div role="article" aria-roledescription="email" aria-label="${escapeHtml(spec.subject)}" lang="pl" style="background-color:#f7f7f7;">
    <!-- Preheader -->
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      ${escapeHtml(spec.paragraphs[0] ?? spec.heading)}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f7f7f7;">
      <tr>
        <td align="center" class="ow-shell" style="padding:48px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
            <tr>
              <td align="left" style="padding:0 0 28px;">
                <span class="ow-brand" style="font-size:20px;line-height:1.2;font-weight:650;letter-spacing:-0.03em;color:#0a0a0a;">OurWed</span>
              </td>
            </tr>
            <tr>
              <td class="ow-card" style="background-color:#ffffff;border:1px solid #e8e8e8;border-radius:16px;padding:40px 40px 36px;">
                <h1 class="ow-heading" style="margin:0 0 20px;font-size:28px;line-height:1.25;font-weight:650;letter-spacing:-0.035em;color:#0a0a0a;">
                  ${escapeHtml(spec.heading)}
                </h1>

                <div class="ow-copy">
                  ${paragraphs}
                  ${extra}
                </div>

                <!-- Bulletproof CTA -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td align="left">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${actionUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" stroke="f" fillcolor="#0a0a0a">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Segoe UI,sans-serif;font-size:15px;font-weight:600;">${escapeHtml(spec.buttonLabel)}</center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-- -->
                      <a class="ow-button" href="${actionUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#0a0a0a;color:#ffffff;font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:16px 28px;border-radius:8px;border:1px solid #0a0a0a;">
                        ${escapeHtml(spec.buttonLabel)}
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>

                <p class="ow-fallback-label" style="margin:28px 0 10px;font-size:13px;line-height:1.55;color:#8f8f8f;">
                  ${escapeHtml(spec.fallbackIntro)}
                </p>
                <p class="ow-url" style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;color:#5c5c5c;">
                  <a href="${visibleFallbackUrl}" target="_blank" rel="noopener noreferrer" style="color:#5c5c5c;text-decoration:underline;">${escapeHtml(visibleFallbackLabel)}</a>
                </p>

                ${disclaimer}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 8px 0;text-align:left;">
                <p class="ow-footer-brand" style="margin:0 0 6px;font-size:14px;line-height:1.4;font-weight:600;letter-spacing:-0.02em;color:#0a0a0a;">OurWed</p>
                <p class="ow-footer-copy" style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#8f8f8f;">CRM dla fotografów i filmowców ślubnych</p>
                <p style="margin:0;font-size:13px;line-height:1.5;">
                  <a href="https://ourwed.pl" target="_blank" rel="noopener noreferrer" style="color:#5c5c5c;text-decoration:underline;">https://ourwed.pl</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
`
}

function renderText(spec: AuthEmailSpec, actionUrl: string): string {
  const visibleFallback = spec.hideVisibleActionUrl
    ? (spec.safeFallbackLabel ?? 'https://ourwed.pl/forgot-password')
    : actionUrl

  const lines = [
    'OurWed',
    '',
    spec.heading,
    '',
    ...spec.paragraphs,
    ...(spec.extraText ?? []),
    '',
    `${spec.buttonLabel}:`,
    actionUrl,
    '',
    spec.fallbackIntro,
    visibleFallback,
  ]

  if (spec.disclaimer) {
    lines.push('', spec.disclaimer)
  }

  lines.push(
    '',
    '—',
    'OurWed',
    'CRM dla fotografów i filmowców ślubnych',
    'https://ourwed.pl',
    '',
  )

  return lines.join('\n')
}

function renderPreviewIndex(): string {
  const links = EMAILS.map(
    (e) =>
      `<li style="margin:0 0 12px;"><a href="./${e.id}.html" style="color:#0a0a0a;font-size:16px;">${escapeHtml(e.subject)}</a> <span style="color:#8f8f8f;font-size:13px;">(${e.id})</span></li>`,
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OurWed — Auth email previews</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f7f7f7; color:#0a0a0a; }
    main { max-width:560px; margin:0 auto; padding:48px 24px; }
    h1 { font-size:28px; letter-spacing:-0.03em; margin:0 0 8px; }
    p { color:#5c5c5c; line-height:1.55; }
    ul { padding-left:18px; margin:24px 0; }
    .note { margin-top:32px; font-size:13px; color:#8f8f8f; }
  </style>
</head>
<body>
  <main>
    <h1>Auth email previews</h1>
    <p>Branded OurWed authentication emails. Recovery uses TokenHash; other flows keep ConfirmationURL.</p>
    <ul>
      ${links}
    </ul>
    <p class="note">Local recovery CTA equivalent: <code>http://localhost:5173/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery</code> (do not use in production templates).</p>
  </main>
</body>
</html>
`
}

function write(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, 'utf8')
}

function main() {
  for (const spec of EMAILS) {
    const actionUrl = resolveActionUrl(spec)
    const html = renderHtml(spec, actionUrl)
    const text = renderText(spec, actionUrl)
    const preview = renderHtml(spec, resolvePreviewActionUrl(spec), {
      newEmail: 'nowy@example.com',
    })

    write(join(OUT, `${spec.id}.html`), html)
    write(join(OUT, `${spec.id}.txt`), text)
    write(join(PREVIEWS, `${spec.id}.html`), preview)

    console.log(`wrote ${spec.id}`)
  }

  write(join(PREVIEWS, 'index.html'), renderPreviewIndex())
  console.log('wrote previews/index.html')
  console.log(`OUT=${OUT}`)
}

main()
