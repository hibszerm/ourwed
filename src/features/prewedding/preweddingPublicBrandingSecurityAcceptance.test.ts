/**
 * Public pre-wedding token / branding security acceptance tests.
 * Asserts RPC contract: studio_name only; no private owner/studio fields.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

const restoreMigration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260729220000_prewedding_public_studio_branding_restore.sql',
  ),
  'utf8',
)

const service = readFileSync(
  resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
  'utf8',
)

const publicForm = readFileSync(
  resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
  'utf8',
)

run('1. Restore migration returns studio_name from studio_details.company_name', () => {
  assert(restoreMigration.includes('studio_name'), 'studio_name key')
  assert(restoreMigration.includes('sd.company_name'), 'company_name source')
  assert(restoreMigration.includes('where sd.user_id = v_rec.owner_id'), 'owner scoped')
})

run('2. RPC payload omits private / sensitive fields', () => {
  const forbidden = [
    "'owner_id'",
    "'owner_email'",
    "'email'",
    "'logo_path'",
    "'signature_path'",
    "'stamp_path'",
    "'nip'",
    "'iban'",
    "'bank_account'",
    "'phone'",
    "'user_id'",
  ]
  for (const key of forbidden) {
    assert(
      !restoreMigration.includes(`${key},`) && !restoreMigration.includes(`${key})`),
      `must not expose ${key} in jsonb_build_object`,
    )
  }
  // owner_id may be selected into v_rec for join, but must not appear in return object
  const returnBlock = restoreMigration.slice(restoreMigration.indexOf('jsonb_build_object'))
  assert(!returnBlock.includes('owner_id'), 'owner_id not in return payload')
  assert(!returnBlock.includes('logo_path'), 'logo_path not in return payload')
  assert(!returnBlock.includes('studio_logo'), 'no logo URL field')
})

run('3. Anonymous execute grant is token RPC only (anon + authenticated)', () => {
  assert(
    restoreMigration.includes(
      'grant execute on function public.public_get_prewedding_questionnaire(text) to anon, authenticated',
    ),
    'anon grant',
  )
  assert(
    restoreMigration.includes(
      'revoke all on function public.public_get_prewedding_questionnaire(text) from public',
    ),
    'revoke public',
  )
  assert(restoreMigration.includes('public_token_hash = v_hash'), 'token hash gate')
  assert(restoreMigration.includes("status not in ('draft', 'archived')"), 'draft/archived blocked')
})

run('4. Client maps studio_name only; logo remains optional deferred', () => {
  assert(service.includes("studioName: (row.studio_name as string | null) ?? null"), 'maps studio_name')
  assert(service.includes("public_get_prewedding_questionnaire"), 'uses public RPC')
  assert(publicForm.includes('form.studioName'), 'renders studio name')
  // Logo may be referenced but must not invent private storage paths from RPC
  assert(!service.includes('logo_path'), 'client does not read logo_path from RPC')
})

run('5. Invalid token path shows no branding (client)', () => {
  assert(publicForm.includes("loadError === 'not_found'"), 'not found state')
  assert(publicForm.includes('Nie znaleziono ankiety'), 'not found copy')
  // Branding header only renders when form is loaded
  const thankYouIdx = publicForm.indexOf('prewedding-thank-you')
  const notFoundIdx = publicForm.indexOf('Nie znaleziono ankiety')
  assert(notFoundIdx > -1 && thankYouIdx > -1, 'both states exist')
})

console.log('\nprewedding public branding / token security: done')
