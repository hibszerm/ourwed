/**
 * Regression: questionnaire-selected extras must sync to wedding_extra_services.
 *
 * Sync rule (documented):
 * - Additive upsert by extra_service_id
 * - Never delete existing manually added services
 * - Never modify weddings.price or payments
 * - Validate IDs against options_snapshot.additionalServiceOptions
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  planWeddingExtraSync,
  validateSelectedExtraIdsAgainstSnapshot,
} from '@/lib/forms/weddingExtraSyncPlan'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { ensureQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'

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

const snapshotExtras = [
  { id: 'e1', name: 'Drone', price: 500, currency: 'PLN' },
  { id: 'e2', name: 'Same day edit', price: 800, currency: 'PLN' },
]

run('1. selected IDs validated against snapshot', () => {
  const { valid, invalid } = validateSelectedExtraIdsAgainstSnapshot(
    ['e1', 'bad'],
    snapshotExtras,
  )
  assertEq(valid.join(','), 'e1', 'valid')
  assertEq(invalid.join(','), 'bad', 'invalid')
})

run('2–3. valid services planned for create/merge wedding', () => {
  const plan = planWeddingExtraSync(['e1', 'e2'], [])
  assertEq(plan.toInsert.join(','), 'e1,e2', 'insert both')
  assertEq(plan.toSkip.length, 0, 'none skipped')
})

run('4. wedding details source is wedding_extra_services', () => {
  const detail = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailPackage.tsx',
    ),
    'utf8',
  )
  const svc = readFileSync(
    resolve(process.cwd(), 'src/lib/api/weddingExtraServiceService.ts'),
    'utf8',
  )
  assert(detail.includes('wedding-extras'), 'query key')
  assert(svc.includes("from('wedding_extra_services')"), 'table')
})

run('5. duplicate submission does not duplicate associations', () => {
  const plan = planWeddingExtraSync(['e1', 'e2'], ['e1'])
  assertEq(plan.toInsert.join(','), 'e2', 'only missing')
  assertEq(plan.toSkip.join(','), 'e1', 'existing skipped')
  const again = planWeddingExtraSync(['e1', 'e2'], ['e1', 'e2'])
  assertEq(again.toInsert.length, 0, 'idempotent')
})

run('6. invalid IDs rejected when allow-list present', () => {
  const { invalid } = validateSelectedExtraIdsAgainstSnapshot(
    ['nope'],
    snapshotExtras,
  )
  assertEq(invalid.length, 1, 'rejected')
})

run('7. existing manually added services preserved (additive sync)', () => {
  const plan = planWeddingExtraSync(['e2'], ['manual-extra'])
  assertEq(plan.toInsert.join(','), 'e2', 'insert selected')
  assert(
    !plan.toInsert.includes('manual-extra') &&
      !plan.toSkip.includes('manual-extra'),
    'manual not touched for deletion',
  )
  // Deselection of e1 that was never selected here does not remove manual-extra
  assertEq(plan.toSkip.length, 0, 'no deletes planned')
})

run('8. deselection rule documented as additive (no deletes)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/syncWeddingExtrasFromQuestionnaire.ts'),
    'utf8',
  )
  const plan = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/weddingExtraSyncPlan.ts'),
    'utf8',
  )
  assert(src.includes('Never delete'), 'documents no-delete')
  assert(/additive/i.test(src), 'documents additive')
  assert(plan.includes('Deselection never deletes'), 'plan docs')
})

run('9–10. commercial price is recomputed from package + extras (not incremental)', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/syncWeddingExtrasFromQuestionnaire.ts'),
    'utf8',
  )
  const pricing = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/weddingExtraPricing.ts'),
    'utf8',
  )
  const rpc = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260725220000_questionnaire_extras_update_contract_value.sql',
    ),
    'utf8',
  )
  assert(pricing.includes('packageBasePrice'), 'formula helper')
  assert(src.includes('packageBase +'), 'sync docs formula')
  assert(rpc.includes('contract_value = next_value'), 'rpc updates price')
  assert(!rpc.includes('insert into public.payments'), 'no payments')
})

run('11. public questionnaire still names only for extras', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: [{ id: 'p1', name: 'Pakiet', price: 1, currency: 'PLN' }],
    additionalServices: snapshotExtras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  const ex = tpl.questions.find(
    (q) => q.fieldKey === 'selectedAdditionalServiceIds',
  )
  assertEq(ex?.options?.[0]?.label, 'Drone', 'name')
  assert(ex?.options?.[0]?.price == null, 'no price on public option')
})

run('12. completion notification path unchanged in RPC', () => {
  const rpc = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260725220000_questionnaire_extras_update_contract_value.sql',
    ),
    'utf8',
  )
  assert(rpc.includes('questionnaire_completed'), 'timeline')
  assert(rpc.includes('Nowa ankieta złożona'), 'notification')
})

run('13. submit syncs in RPC transaction + approve/service path', () => {
  const rpc = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260725220000_questionnaire_extras_update_contract_value.sql',
    ),
    'utf8',
  )
  const approve = readFileSync(
    resolve(process.cwd(), 'src/lib/api/questionnaireService.ts'),
    'utf8',
  )
  assert(rpc.includes('wedding_extra_services'), 'rpc writes relation')
  assert(
    approve.includes('syncWeddingExtrasFromQuestionnaireAnswer'),
    'approve syncs',
  )
  assert(
    approve.includes('recomputeContractValueAfterExtrasSync'),
    'approve prices',
  )
})

run('14. first-load extras field still present', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: [{ id: 'p1', name: 'Pakiet', price: 1, currency: 'PLN' }],
    additionalServices: snapshotExtras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  assert(
    Boolean(
      tpl.questions.find((q) => q.fieldKey === 'selectedAdditionalServiceIds'),
    ),
    'extras question',
  )
})
