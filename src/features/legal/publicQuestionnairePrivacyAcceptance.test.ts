/**
 * Public questionnaire privacy controller — static security + UI contracts.
 * No live tokens / PII in assertions.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parsePublicQuestionnaireController,
} from '@/features/legal/publicQuestionnaireController'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const MIGRATION =
  'supabase/migrations/20260907210000_public_questionnaire_privacy_controller.sql'

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL  public questionnaire privacy — ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), `${msg} (missing: ${needle})`)
}

function assertNotIncludes(hay: string, needle: string, msg: string) {
  assert(!hay.includes(needle), `${msg} (unexpected: ${needle})`)
}

{
  const sql = read(MIGRATION)
  assertIncludes(
    sql,
    'create or replace function public.resolve_public_controller_identity',
    'resolver exists',
  )
  assertIncludes(sql, 'studio_details.company_name', 'company name source path')
  assertIncludes(sql, 'profiles', 'profile name fallback')
  assertIncludes(sql, 'from public.users u', 'users.name fallback')
  assertIncludes(sql, 'contact_email', 'contact email key')
  assertIncludes(
    sql,
    'Never expose public.users.email',
    'login email not exposed (docs)',
  )
  // Return object must not leak login email from users
  const resolver = sql.slice(
    sql.indexOf('resolve_public_controller_identity'),
    sql.indexOf('public_get_form_by_token'),
  )
  const resolverReturn = resolver.slice(resolver.indexOf('return jsonb_build_object'))
  assert(!/u\.email/.test(resolver), 'resolver does not select users.email')
  assertNotIncludes(resolverReturn, 'nip', 'no NIP in return')
  assertNotIncludes(resolverReturn, 'iban', 'no IBAN in return')
  assertNotIncludes(resolverReturn, 'bank_account', 'no bank in return')
  assertNotIncludes(resolverReturn, 'phone', 'no phone in return')
  assertNotIncludes(resolverReturn, 'logo_path', 'no logo in return')
  assertIncludes(resolverReturn, "'display_name'", 'display_name returned')
  assertIncludes(resolverReturn, "'contact_email'", 'contact_email returned')
  assertIncludes(
    sql,
    'revoke all on function public.resolve_public_controller_identity(uuid) from anon',
    'resolver not callable by anon',
  )
  assertIncludes(sql, "'privacy_controller', privacy_controller", 'form RPC key')
  assertIncludes(sql, "'privacy_controller', privacy_controller", 'prewedding RPC key')
  assertIncludes(
    sql,
    'grant execute on function public.public_get_form_by_token(text) to anon, authenticated',
    'form token RPC anon',
  )
  assertIncludes(
    sql,
    'grant execute on function public.public_get_prewedding_questionnaire(text) to anon, authenticated',
    'prewedding token RPC anon',
  )
  assertIncludes(sql, 'p_token text', 'public getters remain token-keyed')
  assertNotIncludes(
    sql.slice(sql.indexOf('create or replace function public.public_get_form_by_token')),
    'p_user_id',
    'form RPC has no user_id arg',
  )
  assertNotIncludes(
    sql.slice(sql.indexOf('create or replace function public.public_get_prewedding_questionnaire')),
    'p_owner_id',
    'prewedding RPC has no owner_id arg',
  )
  assertNotIncludes(sql, 'update public.weddings', 'no wedding mutation')
  assertNotIncludes(sql, 'update public.users', 'no users mutation')
  assertNotIncludes(sql, 'update public.studio_details', 'no studio mutation')
  console.log('PASS  1. migration security + whitelist')
}

{
  assert(
    parsePublicQuestionnaireController(null) === null,
    'null controller',
  )
  assert(
    parsePublicQuestionnaireController({}) === null,
    'empty object rejected',
  )
  assert(
    parsePublicQuestionnaireController({ display_name: '  ' }) === null,
    'blank name rejected',
  )
  const ok = parsePublicQuestionnaireController({
    display_name: 'Atelier Słońce',
    contact_email: 'kontakt@atelier.example',
    nip: 'should-ignore',
    owner_id: 'should-ignore',
  })
  assert(ok?.displayName === 'Atelier Słońce', 'parses display name')
  assert(ok?.contactEmail === 'kontakt@atelier.example', 'parses email')
  assert(
    !('nip' in (ok as object)) && !('owner_id' in (ok as object)),
    'extra fields dropped',
  )
  const noEmail = parsePublicQuestionnaireController({
    display_name: 'Ada Lovelace',
    contact_email: null,
  })
  assert(noEmail?.contactEmail === null, 'null email allowed')
  console.log('PASS  2. DTO parser minimization')
}

{
  const forms = read('src/lib/api/forms.ts')
  const pre = read('src/lib/api/preweddingQuestionnaireService.ts')
  assertIncludes(forms, 'parsePublicQuestionnaireController', 'form maps controller')
  assertIncludes(forms, 'privacy_controller', 'reads privacy_controller')
  assertIncludes(pre, 'parsePublicQuestionnaireController', 'prewedding maps controller')
  assertIncludes(pre, 'privacy_controller', 'prewedding reads privacy_controller')
  assertNotIncludes(forms, 'from(' + "'studio_details'", 'form client no direct studio_details')
  assertNotIncludes(pre, ".from('studio_details')", 'prewedding client no direct studio_details')
  assertNotIncludes(forms, ".from('profiles')", 'form client no profiles')
  assertNotIncludes(pre, ".from('profiles')", 'prewedding client no profiles')
  console.log('PASS  3. client uses token RPC only')
}

{
  const notice = read('src/features/legal/LegalLinks.tsx')
  const formPage = read('src/features/forms/ProductionContractFormPage.tsx')
  const prePage = read('src/features/prewedding/PreWeddingPublicFormPage.tsx')
  assertIncludes(notice, 'Informacja o przetwarzaniu danych', 'quiet heading')
  assertIncludes(notice, 'Administratorem danych', 'named controller')
  assertIncludes(notice, 'przetwarza dane na jego polecenie', 'processor wording')
  assertIncludes(notice, 'Więcej informacji', 'details disclosure')
  assertIncludes(notice, 'PUODO', 'supervisory authority')
  assertNotIncludes(notice, 'type="checkbox"', 'no consent checkbox')
  assertNotIncludes(notice, 'zgoda na przetwarzanie', 'no processing consent')
  assertIncludes(formPage, 'controller={', 'form wires controller prop')
  assertIncludes(prePage, 'controller={form.privacyController', 'prewedding wires prop')
  // Token-scoped load effects (no cross-token React Query cache)
  assertIncludes(formPage, '[token, authReady]', 'form reloads on token change')
  assertIncludes(prePage, '[token]', 'prewedding reloads on token change')
  console.log('PASS  4. UI + no consent + token-scoped state')
}

{
  const sql = read(MIGRATION)
  // Fallback order documented in SQL comments
  assertIncludes(sql, '1) studio_details.company_name', 'fallback order docs')
  assertIncludes(sql, '2) profiles.first_name + last_name', 'person fallback')
  assertIncludes(sql, '3) public.users.name', 'users.name fallback')
  assertIncludes(
    sql,
    "v_display := coalesce(v_company, v_person, v_user_name)",
    'SQL coalesce order',
  )
  console.log('PASS  5. name fallback order')
}

console.log('\nPASS  public questionnaire privacy controller acceptance')
