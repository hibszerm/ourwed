/**
 * Form instances ownership + public DTO + trusted pricing migration acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/db/formInstancesSecurityAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok — ${name}`)
  } catch (e) {
    console.error(`FAIL — ${name}`)
    throw e
  }
}

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260908190000_form_instances_ownership_public_dto_pricing.sql',
)
const sql = readFileSync(MIGRATION, 'utf8')
const sync = readFileSync(
  resolve(process.cwd(), 'src/lib/forms/syncWeddingExtrasFromQuestionnaire.ts'),
  'utf8',
)

run('INSERT policy requires wedding ownership or null wedding_id', () => {
  assert(sql.includes('form_instances_insert_own'), 'insert policy')
  assert(sql.includes('wedding_id is null or public.is_wedding_owner(wedding_id)'), 'owner check')
  assert(sql.includes('account_has_pro_access()'), 'pro gate kept')
})

run('UPDATE policy requires wedding ownership or null wedding_id', () => {
  assert(sql.includes('form_instances_update_own'), 'update policy')
  const updateIdx = sql.indexOf('form_instances_update_own')
  const chunk = sql.slice(updateIdx, updateIdx + 800)
  assert(chunk.includes('is_wedding_owner(wedding_id)'), 'update owner')
})

run('public_get_form_by_token builds explicit DTO without ownership IDs', () => {
  assert(sql.includes('instance_public := jsonb_build_object'), 'instance dto')
  assert(sql.includes('form_public := jsonb_build_object'), 'form dto')
  assert(!/instance_public :=[\s\S]{0,400}'user_id'/.test(sql), 'no instance user_id')
  assert(!/instance_public :=[\s\S]{0,400}'wedding_id'/.test(sql), 'no instance wedding_id')
  assert(!/form_public :=[\s\S]{0,400}'user_id'/.test(sql), 'no form user_id')
  assert(sql.includes("'schema', form_row.schema"), 'keeps schema')
  assert(sql.includes("'status', inst.status"), 'keeps status')
  assert(sql.includes("'privacy_controller', privacy_controller"), 'privacy')
})

run('public_submit fails closed without trusted extra price', () => {
  assert(sql.includes("raise exception 'MISSING_TRUSTED_PRICE'"), 'fail closed')
  assert(!sql.includes("p_answer_json->'additionalServiceSnapshots'"), 'no client prices')
  assert(sql.includes("coalesce(snapshot->'additionalServiceOptions'"), 'snapshot prices')
})

run('client sync no longer falls back to answerJson prices', () => {
  // Executable path: only optionsSnapshot catalog; comment may mention answerJson.
  assert(sync.includes('return fromOptions'), 'uses options snapshot')
  assert(
    /if \(catalog\.length === 0\)[\s\S]{0,80}MISSING_TRUSTED_PRICE/.test(sync),
    'empty catalog fails closed',
  )
  assert(
    !/priceSnapshot:\s*(fromAnswer|answerJson|snapFromClient)/.test(sync),
    'no client price assignment',
  )
  assert(sync.includes('priceSnapshot: snap.price'), 'uses trusted snap price')
})

console.log('ok — formInstancesSecurityAcceptance')
