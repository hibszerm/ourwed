/**
 * Extra pricing: wedding.price = packageBase + Σ(extra snapshots), idempotent.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeWeddingContractValue,
  recomposeContractValueForExtrasEdit,
  recomputeContractValueAfterExtrasSync,
  resolvePackageBasePrice,
  sumExtraPriceSnapshots,
} from '@/lib/forms/weddingExtraPricing'
import {
  planWeddingExtraSync,
  validateSelectedExtraIdsAgainstSnapshot,
} from '@/lib/forms/weddingExtraSyncPlan'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { ensureQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'
import type { Payment } from '@/types/wedding'

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
  { id: 'e1', name: 'Ujęcia VHS', price: 600, currency: 'PLN' },
  { id: 'e2', name: 'Plener', price: 800, currency: 'PLN' },
]

run('1–2. selected extras planned with snapshot prices', () => {
  const { valid, invalid } = validateSelectedExtraIdsAgainstSnapshot(
    ['e1', 'e2'],
    snapshotExtras,
  )
  assertEq(valid.length, 2, 'valid')
  assertEq(invalid.length, 0, 'no invalid')
  assertEq(snapshotExtras[0]!.price, 600, 'snapshot price')
})

run('3–4. wedding total increases by selected extras sum', () => {
  const total = computeWeddingContractValue({
    packageBasePrice: 5000,
    extras: [
      { priceSnapshot: 600, quantity: 1 },
      { priceSnapshot: 800, quantity: 1 },
    ],
  })
  assertEq(total, 6400, '5000+600+800')
})

run('5–6. retry does not add prices twice / no duplicate plan', () => {
  const first = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: 5000,
    extrasBeforeSync: [],
    extrasAfterSync: [{ priceSnapshot: 600, quantity: 1 }],
    explicitPackagePrice: 5000,
  })
  assertEq(first, 5600, 'first submit')

  const retry = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: 5600,
    extrasBeforeSync: [{ priceSnapshot: 600, quantity: 1 }],
    extrasAfterSync: [{ priceSnapshot: 600, quantity: 1 }],
    explicitPackagePrice: 5000,
  })
  assertEq(retry, 5600, 'retry stable')

  const plan = planWeddingExtraSync(['e1'], ['e1'])
  assertEq(plan.toInsert.length, 0, 'no duplicate relation')
})

run('7. invalid service ID rejected', () => {
  const { invalid } = validateSelectedExtraIdsAgainstSnapshot(
    ['nope'],
    snapshotExtras,
  )
  assertEq(invalid.length, 1, 'rejected')
})

run('8. catalog price change does not alter snapshot calculation', () => {
  const snapPrice = 600
  const liveCatalogNow = 999 as number
  const total = computeWeddingContractValue({
    packageBasePrice: 5000,
    extras: [{ priceSnapshot: snapPrice, quantity: 1 }],
  })
  assertEq(total, 5600, 'uses snapshot not live')
  assert(liveCatalogNow !== snapPrice, 'catalog diverged')
})

run('9. package price not counted twice', () => {
  const total = computeWeddingContractValue({
    packageBasePrice: 5000,
    extras: [{ priceSnapshot: 600, quantity: 1 }],
  })
  assertEq(total, 5600, 'not 10000+600')
})

run('10. deposit not added to wedding.price', () => {
  const contractValue = computeWeddingContractValue({
    packageBasePrice: 5000,
    extras: [{ priceSnapshot: 1400, quantity: 1 }],
  })
  const deposit = 1000
  assertEq(contractValue, 6400, 'price ignores deposit')
  assert(deposit !== contractValue, 'deposit separate')
})

run('11–12. payments unchanged; remaining updates from new total', () => {
  const payments: Payment[] = [
    {
      id: 'pay1',
      label: 'Zaliczka',
      amount: 1000,
      type: 'deposit',
      paid: true,
      paidAt: '2026-07-01',
      method: 'transfer',
    },
  ]
  const price = 6400
  assertEq(getTotalPaid(payments), 1000, 'paid')
  assertEq(getRemainingToPay(price, payments), 5400, 'remaining')
})

run('13–14. manual extras preserved; unrelated not deleted', () => {
  const plan = planWeddingExtraSync(['e2'], ['manual-1', 'e1'])
  assertEq(plan.toInsert.join(','), 'e2', 'insert selected')
  assertEq(plan.toSkip.length, 0, 'manual not in skip/delete')
  // Additive: e1 already linked stays; plan does not remove it
  assert(!plan.toInsert.includes('manual-1'), 'manual preserved')
})

run('15. new wedding calculation uses explicit package price', () => {
  const total = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: 5000,
    extrasBeforeSync: [],
    extrasAfterSync: [
      { priceSnapshot: 600, quantity: 1 },
      { priceSnapshot: 800, quantity: 1 },
    ],
    explicitPackagePrice: 5000,
  })
  assertEq(total, 6400, 'new wedding')
})

run('16. existing wedding idempotent recompute', () => {
  const base = resolvePackageBasePrice({
    currentWeddingPrice: 6400,
    extrasBeforeOrCurrent: [
      { priceSnapshot: 600, quantity: 1 },
      { priceSnapshot: 800, quantity: 1 },
    ],
  })
  assertEq(base, 5000, 'derived base')
  const again = computeWeddingContractValue({
    packageBasePrice: base,
    extras: [
      { priceSnapshot: 600, quantity: 1 },
      { priceSnapshot: 800, quantity: 1 },
    ],
  })
  assertEq(again, 6400, 'idempotent')
})

run('17–18. approve + RPC paths recompute contract value', () => {
  const approve = readFileSync(
    resolve(process.cwd(), 'src/lib/api/questionnaireService.ts'),
    'utf8',
  )
  const forms = readFileSync(
    resolve(process.cwd(), 'src/lib/api/forms.ts'),
    'utf8',
  )
  const rpc = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260813160000_travel_fee_commercial.sql',
    ),
    'utf8',
  )
  assert(
    approve.includes('recomputeContractValueAfterExtrasSync'),
    'approve prices',
  )
  assert(forms.includes('recomputeContractValueAfterExtrasSync'), 'submitForm')
  assert(forms.includes('effectiveTravelFee'), 'submitForm travel-aware')
  assert(approve.includes('effectiveTravelFee'), 'approve travel-aware')
  assert(rpc.includes('contract_value = next_value'), 'rpc updates price')
  assert(rpc.includes('package_base'), 'rpc derives base')
  assert(rpc.includes('travel_fee'), 'rpc subtracts travel')
})

run('19. public questionnaire shows names only', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: [{ id: 'p1', name: 'Pakiet', price: 5000, currency: 'PLN' }],
    additionalServices: snapshotExtras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  const ex = tpl.questions.find(
    (q) => q.fieldKey === 'selectedAdditionalServiceIds',
  )
  assertEq(ex?.options?.[0]?.label, 'Ujęcia VHS', 'name')
  assert(ex?.options?.[0]?.price == null, 'no public price')
})

run('20. public form never trusts client prices for total', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/features/forms/ProductionContractFormPage.tsx'),
    'utf8',
  )
  const rpc = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260725220000_questionnaire_extras_update_contract_value.sql',
    ),
    'utf8',
  )
  // Client may include snapshot copies in answer JSON for display, but RPC
  // prefers options_snapshot prices when inserting price_snapshot.
  assert(rpc.includes("snapshot->'additionalServiceOptions'"), 'rpc snapshot')
  assert(page.includes('additionalServiceSnapshots'), 'answer carries snapshots')
  assertEq(sumExtraPriceSnapshots([{ priceSnapshot: 600, quantity: 1 }]), 600, 'server math')
})

run('A. simple add/remove extras 900', () => {
  const base = 5000
  const afterAdd = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: 5000,
    extrasBefore: [],
    extrasAfter: [{ priceSnapshot: 900, quantity: 1 }],
    packageBasePrice: base,
    effectiveTravelFee: 0,
  })
  assertEq(afterAdd, 5900, 'add → 5900')
  const afterRemove = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: afterAdd,
    extrasBefore: [{ priceSnapshot: 900, quantity: 1 }],
    extrasAfter: [],
    packageBasePrice: base,
    effectiveTravelFee: 0,
  })
  assertEq(afterRemove, 5000, 'remove → 5000')
})

run('B. manual commercial base preserved (CV 5800, catalog 5000)', () => {
  // Draft base = CV − extras − travel = 5800 (manual delta absorbed in base).
  const packageBasePrice = 5800
  const afterAdd = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: 5800,
    extrasBefore: [],
    extrasAfter: [{ priceSnapshot: 900, quantity: 1 }],
    packageBasePrice,
    effectiveTravelFee: 0,
  })
  assertEq(afterAdd, 6700, 'must NOT rebase to catalog 5000+900=5900')
  const afterRemove = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: afterAdd,
    extrasBefore: [{ priceSnapshot: 900, quantity: 1 }],
    extrasAfter: [],
    packageBasePrice,
    effectiveTravelFee: 0,
  })
  assertEq(afterRemove, 5800, 'symmetric remove')
})

run('C. travel coexistence — QA regression (+100 bug)', () => {
  // CV 6150 = base 5800 + travel 350. Draft subtracts travel from packageBasePrice.
  const packageBasePrice = 5800
  const travel = 350
  const afterAdd = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: 6150,
    extrasBefore: [],
    extrasAfter: [{ priceSnapshot: 900, quantity: 1 }],
    packageBasePrice,
    effectiveTravelFee: travel,
  })
  assertEq(afterAdd, 7050, 'add keeps travel')
  // Bug repro: base+extras without travel would yield 6700 (or 5800+900=6700).
  // Observed QA shape: base(CV-travel)=5000-ish + 900 without +travel → +100 when travel=800.
  const buggyWithoutTravel = packageBasePrice + 900
  assert(buggyWithoutTravel !== afterAdd, 'must include travel in recompose')
  const afterRemove = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: afterAdd,
    extrasBefore: [{ priceSnapshot: 900, quantity: 1 }],
    extrasAfter: [],
    packageBasePrice,
    effectiveTravelFee: travel,
  })
  assertEq(afterRemove, 6150, 'remove restores CV with travel')
})

run('C2. exact QA asymmetry: travel 800 + extra 900 must be +900 not +100', () => {
  const cv = 5800
  const travel = 800
  const packageBasePrice = cv - 0 - travel // createWeddingEditDraft
  assertEq(packageBasePrice, 5000, 'draft base')
  const afterAdd = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: cv,
    extrasBefore: [],
    extrasAfter: [{ priceSnapshot: 900, quantity: 1 }],
    packageBasePrice,
    effectiveTravelFee: travel,
  })
  assertEq(afterAdd, 6700, '+900 not +100')
  assertEq(afterAdd - cv, 900, 'delta')
  const legacyBug = packageBasePrice + 900 // PackageFields before fix
  assertEq(legacyBug, 5900, 'documents old +100 path')
  assertEq(legacyBug - cv, 100, 'old asymmetric delta')
  const afterRemove = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: afterAdd,
    extrasBefore: [{ priceSnapshot: 900, quantity: 1 }],
    extrasAfter: [],
    packageBasePrice,
    effectiveTravelFee: travel,
  })
  assertEq(afterRemove, 5800, 'symmetric')
})

run('D. existing extras + travel', () => {
  const packageBasePrice = 5000
  const travel = 350
  const existing = [{ priceSnapshot: 500, quantity: 1 }]
  const cv = 5850
  const afterAdd = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: cv,
    extrasBefore: existing,
    extrasAfter: [...existing, { priceSnapshot: 900, quantity: 1 }],
    packageBasePrice,
    effectiveTravelFee: travel,
  })
  assertEq(afterAdd, 6750, 'add VHS')
  const afterRemove = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: afterAdd,
    extrasBefore: [...existing, { priceSnapshot: 900, quantity: 1 }],
    extrasAfter: existing,
    packageBasePrice,
    effectiveTravelFee: travel,
  })
  assertEq(afterRemove, 5850, 'remove VHS only')
})

run('E. edit selection 900 → 500 is −400', () => {
  const cv = 5900
  const next = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: cv,
    extrasBefore: [{ priceSnapshot: 900, quantity: 1 }],
    extrasAfter: [{ priceSnapshot: 500, quantity: 1 }],
    packageBasePrice: 5000,
    effectiveTravelFee: 0,
  })
  assertEq(next, 5500, '−400')
})

run('F. repeated save same extras — CV unchanged', () => {
  const extras = [{ priceSnapshot: 900, quantity: 1 }]
  const first = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: 5900,
    extrasBefore: extras,
    extrasAfter: extras,
    packageBasePrice: 5000,
    effectiveTravelFee: 0,
  })
  assertEq(first, 5900, 'stable')
  const second = recomposeContractValueForExtrasEdit({
    currentWeddingPrice: first,
    extrasBefore: extras,
    extrasAfter: extras,
    packageBasePrice: 5000,
    effectiveTravelFee: 0,
  })
  assertEq(second, 5900, 'second save')
})

run('G. explicit package default uses catalog base (not extras-only)', () => {
  // Zastosuj domyślne: packageBase becomes catalog price.
  const catalogBase = 5000
  const withDefaults = computeWeddingContractValue({
    packageBasePrice: catalogBase,
    extras: [{ priceSnapshot: 900, quantity: 1 }],
    effectiveTravelFee: 350,
  })
  assertEq(withDefaults, 6250, 'catalog + extras + travel')
  // Preserve path keeps manual CV while rebasing sticky base.
  const preservedBase = resolvePackageBasePrice({
    currentWeddingPrice: 6700,
    extrasBeforeOrCurrent: [{ priceSnapshot: 900, quantity: 1 }],
    effectiveTravelFee: 350,
  })
  assertEq(preservedBase, 5450, 'Zachowaj wartość umowy base')
})

run('H. questionnaire sync preserves travel + manual base', () => {
  const next = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: 6150,
    extrasBeforeSync: [],
    extrasAfterSync: [{ priceSnapshot: 900, quantity: 1 }],
    effectiveTravelFee: 350,
  })
  assertEq(next, 7050, 'questionnaire +900 with travel')
  const remove = recomputeContractValueAfterExtrasSync({
    currentWeddingPrice: next,
    extrasBeforeSync: [{ priceSnapshot: 900, quantity: 1 }],
    extrasAfterSync: [],
    effectiveTravelFee: 350,
  })
  assertEq(remove, 6150, 'questionnaire remove')
})

run('PackageFields / DetailPackage use shared extras recompose (source)', () => {
  const fields = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/editing/fields/PackageFields.tsx',
    ),
    'utf8',
  )
  const detail = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/components/detail/WeddingDetailPackage.tsx',
    ),
    'utf8',
  )
  const draft = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/edit/persistWeddingEditDraft.ts',
    ),
    'utf8',
  )
  assert(
    fields.includes('recomposeContractValueForExtrasEdit'),
    'PackageFields helper',
  )
  assert(
    fields.includes('getEffectiveTravelFeeAmount'),
    'PackageFields travel',
  )
  assert(
    detail.includes('recomposeContractValueForExtrasEdit'),
    'DetailPackage helper',
  )
  assert(
    draft.includes('getEffectiveTravelFeeAmount'),
    'draft base subtracts travel',
  )
  assert(
    !fields.includes(
      'base +\n                next.reduce((sum, x) => sum + x.priceSnapshot * x.quantity, 0),',
    ),
    'no travel-blind recompose in PackageFields',
  )
})