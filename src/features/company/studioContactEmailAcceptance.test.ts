/**
 * Studio client-facing contact email (studio_details.email) — Settings UI +
 * public questionnaire controller notice contract.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStudioDetailsColumnPatch } from '@/lib/api/companyDetailsService'
import { getStudioContactEmailError } from '@/features/company/studioContactEmail'
import { parsePublicQuestionnaireController } from '@/features/legal/publicQuestionnaireController'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

const page = read('src/pages/CompanyDetailsPage.tsx')
const service = read('src/lib/api/companyDetailsService.ts')
const notice = read('src/features/legal/LegalLinks.tsx')
const resolverSql = read(
  'supabase/migrations/20260907210000_public_questionnaire_privacy_controller.sql',
)
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== studio contact email acceptance ===\n')

{
  assert(page.includes('label="E-mail kontaktowy"'), 'field label')
  assert(page.includes("contactEmail: data?.email ?? ''"), 'loads canonical email')
  assert(page.includes('email: form.contactEmail'), 'saves to email column')
  assert(page.includes('type="email"'), 'email input type')
  assert(page.includes('autoComplete="email"'), 'autocomplete')
  assert(page.includes('getStudioContactEmailError'), 'validation helper used')
  assert(
    page.includes("from '@/features/company/studioContactEmail'"),
    'uses shared contact-email helper',
  )
  assert(
    !page.includes('Wpisz poprawny adres e-mail.'),
    'error copy lives in helper',
  )
  assert(
    read('src/features/company/studioContactEmail.ts').includes(
      'Wpisz poprawny adres e-mail.',
    ),
    'validation copy',
  )
  assert(
    page.includes('Widoczny dla klientów m.in. w informacjach o przetwarzaniu'),
    'helper copy',
  )
  assert(!page.includes('user?.email'), 'no auth user email autofill')
  assert(!page.includes('session.user'), 'no session autofill')
  assert(!page.includes('LEGAL_OPERATOR'), 'no OurWed operator email')
  assert(!page.includes('kontakt.ourwed@gmail.com'), 'no hardcoded support email')
  console.log('PASS  1. Settings field loads/saves studio_details.email')
}

{
  assertEq(getStudioContactEmailError(''), null, 'empty ok')
  assertEq(getStudioContactEmailError('   '), null, 'whitespace-only → empty ok')
  assertEq(getStudioContactEmailError('kontakt@studio.example'), null, 'valid ok')
  assertEq(
    getStudioContactEmailError('not-an-email'),
    'Wpisz poprawny adres e-mail.',
    'invalid blocked',
  )
  assertEq(
    getStudioContactEmailError('a@b'),
    'Wpisz poprawny adres e-mail.',
    'missing TLD blocked',
  )
  console.log('PASS  2. validation: optional + format')
}

{
  const withEmail = buildStudioDetailsColumnPatch({
    companyName: 'Atelier',
    email: 'kontakt@atelier.example',
  })
  assertEq(withEmail.company_name, 'Atelier', 'company_name unchanged path')
  assertEq(withEmail.email, 'kontakt@atelier.example', 'email written')

  const cleared = buildStudioDetailsColumnPatch({
    companyName: 'Atelier',
    email: '  ',
  })
  assertEq(cleared.email, null, 'blank email persists as null')

  const nameOnly = buildStudioDetailsColumnPatch({ companyName: 'Atelier' })
  assert(!('email' in nameOnly), 'omitting email leaves DB value')
  console.log('PASS  3. patch: valid / empty / omit')
}

{
  assert(service.includes("column: 'email'"), 'service maps email column')
  assert(service.includes('email: row.email'), 'service reads email')
  assert(
    resolverSql.includes('nullif(trim(sd.email), \'\')'),
    'public RPC uses studio_details.email',
  )
  assert(
    resolverSql.includes("'contact_email', v_studio_email"),
    'DTO contact_email from studio email',
  )
  assert(!/u\.email/.test(resolverSql), 'resolver never uses users.email')
  assert(
    !resolverSql.includes('auth.users'),
    'resolver never reads auth.users for contact',
  )
  console.log('PASS  4. canonical contract Settings ↔ public notice')
}

{
  assert(notice.includes('Kontakt z administratorem:'), 'contact line when email')
  assert(
    notice.includes('controller?.contactEmail?.trim() || null'),
    'null/empty hides contact',
  )
  assert(!notice.includes('LEGAL_OPERATOR.email'), 'no OurWed support fallback')
  assert(!notice.includes('users.email'), 'no users.email fallback in notice')
  assert(!notice.includes('type="checkbox"'), 'no privacy consent checkbox')

  const withContact = parsePublicQuestionnaireController({
    display_name: 'Studio A',
    contact_email: 'a@studio.example',
  })
  assertEq(withContact?.contactEmail, 'a@studio.example', 'parser keeps email')
  const without = parsePublicQuestionnaireController({
    display_name: 'Studio A',
    contact_email: null,
  })
  assertEq(without?.contactEmail, null, 'parser keeps null email')
  console.log('PASS  5. public notice contact line behavior')
}

{
  assert(
    register.includes('const REGISTRATION_ENABLED = false'),
    'registration remains locked',
  )
  console.log('PASS  6. registration lock')
}

console.log('\nPASS  studio contact email acceptance\n')
