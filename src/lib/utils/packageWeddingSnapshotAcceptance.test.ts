/**
 * Final payment terms + package → wedding snapshot acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/packageWeddingSnapshotAcceptance.test.ts
 */

import {
  applyCommercialPackageSnapshot,
  buildCreateWeddingCommercialFromPackage,
  getWeddingCommercialSummary,
} from './commercial'
import {
  formatFinalPaymentTerms,
  isFinalPaymentTermsSatisfied,
  normalizeFinalPaymentTerms,
  parseFinalPaymentTerms,
  resolveFinalPaymentDueDate,
  validateFinalPaymentTerms,
  type FinalPaymentTerms,
} from './finalPaymentTerms'
import {
  buildReferenceCompany,
  buildReferenceStudioPackage,
  buildReferenceWedding,
} from '@/lib/dev/referenceWedding'
import { evaluateWeddingContractReadiness } from './weddingContractReadiness'
import type { StudioPackage } from '@/types/package'
import type { Wedding } from '@/types/wedding'

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

run('D1. final payment modes format in Polish', () => {
  assertEq(
    formatFinalPaymentTerms({ mode: 'wedding_day' }),
    'W dniu ślubu',
    'wedding_day',
  )
  assertEq(
    formatFinalPaymentTerms({ mode: 'days_after_wedding', value: 14 }),
    'Do 14 dni od daty ślubu',
    'days',
  )
  assertEq(
    formatFinalPaymentTerms({ mode: 'months_after_wedding', value: 3 }),
    'Do 3 miesięcy od daty ślubu',
    'months',
  )
  assertEq(
    formatFinalPaymentTerms({ mode: 'after_delivery' }),
    'Po oddaniu materiału',
    'after_delivery',
  )
})

run('D2. validation rejects missing / zero / negative / incomplete', () => {
  assertEq(validateFinalPaymentTerms(null), 'Wybierz termin płatności końcowej.', 'null')
  assert(
    validateFinalPaymentTerms({
      mode: 'days_after_wedding',
      value: 0,
    }) != null,
    'zero',
  )
  assert(
    validateFinalPaymentTerms({
      mode: 'days_after_wedding',
      value: -1,
    }) != null,
    'negative',
  )
  assertEq(
    parseFinalPaymentTerms({ mode: 'days_after_wedding' }),
    null,
    'missing value',
  )
  assertEq(
    JSON.stringify(parseFinalPaymentTerms({ mode: 'wedding_day', value: 99 })),
    JSON.stringify({ mode: 'wedding_day' }),
    'strip unused value',
  )
  assertEq(
    JSON.stringify(normalizeFinalPaymentTerms({ mode: 'wedding_day' })),
    JSON.stringify({ mode: 'wedding_day' }),
    'normalize wedding_day',
  )
})

run('D3. resolve concrete dates from modes', () => {
  assertEq(
    resolveFinalPaymentDueDate({
      terms: { mode: 'wedding_day' },
      weddingDate: '2026-07-24',
    }),
    '2026-07-24',
    'wedding_day',
  )
  assertEq(
    resolveFinalPaymentDueDate({
      terms: { mode: 'days_after_wedding', value: 14 },
      weddingDate: '2026-07-24',
    }),
    '2026-08-07',
    'days',
  )
  assertEq(
    resolveFinalPaymentDueDate({
      terms: { mode: 'months_after_wedding', value: 3 },
      weddingDate: '2026-07-24',
    }),
    '2026-10-24',
    'months',
  )
  assertEq(
    resolveFinalPaymentDueDate({
      terms: { mode: 'after_delivery' },
      weddingDate: '2026-07-24',
    }),
    null,
    'after_delivery without date',
  )
  assertEq(
    resolveFinalPaymentDueDate({
      terms: { mode: 'after_delivery' },
      weddingDate: '2026-07-24',
      deliveryDate: '2026-11-01',
    }),
    '2026-11-01',
    'after_delivery with date',
  )
})

