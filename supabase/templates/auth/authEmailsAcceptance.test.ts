/**
 * Acceptance checks for branded OurWed auth email templates.
 * All actionable templates must use TokenHash (never ConfirmationURL).
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const AUTH = join(dirname(fileURLToPath(import.meta.url)))

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  auth emails — ${msg}`)
}

const TEMPLATES = [
  {
    id: 'recovery',
    subject: 'Zmień hasło do konta OurWed',
    heading: 'Reset hasła',
    button: 'Zmień hasło',
    cta: 'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=recovery&intent=recovery',
    fallback: 'https://ourwed.pl/forgot-password',
  },
  {
    id: 'confirmation',
    subject: 'Potwierdź adres e-mail',
    heading: 'Witamy w OurWed',
    button: 'Potwierdź adres e-mail',
    cta: 'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=email&intent=signup',
    fallback: 'https://ourwed.pl/register',
  },
  {
    id: 'magic_link',
    subject: 'Zaloguj się do OurWed',
    heading: 'Jednorazowe logowanie',
    button: 'Zaloguj się',
    cta: 'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=email&intent=magic-link',
    fallback: 'https://ourwed.pl/login',
  },
  {
    id: 'email_change',
    subject: 'Potwierdź zmianę adresu e-mail',
    heading: 'Zmiana adresu e-mail',
    button: 'Potwierdź zmianę',
    cta: 'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=email_change&intent=email-change',
    fallback: 'https://ourwed.pl/login',
  },
  {
    id: 'invite',
    subject: 'Zaproszenie do OurWed',
    heading: 'Otrzymałeś zaproszenie',
    button: 'Akceptuję zaproszenie',
    cta: 'https://ourwed.pl/auth/callback?token_hash={{ .TokenHash }}&type=invite&intent=invite',
    fallback: 'https://ourwed.pl/login',
  },
] as const

assert(existsSync(join(AUTH, 'previews/index.html')), 'preview index missing')
assert(existsSync(join(AUTH, 'config.snippet.toml')), 'config snippet missing')

const snippet = readFileSync(join(AUTH, 'config.snippet.toml'), 'utf8')

for (const t of TEMPLATES) {
  const htmlPath = join(AUTH, `${t.id}.html`)
  const txtPath = join(AUTH, `${t.id}.txt`)
  const previewPath = join(AUTH, 'previews', `${t.id}.html`)

  assert(existsSync(htmlPath), `${t.id}.html missing`)
  assert(existsSync(txtPath), `${t.id}.txt missing`)
  assert(existsSync(previewPath), `preview ${t.id}.html missing`)

  const html = readFileSync(htmlPath, 'utf8')
  const txt = readFileSync(txtPath, 'utf8')
  const preview = readFileSync(previewPath, 'utf8')

  assert(html.includes(t.heading), `${t.id} heading`)
  assert(html.includes(t.button), `${t.id} button label`)
  assert(txt.includes(t.heading), `${t.id} txt heading`)
  assert(txt.includes(t.button), `${t.id} txt button`)
  assert(html.includes('OurWed'), `${t.id} brand`)
  assert(html.includes('https://ourwed.pl'), `${t.id} footer site`)
  assert(html.includes('CRM dla fotografów i filmowców ślubnych'), `${t.id} footer tagline`)
  assert(html.includes('prefers-color-scheme: dark'), `${t.id} dark mode styles`)
  assert(html.includes('max-width:560px'), `${t.id} max width`)
  assert(snippet.includes(`template.${t.id}`), `snippet wires ${t.id}`)
  assert(snippet.includes(t.subject), `snippet subject for ${t.id}`)

  assert(html.includes(t.cta), `${t.id} html TokenHash CTA`)
  assert(txt.includes(t.cta), `${t.id} txt TokenHash CTA`)
  assert(html.includes(`href="${t.cta}"`), `${t.id} CTA href`)
  assert(!html.includes('{{ .ConfirmationURL }}'), `${t.id} no ConfirmationURL`)
  assert(!txt.includes('{{ .ConfirmationURL }}'), `${t.id} txt no ConfirmationURL`)
  assert(!/\blocalhost\b/i.test(html), `${t.id} no localhost in prod html`)
  assert(!/\blocalhost\b/i.test(txt), `${t.id} no localhost in prod txt`)
  assert(html.includes(t.fallback), `${t.id} safe fallback`)
  assert(
    !html.includes(`>${t.cta}<`),
    `${t.id} does not print token_hash URL as visible text node`,
  )
  assert(
    preview.includes('token_hash=example-token-hash'),
    `${t.id} preview uses sample TokenHash`,
  )
}

const emailChange = readFileSync(join(AUTH, 'email_change.html'), 'utf8')
assert(emailChange.includes('{{ .NewEmail }}'), 'email_change includes NewEmail')

const recovery = readFileSync(join(AUTH, 'recovery.html'), 'utf8')
assert(
  recovery.includes('Jeżeli to nie Ty wysłałeś tę prośbę'),
  'recovery disclaimer',
)

const confirmation = readFileSync(join(AUTH, 'confirmation.html'), 'utf8')
assert(
  confirmation.includes('Jeżeli konto nie zostało utworzone przez Ciebie'),
  'confirmation disclaimer',
)

const builder = readFileSync(join(ROOT, 'scripts/buildAuthEmails.ts'), 'utf8')
assert(builder.includes('assertSafeProductionOutput'), 'builder guards ConfirmationURL/localhost')
assert(builder.includes('tokenHashActionUrl'), 'builder builds TokenHash CTAs')
assert(!builder.includes("CONFIRMATION_URL = '{{ .ConfirmationURL }}'"), 'builder dropped ConfirmationURL default')

// No reauthentication actionable template in this project (OTP code only if added later).
assert(!existsSync(join(AUTH, 'reauthentication.html')), 'no reauthentication clickable template')

const authService = readFileSync(
  join(ROOT, 'src/features/auth/services/authService.ts'),
  'utf8',
)
assert(authService.includes('resetPasswordForEmail'), 'auth reset still present')
assert(authService.includes('signUp'), 'auth signup still present')
assert(authService.includes('authCallbackUrl'), 'auth uses callback URLs for redirect allow-list')

console.log('PASS  auth emails')
