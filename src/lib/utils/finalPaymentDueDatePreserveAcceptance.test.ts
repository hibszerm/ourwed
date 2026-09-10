/**
 * Package switch preserve-CV must keep wedding-level finalPaymentDueDate.
 * Run: npx tsx --tsconfig tsconfig.app.json src/lib/utils/finalPaymentDueDatePreserveAcceptance.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyCommercialPackageSnapshot } from './commercial'
import { buildReferenceStudioPackage, buildReferenceWedding } from '@/lib/dev/referenceWedding'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

{
  const wedding = buildReferenceWedding({
    finalPaymentDueDate: '2027-12-15',
    finalPaymentTerms: { mode: 'days_after_wedding', value: 14 },
    price: 9000,
    depositAmount: 1000,
  })
  const pkg = buildReferenceStudioPackage({
    price: 12000,
    depositAmount: 2000,
    finalPaymentTerms: { mode: 'months_after_wedding', value: 1 },
  })

  const preserved = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 0,
    effectiveTravelFee: 0,
    preserveContractValue: true,
    preserveDeposit: true,
    preserveFinalPaymentDueDate: true,
  })
  assert.equal(preserved.price, 9000, 'preserve CV')
  assert.equal(preserved.depositAmount, 1000, 'preserve deposit')
  assert.equal(
    preserved.finalPaymentDueDate,
    '2027-12-15',
    'preserve explicit deadline',
  )

  const applied = applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: 0,
    effectiveTravelFee: 0,
    preserveContractValue: false,
    preserveDeposit: false,
    preserveFinalPaymentDueDate: false,
  })
  assert.notEqual(
    applied.finalPaymentDueDate,
    '2027-12-15',
    'apply defaults may rewrite deadline',
  )
}

{
  const fields = read(
    'src/features/weddings/detail/editing/fields/PackageFields.tsx',
  )
  const detail = read(
    'src/features/weddings/components/detail/WeddingDetailPackage.tsx',
  )
  assert.ok(
    fields.includes('preserveFinalPaymentDueDate: preserveFinancialAgreement'),
    'PackageFields preserve path keeps deadline',
  )
  assert.ok(
    detail.includes('preserveFinalPaymentDueDate: preserveFinancialAgreement'),
    'WeddingDetailPackage preserve path keeps deadline',
  )
}

console.log('finalPaymentDueDatePreserveAcceptance: ok')