run('A. questionnaire-style create snapshot copies all commercial fields', () => {
  const pkg = buildReferenceStudioPackage({
    price: 11400,
    depositAmount: 1000,
    coverageEndTime: '01:00',
    overtimeRate: 500,
    deliveryMonths: 6,
    finalPaymentTerms: { mode: 'wedding_day' },
  })
  const snap = buildCreateWeddingCommercialFromPackage({
    weddingDate: '2026-09-12',
    pkg,
    overrides: {
      price: 11400,
      depositAmount: 1000,
      packageName: pkg.name,
    },
  })
  assertEq(snap.packageId, pkg.id, 'packageId')
  assertEq(snap.packageName, pkg.name, 'packageName')
  assertEq(snap.price, 11400, 'price')
  assertEq(snap.depositAmount, 1000, 'deposit')
  assertEq(snap.coverageEndTime, '01:00', 'coverageEndTime')
  assertEq(snap.overtimeRate, 500, 'overtimeRate')
  assertEq(snap.deliveryMonths, 6, 'deliveryMonths')
  assertEq(snap.finalPaymentTerms?.mode, 'wedding_day', 'finalPaymentTerms')
  assertEq(snap.finalPaymentDueDate, '2026-09-12', 'finalPaymentDueDate')
  assert(snap.packageItems.length >= 4, 'packageItems')

  const wedding: Wedding = {
    ...buildReferenceWedding(),
    ...snap,
    date: '2026-09-12',
    payments: [],
  }
  const ready = evaluateWeddingContractReadiness(
    wedding,
    buildReferenceCompany(),
  )
  const blockers = ready.items.filter(
    (i) =>
      i.status === 'missing' &&
      [
        'package_coverage_end',
        'package_overtime',
        'package_delivery',
        'pay_final_due',
      ].includes(i.id),
  )
  assertEq(blockers.length, 0, 'no false commercial blockers')
})

run('B. package edit does not mutate existing wedding snapshot', () => {
  const pkg = buildReferenceStudioPackage()
  const wedding = buildReferenceWedding()
  const frozen = {
    end: wedding.coverageEndTime,
    overtime: wedding.overtimeRate,
    delivery: wedding.deliveryMonths,
    terms: wedding.finalPaymentTerms,
  }
  const mutated: StudioPackage = {
    ...pkg,
    coverageEndTime: '03:00',
    overtimeRate: 999,
    deliveryMonths: 1,
    finalPaymentTerms: { mode: 'after_delivery' },
  }
  assertEq(wedding.coverageEndTime, frozen.end, 'end')
  assertEq(wedding.overtimeRate, frozen.overtime, 'overtime')
  assertEq(wedding.deliveryMonths, frozen.delivery, 'delivery')
  assertEq(wedding.finalPaymentTerms?.mode, frozen.terms?.mode, 'terms')
  assertEq(mutated.coverageEndTime, '03:00', 'catalog changed')
})

run('C. wedding override is used; package unchanged', () => {
  const pkg = buildReferenceStudioPackage()
  const wedding = buildReferenceWedding({
    overtimeRate: 777,
    deliveryMonths: 9,
  })
  assertEq(pkg.overtimeRate, 1400, 'package overtime')
  assertEq(pkg.deliveryMonths, 4, 'package delivery')
  assertEq(wedding.overtimeRate, 777, 'wedding overtime')
  assertEq(wedding.deliveryMonths, 9, 'wedding delivery')
  const summary = getWeddingCommercialSummary(wedding)
  assertEq(summary.overtimeRate, 777, 'summary uses wedding')
  assertEq(summary.deliveryMonths, 9, 'summary delivery')
})

run('E. after_delivery satisfies readiness without concrete date', () => {
  assert(
    isFinalPaymentTermsSatisfied({
      terms: { mode: 'after_delivery' },
      dueDate: null,
    }),
    'after_delivery ok',
  )
  assert(
    !isFinalPaymentTermsSatisfied({
      terms: null,
      dueDate: null,
    }),
    'missing not ok',
  )
  const wedding = buildReferenceWedding({
    finalPaymentTerms: { mode: 'after_delivery' },
    finalPaymentDueDate: null,
  })
  const item = evaluateWeddingContractReadiness(
    wedding,
    buildReferenceCompany(),
  ).items.find((i) => i.id === 'pay_final_due')
  assertEq(item?.status, 'complete', 'readiness after_delivery')
})

run('reapply snapshot copies package terms explicitly', () => {
  const pkg = buildReferenceStudioPackage({
    finalPaymentTerms: { mode: 'months_after_wedding', value: 2 },
    coverageEndTime: '02:15',
  })
  const wedding = buildReferenceWedding({
    coverageEndTime: null,
    finalPaymentTerms: null,
    finalPaymentDueDate: null,
  })
  const snap = applyCommercialPackageSnapshot(wedding, pkg, 0)
  assertEq(snap.coverageEndTime, '02:15', 'end copied')
  assertEq(snap.finalPaymentTerms?.mode, 'months_after_wedding', 'terms')
  assertEq(
    (snap.finalPaymentTerms as FinalPaymentTerms & { value: number }).value,
    2,
    'value',
  )
})

if (!process.exitCode) {
  console.log('\nAll package→wedding snapshot tests passed.')
}
