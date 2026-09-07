/**
 * Legal surfaces V1 — routes, linking, content guards, registration lock.
 * Source/static acceptance only (no browser / Supabase).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_OPERATOR,
  LEGAL_PROCESSORS,
  LEGAL_ROUTES,
  LEGAL_VERSION,
} from '@/features/legal/legalMeta'
import { REGULAMIN_SECTIONS, REGULAMIN_TITLE } from '@/features/legal/content/regulamin'
import {
  POLITYKA_SECTIONS,
  POLITYKA_TITLE,
} from '@/features/legal/content/politykaPrywatnosci'
import {
  POWIERZENIE_SECTIONS,
  POWIERZENIE_TITLE,
} from '@/features/legal/content/powierzenieDanych'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  legal surfaces — ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), `${msg} (missing: ${needle})`)
}

function assertNotIncludes(hay: string, needle: string, msg: string) {
  assert(!hay.includes(needle), `${msg} (unexpected: ${needle})`)
}

const FORBIDDEN_PSP = ['Stripe', 'Paddle', 'PayU', 'Przelewy24', 'Klarna'] as const

{
  assert(LEGAL_VERSION === '1.1', 'LEGAL_VERSION is 1.1')
  assert(LEGAL_EFFECTIVE_DATE.length >= 10, 'LEGAL_EFFECTIVE_DATE set')
  assert(LEGAL_OPERATOR.email === 'kontakt.ourwed@gmail.com', 'operator email')
  assert(LEGAL_OPERATOR.nip === '6482810484', 'operator NIP')
  assert(LEGAL_ROUTES.terms === '/regulamin', 'terms route')
  assert(LEGAL_ROUTES.privacy === '/polityka-prywatnosci', 'privacy route')
  assert(LEGAL_ROUTES.dpa === '/powierzenie-danych', 'dpa route')
  assert(LEGAL_PROCESSORS.length >= 7, 'processor list present')
  assert(
    !LEGAL_PROCESSORS.some((p) => /stripe|paddle/i.test(p.name)),
    'no payment provider in LEGAL_PROCESSORS',
  )
  console.log('PASS  1. legal metadata')
}

{
  const router = read('src/routes/router.tsx')
  assertIncludes(router, "path: '/regulamin'", 'router regulamin')
  assertIncludes(router, "path: '/polityka-prywatnosci'", 'router privacy')
  assertIncludes(router, "path: '/powierzenie-danych'", 'router dpa')
  assertIncludes(router, '<RegulaminPage />', 'RegulaminPage mounted')
  assertIncludes(router, '<PolitykaPrywatnosciPage />', 'PolitykaPrywatnosciPage mounted')
  assertIncludes(router, '<PowierzenieDanychPage />', 'PowierzenieDanychPage mounted')

  // Public routes must sit outside ProtectedRoute / ProAccessGate wrappers.
  const protectedIdx = router.indexOf('element: <ProtectedRoute />')
  assert(protectedIdx > 0, 'ProtectedRoute exists')
  const beforeProtected = router.slice(0, protectedIdx)
  assertIncludes(beforeProtected, "path: '/regulamin'", 'regulamin before ProtectedRoute')
  assertIncludes(
    beforeProtected,
    "path: '/polityka-prywatnosci'",
    'privacy before ProtectedRoute',
  )
  assertIncludes(beforeProtected, "path: '/powierzenie-danych'", 'dpa before ProtectedRoute')
  assertNotIncludes(beforeProtected, 'ProAccessGate', 'legal routes not behind ProAccessGate')
  console.log('PASS  2. public legal routes')
}

{
  assert(REGULAMIN_TITLE.includes('Regulamin'), 'regulamin title')
  assert(POLITYKA_TITLE.includes('Polityka'), 'privacy title')
  assert(POWIERZENIE_TITLE.includes('powierzenia'), 'dpa title')
  assert(REGULAMIN_SECTIONS.length >= 30, 'substantial Terms sections')
  assert(POLITYKA_SECTIONS.length >= 30, 'substantial Privacy sections')
  assert(POWIERZENIE_SECTIONS.length >= 20, 'substantial DPA sections')

  const pages = [
    read('src/pages/RegulaminPage.tsx'),
    read('src/pages/PolitykaPrywatnosciPage.tsx'),
    read('src/pages/PowierzenieDanychPage.tsx'),
  ]
  for (const page of pages) {
    assertIncludes(page, 'LegalDocumentPage', 'page uses LegalDocumentPage')
  }

  const doc = read('src/features/legal/LegalDocumentPage.tsx')
  assertIncludes(doc, 'LEGAL_VERSION', 'version from meta')
  assertIncludes(doc, 'LEGAL_EFFECTIVE_DATE_PL', 'effective date from meta')
  assertIncludes(doc, 'window.scrollTo(0, 0)', 'scroll to top on open')
  assertIncludes(doc, '<main', 'semantic main')
  assertIncludes(doc, '<h1', 'single H1 via title class')

  const allContent = [
    read('src/features/legal/content/regulamin.ts'),
    read('src/features/legal/content/politykaPrywatnosci.ts'),
    read('src/features/legal/content/powierzenieDanych.ts'),
    read('src/features/legal/legalMeta.ts'),
  ].join('\n')

  for (const psp of FORBIDDEN_PSP) {
    assertNotIncludes(allContent, psp, `no false PSP name: ${psp}`)
  }
  assertIncludes(allContent, 'Dostawca płatności', 'payment provider language')
  assertIncludes(
    read('src/features/legal/legalMeta.ts'),
    'LEGAL: update Terms, Privacy Policy, processor/subprocessor disclosures',
    'internal payment-provider TODO',
  )
  assertIncludes(
    read('src/features/legal/legalMeta.ts'),
    'P0 PAYMENT LEGAL REVIEW',
    'internal P0 payment legal review TODO',
  )
  assertIncludes(
    read('src/features/legal/legalMeta.ts'),
    'before paid checkout launches',
    'internal checkout consumer-review TODO',
  )
  assertIncludes(
    read('src/features/legal/legalMeta.ts'),
    'P0 LEGAL — verify for each production provider',
    'internal provider transfer verification TODO',
  )
  assertIncludes(
    read('src/features/legal/legalMeta.ts'),
    'LEGAL/OWNER FOLLOW-UP BEFORE LAUNCH',
    'internal subprocessor objection procedure TODO',
  )
  assertIncludes(
    read('src/features/legal/legalMeta.ts'),
    'P0 ACCOUNT DELETION',
    'internal account deletion TODO',
  )

  const regulamin = read('src/features/legal/content/regulamin.ts')
  const polityka = read('src/features/legal/content/politykaPrywatnosci.ts')
  const powierzenie = read('src/features/legal/content/powierzenieDanych.ts')
  const userFacing = [regulamin, polityka, powierzenie].join('\n')

  assertNotIncludes(userFacing, 'ledger', 'no English ledger terminology')
  assertNotIncludes(userFacing, 'ISO/SOC', 'no ISO/SOC negative claim')
  assertNotIncludes(userFacing, 'własną odpowiedzialność', 'no vague own-responsibility PESEL wording')
  assertNotIncludes(userFacing, 'banera zgody', 'no cookie-banner UI justification')
  assertNotIncludes(userFacing, 'o ile prawo tego wymaga', 'no vague subprocessor-objection qualifier')
  assertNotIncludes(userFacing, 'zablokowane/podpisane', 'no locked-document implementation detail')
  assertNotIncludes(userFacing, 'planuje udostępnić', 'no roadmap planning language')
  assertIncludes(userFacing, 'ewidencją płatności dotyczących zlecenia', 'natural Polish payment ledger wording in Terms')
  assertIncludes(userFacing, '14 dni', 'statutory withdrawal period preserved')
  assertIncludes(
    powierzenie,
    'narusza RODO lub inne obowiązujące przepisy',
    'DPA instructs unlawful-instruction notice',
  )
  assertIncludes(
    powierzenie,
    'wymagane obowiązującym prawem Unii lub państwa członkowskiego',
    'DPA covers law-required processing',
  )
  assertIncludes(
    powierzenie,
    'możliwość wniesienia sprzeciwu przed wejściem zmiany w życie',
    'DPA advance subprocessor notice + objection opportunity',
  )
  assertIncludes(
    powierzenie,
    'obowiązki ochrony danych równoważne',
    'DPA equivalent subprocessor obligations',
  )
  assertIncludes(
    userFacing,
    'podstawy prawnej, konieczności, proporcjonalności oraz zakresu',
    'precise PESEL responsibility wording',
  )
  console.log('PASS  3. legal pages render sources + PSP guards')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'LEGAL_ROUTES.terms', 'register links terms')
  assertIncludes(register, 'LEGAL_ROUTES.privacy', 'register links privacy')
  assertIncludes(register, 'to={LEGAL_ROUTES.terms}', 'terms Link to')
  assertIncludes(register, 'to={LEGAL_ROUTES.privacy}', 'privacy Link to')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration still disabled')
  assertIncludes(register, 'registerAccount({', 'signup call unchanged')
  assertIncludes(
    register,
    'potwierdzam zapoznanie się z',
    'privacy acknowledgement wording (not marketing consent)',
  )
  assertIncludes(register, 'Regulamin', 'Regulamin link label')
  assertIncludes(register, 'Polityką prywatności', 'Privacy link label')

  const login = read('src/pages/LoginPage.tsx')
  const registerPage = read('src/pages/RegisterPage.tsx')
  assertIncludes(login, 'AuthLegalLoginCopy', 'login legal links component')
  assertIncludes(registerPage, 'AuthLegalRegisterCopy', 'register shell legal links')

  assertNotIncludes(read('src/features/auth/AuthProvider.tsx'), 'LEGAL_ROUTES', 'AuthProvider untouched by legal')
  assertIncludes(
    read('src/features/auth/services/authService.ts'),
    'LEGAL_VERSION',
    'authService uses canonical legal version for signup metadata',
  )
  assertNotIncludes(
    read('src/features/auth/services/authService.ts'),
    'LEGAL_ROUTES',
    'authService does not hardcode legal routes',
  )
  console.log('PASS  4. registration legal links + registration remains disabled')
}

{
  const footer = read('src/features/landing-v3/sections/LandingV3Footer.tsx')
  assertIncludes(footer, 'LEGAL_ROUTES.terms', 'landing footer terms')
  assertIncludes(footer, 'LEGAL_ROUTES.privacy', 'landing footer privacy')
  assertIncludes(footer, 'LEGAL_ROUTES.dpa', 'landing footer dpa')
  assertIncludes(footer, 'href={LEGAL_ROUTES.terms}', 'landing terms href')
  assertIncludes(footer, 'href={LEGAL_ROUTES.privacy}', 'landing privacy href')
  assertIncludes(footer, 'href={LEGAL_ROUTES.dpa}', 'landing dpa href')
  console.log('PASS  5. landing legal links')
}

{
  const contractForm = read('src/features/forms/ProductionContractFormPage.tsx')
  const prewedding = read('src/features/prewedding/PreWeddingPublicFormPage.tsx')
  const notice = read('src/features/legal/LegalLinks.tsx')
  assertIncludes(contractForm, 'PublicFormPrivacyNotice', 'contract form privacy notice')
  assertIncludes(prewedding, 'PublicFormPrivacyNotice', 'pre-wedding form privacy notice')
  assertIncludes(contractForm, 'privacyController', 'contract passes controller')
  assertIncludes(prewedding, 'privacyController', 'prewedding passes controller')
  assertNotIncludes(contractForm, 'type="checkbox"', 'no mandatory privacy checkbox on /form')
  assertNotIncludes(notice, 'type="checkbox"', 'privacy notice is not a checkbox')
  assertNotIncludes(notice, 'zgadzam się', 'no consent wording')
  assertNotIncludes(notice, 'I consent', 'no English consent')
  assertIncludes(notice, 'LEGAL_ROUTES.privacy', 'public notice links privacy')
  assertIncludes(notice, 'Administratorem danych', 'controller framing')
  assertIncludes(notice, 'przetwarza dane na jego polecenie', 'OurWed as processor/platform')
  assertIncludes(notice, 'Więcej informacji', 'expandable fuller disclosure')
  console.log('PASS  6. questionnaire privacy notice')
}

{
  const settings = read('src/pages/AccountSettingsPage.tsx')
  assertIncludes(settings, 'LegalLinksNav', 'settings legal nav')
  assertIncludes(settings, 'Dokumenty prawne', 'settings legal section')
  console.log('PASS  7. authenticated settings legal access')
}

{
  const srcTreeHints = [
    read('src/features/legal/LegalDocumentPage.tsx'),
    read('src/features/legal/LegalLinks.tsx'),
    read('src/pages/RegulaminPage.tsx'),
    read('src/pages/PolitykaPrywatnosciPage.tsx'),
    read('src/pages/PowierzenieDanychPage.tsx'),
    read('src/features/landing-v3/sections/LandingV3Footer.tsx'),
    read('src/features/auth/components/RegisterForm.tsx'),
    read('src/pages/LoginPage.tsx'),
    read('src/pages/AccountSettingsPage.tsx'),
  ].join('\n')

  assertNotIncludes(srcTreeHints, 'CookieBanner', 'no cookie banner component')
  assertNotIncludes(srcTreeHints, 'cookie-banner', 'no cookie-banner class')
  assertNotIncludes(srcTreeHints, 'gtag(', 'no gtag introduced with legal')
  assertNotIncludes(srcTreeHints, 'GTM-', 'no GTM introduced with legal')
  assertNotIncludes(srcTreeHints, 'fbq(', 'no facebook pixel with legal')

  const ai = read('src/features/documents/mapping/components/AiReport.tsx')
  assertIncludes(ai, 'data-ai-transparency', 'AI contextual transparency notice')
  assertIncludes(ai, 'wykorzystuje AI', 'AI notice Polish copy')
  console.log('PASS  8. no cookie banner / analytics; AI notice present')
}

console.log('\nPASS  legal surfaces V1.1')
