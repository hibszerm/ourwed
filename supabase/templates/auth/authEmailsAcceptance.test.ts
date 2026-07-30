/**
 * Acceptance checks for branded OurWed auth email templates.
 * Ensures placeholders, Polish copy, and CTA buttons stay intact.
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
  },
  {
    id: 'confirmation',
    subject: 'Potwierdź adres e-mail',
    heading: 'Witamy w OurWed',
    button: 'Potwierdź adres e-mail',
  },
  {
    id: 'magic_link',
    subject: 'Zaloguj się do OurWed',
    heading: 'Jednorazowe logowanie',
    button: 'Zaloguj się',
  },
  {
    id: 'email_change',
    subject: 'Potwierdź zmianę adresu e-mail',
    heading: 'Zmiana adresu e-mail',
    button: 'Potwierdź zmianę',
  },
  {
    id: 'invite',
    subject: 'Zaproszenie do OurWed',
    heading: 'Otrzymałeś zaproszenie',
    button: 'Akceptuję zaproszenie',
  },
] as const

const CONFIRMATION_PLACEHOLDER = '{{ .ConfirmationURL }}'

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

  assert(html.includes(CONFIRMATION_PLACEHOLDER), `${t.id} html keeps ConfirmationURL`)
  assert(txt.includes(CONFIRMATION_PLACEHOLDER), `${t.id} txt keeps ConfirmationURL`)
  assert(
    html.includes(`href="${CONFIRMATION_PLACEHOLDER}"`),
    `${t.id} CTA href uses ConfirmationURL`,
  )
  assert(html.includes(t.heading), `${t.id} heading`)
  assert(html.includes(t.button), `${t.id} button label`)
  assert(txt.includes(t.heading), `${t.id} txt heading`)
  assert(txt.includes(t.button), `${t.id} txt button`)
  assert(html.includes('OurWed'), `${t.id} brand`)
  assert(html.includes('https://ourwed.pl'), `${t.id} footer site`)
  assert(html.includes('CRM dla fotografów i filmowców ślubnych'), `${t.id} footer tagline`)
  assert(html.includes('prefers-color-scheme: dark'), `${t.id} dark mode styles`)
  assert(html.includes('max-width:560px'), `${t.id} max width`)
  assert(!html.includes('supabase.co/auth/v1/verify?token=example'), `${t.id} no sample URL in prod`)
  assert(preview.includes('supabase.co/auth/v1/verify'), `${t.id} preview has sample URL`)
  assert(snippet.includes(`template.${t.id}`), `snippet wires ${t.id}`)
  assert(snippet.includes(t.subject), `snippet subject for ${t.id}`)
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

// Auth service must remain untouched by this work — smoke that redirects still exist.
const authService = readFileSync(
  join(ROOT, 'src/features/auth/services/authService.ts'),
  'utf8',
)
assert(authService.includes('resetPasswordForEmail'), 'auth reset still present')
assert(authService.includes('authCallbackUrl'), 'auth uses callback URLs')
assert(
  authService.includes("authCallbackUrl('recovery')"),
  'reset redirect uses /auth/callback?next=recovery',
)
assert(
  authService.includes("authCallbackUrl('confirm')"),
  'signup redirect uses /auth/callback?next=confirm',
)

console.log('PASS  auth emails')
