/**
 * Auth UX consistency — shared content slot, split forgot shell, 4 professions.
 * Presentational / product-scope guards only. Does not exercise Supabase.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEGACY_PROFESSION_VALUES,
  PROFESSION_VALUES,
  REGISTRATION_PROFESSIONS,
  REGISTRATION_PROFESSION_VALUES,
  professionLabel,
} from '@/features/auth/services/professions'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  auth UX — ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), `${msg} (missing: ${needle})`)
}

function assertNotIncludes(hay: string, needle: string, msg: string) {
  assert(!hay.includes(needle), `${msg} (unexpected: ${needle})`)
}

{
  const shell = read('src/features/auth/components/AuthShell.tsx')
  const css = read('src/features/auth/components/AuthShell.module.css')
  assertIncludes(shell, 'authContentSlot', 'shared slot class in shell')
  assertIncludes(shell, 'data-auth-content-slot', 'shared slot marker')
  assertIncludes(shell, 'mainRegion', 'main region independent of top bar')
  assertIncludes(css, '.authContentSlot', 'shared slot CSS')
  assertIncludes(css, '--auth-slot-offset', 'shared slot offset token')
  assertIncludes(css, '.mainRegion', 'main region CSS')
  assertNotIncludes(shell, 'align=', 'no optical align prop')
  assertNotIncludes(css, 'contentStage', 'optical stage removed')
  assert(
    !/\.authContentSlot\s*\{[^}]*justify-content:\s*center/s.test(css),
    'authContentSlot is not vertically centered',
  )
  console.log('PASS  1. shared authContentSlot structure')
}

{
  const login = read('src/pages/LoginPage.tsx')
  const register = read('src/pages/RegisterPage.tsx')
  assertIncludes(login, 'layout="split"', 'login split shell')
  assertIncludes(register, 'layout="split"', 'register split shell')
  assertNotIncludes(login, 'align="optical"', 'login no optical align')
  assertNotIncludes(login, 'align=', 'login no page-specific align')
  assertNotIncludes(register, 'align=', 'register no page-specific align')
  console.log('PASS  2. Login/Register share split shell without independent centering')
}

{
  const forgot = read('src/pages/ForgotPasswordPage.tsx')
  const form = read('src/features/auth/components/ForgotPasswordForm.tsx')
  const loginForm = read('src/features/auth/components/LoginForm.tsx')
  assertIncludes(forgot, 'layout="split"', 'forgot uses split AuthShell')
  assertIncludes(forgot, 'RESET HASŁA', 'forgot eyebrow')
  assertIncludes(forgot, 'Odzyskaj dostęp', 'forgot headline')
  assertIncludes(forgot, 'to="/login"', 'forgot back Link')
  assertNotIncludes(forgot, 'window.location', 'forgot no window.location')
  assertNotIncludes(forgot, 'target="_blank"', 'forgot no target=_blank')
  assertNotIncludes(form, 'window.location', 'forgot form no window.location')
  assertIncludes(loginForm, 'to="/forgot-password"', 'login forgot Link via React Router')
  assertNotIncludes(loginForm, 'target="_blank"', 'login forgot no blank target')
  assertNotIncludes(loginForm, 'window.location', 'login forgot no window.location')
  console.log('PASS  3. Forgot Password split shell + SPA navigation')
}

{
  const reset = read('src/pages/ResetPasswordPage.tsx')
  const check = read('src/pages/CheckEmailPage.tsx')
  assertIncludes(reset, 'layout="split"', 'reset uses split shell')
  assertIncludes(check, 'layout="split"', 'check-email uses split shell')
  console.log('PASS  4. Reset + Check-email visual family')
}

{
  assert(REGISTRATION_PROFESSIONS.length === 4, 'exactly 4 registration options')
  assertEqList(
    REGISTRATION_PROFESSION_VALUES,
    [
      'wedding_photographer',
      'wedding_filmmaker',
      'photographer_filmmaker',
      'content_creator',
    ],
    'registration values',
  )
  const labels = REGISTRATION_PROFESSIONS.map((p) => p.label)
  assert(labels.includes('Fotograf ślubny'), 'label photographer')
  assert(labels.includes('Filmowiec ślubny'), 'label filmmaker')
  assert(labels.includes('Fotograf + filmowiec'), 'label combo')
  assert(labels.includes('Content creator'), 'label content creator')

  const registerForm = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(registerForm, 'REGISTRATION_PROFESSIONS', 'register form uses registration list')
  assertNotIncludes(registerForm, 'decorator', 'register form has no decorator')
  assertNotIncludes(registerForm, 'florist', 'register form has no florist')
  assertNotIncludes(registerForm, 'wedding_planner', 'register form has no planner')

  const schema = read('src/features/auth/services/authSchemas.ts')
  assertIncludes(schema, 'REGISTRATION_PROFESSION_VALUES', 'schema validates registration set')

  for (const legacy of [
    'decorator',
    'florist',
    'makeup_artist',
    'wedding_planner',
    'dj',
    'band',
    'wedding_venue',
    'other',
  ] as const) {
    assert(
      (LEGACY_PROFESSION_VALUES as readonly string[]).includes(legacy),
      `legacy value retained: ${legacy}`,
    )
    assert(
      (PROFESSION_VALUES as readonly string[]).includes(legacy),
      `compat list includes: ${legacy}`,
    )
    assert(professionLabel(legacy) != null, `legacy label for ${legacy}`)
  }
  console.log('PASS  5. registration professions = 4; legacy compatibility preserved')
}

{
  const registerForm = read('src/features/auth/components/RegisterForm.tsx')
  const formsCss = read('src/features/auth/components/AuthForms.module.css')
  assertIncludes(
    registerForm,
    'const REGISTRATION_ENABLED = false',
    'pre-launch UI lock constant is false',
  )
  assertIncludes(
    registerForm,
    'Temporary pre-launch registration UI lock',
    'lock has reverse-later comment',
  )
  assertIncludes(
    registerForm,
    'disabled={!REGISTRATION_ENABLED || isSubmitting}',
    'submit button respects UI lock',
  )
  assertIncludes(
    registerForm,
    "event.preventDefault()",
    'locked form submit is prevented',
  )
  assertIncludes(registerForm, 'async function onSubmit', 'signup handler remains intact')
  assertIncludes(registerForm, 'registerAccount({', 'registerAccount call remains intact')
  assertIncludes(formsCss, '.submitPrimary:disabled', 'auth-local disabled style')
  assertNotIncludes(
    read('src/features/auth/components/LoginForm.tsx'),
    'REGISTRATION_ENABLED',
    'login is not gated by registration lock',
  )
  console.log('PASS  6. pre-launch registration UI lock')
}

{
  const shellCss = read('src/features/auth/components/AuthShell.module.css')
  assertIncludes(
    shellCss,
    'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)',
    'desktop auth split is 50/50',
  )
  assertNotIncludes(shellCss, '0.44fr', 'old 44/56 split removed')
  assertNotIncludes(shellCss, '0.56fr', 'old 44/56 split removed')
  assertIncludes(shellCss, '@media (max-width: 1024px)', 'form-only auth mode below desktop')
  assert(
    /@media \(max-width: 1024px\)[\s\S]*?\.right\s*\{[^}]*display:\s*none/s.test(shellCss),
    'mobile/tablet hides auth media panel',
  )
  assertIncludes(
    read('src/features/auth/components/AuthForms.module.css'),
    'font-size: 1rem',
    'mobile inputs use ≥16px to avoid iOS auto-zoom',
  )
  console.log('PASS  7a. desktop auth 50/50 split')
}

{
  const panel = read('src/features/auth/components/AuthVisualPanel.tsx')
  const panelCss = read('src/features/auth/components/AuthVisualPanel.module.css')
  assertIncludes(panel, 'ourwed-auth-product.mp4', 'auth product video src')
  assertIncludes(panel, 'data-auth-visual-video', 'video marker')
  assertIncludes(panel, 'autoPlay', 'autoplay')
  assertIncludes(panel, 'muted', 'muted')
  assertIncludes(panel, 'loop', 'loop')
  assertIncludes(panel, 'playsInline', 'playsInline')
  assertIncludes(panel, 'preload="metadata"', 'preload metadata')
  assertIncludes(panel, 'controls={false}', 'no controls')
  assertIncludes(panel, 'prefers-reduced-motion', 'reduced-motion handling')
  assertNotIncludes(panel, 'PRODUCT VISUAL', 'placeholder label removed')
  assertNotIncludes(panelCss, 'placeholderLabel', 'placeholder styles removed')
  assertIncludes(panelCss, 'object-fit: cover', 'cover fit')
  assertIncludes(panelCss, 'overflow: hidden', 'frame clips video overscan')
  assertIncludes(panelCss, 'width: 122%', 'video overscan scale')
  assertIncludes(panelCss, 'translate(-41%', 'rightward optical shift with overscan')
  assertNotIncludes(panelCss, 'width: 114%', 'insufficient 114% overscan removed')
  assertNotIncludes(panelCss, 'translate(-34%', 'aggressive -34% shift removed')
  assertNotIncludes(panelCss, 'translate(-40%', 'unsafe -40% horizontal rejected')
  assertNotIncludes(panelCss, 'translate(-43%', 'prior -43% horizontal replaced')
  console.log('PASS  7. auth product video cover + framing')
}

function assertEqList(actual: readonly string[], expected: readonly string[], msg: string) {
  assert(
    actual.length === expected.length &&
      actual.every((v, i) => v === expected[i]),
    `${msg}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`,
  )
}

console.log('\nPASS  auth UX consistency')
