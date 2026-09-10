/**
 * Path B package commercial resolution from options_snapshot.
 * Run: npx tsx src/lib/forms/pathBPackageCommercialAcceptance.test.ts
 */
import assert from 'node:assert/strict'
import {
  canApprovePathBPackage,
  resolvePathBPackageCommercial,
} from './pathBPackageCommercial'
import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import type { StudioPackage } from '@/types/package'

function pkg(partial: Partial<StudioPackage> & { id: string; name: string }): StudioPackage {
  return {
    id: partial.id,
    name: partial.name,
    slug: partial.slug ?? 'pkg',
    description: partial.description ?? null,
    price: partial.price ?? 0,
    depositAmount: partial.depositAmount ?? 0,
    currency: partial.currency ?? 'PLN',
    color: partial.color ?? '#000',
    isActive: partial.isActive ?? true,
    sortOrder: partial.sortOrder ?? 0,
    items: partial.items ?? [],
    questionnaireFormId: partial.questionnaireFormId ?? null,
    activeContractTemplateId: partial.activeContractTemplateId ?? null,
    activeContractTemplateVersionId:
      partial.activeContractTemplateVersionId ?? null,
    coverageHours: partial.coverageHours ?? null,
    coverageEndTime: partial.coverageEndTime ?? null,
    overtimeRate: partial.overtimeRate ?? null,
    deliveryMonths: partial.deliveryMonths ?? null,
    deliveryDays: partial.deliveryDays ?? null,
    finalPaymentTerms: partial.finalPaymentTerms ?? null,
    createdAt: partial.createdAt ?? '',
    updatedAt: partial.updatedAt ?? '',
  }
}

const snap: FormInstanceOptionsSnapshot = {
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  config: {
    version: 1,
    greeting: '',
    footerText: '',
    showPackages: true,
    allowMultiplePackages: false,
    showAdditionalServices: true,
    packagesRequired: false,
    customFields: [],
  },
  packageOptions: [
    {
      id: 'pkg-a',
      name: 'Pakiet A',
      price: 5000,
      currency: 'PLN',
      depositAmount: 1000,
    },
  ],
  additionalServiceOptions: [],
}

{
  const live = pkg({
    id: 'pkg-a',
    name: 'Pakiet A LIVE',
    price: 9000,
    depositAmount: 2000,
    isActive: true,
  })
  const commercial = resolvePathBPackageCommercial({
    selectedPackageIds: ['pkg-a'],
    optionsSnapshot: snap,
    livePackage: live,
  })
  assert.equal(commercial.packagePrice, 5000, 'snapshot price wins over live')
  assert.equal(commercial.packageName, 'Pakiet A', 'snapshot name wins')
  assert.equal(commercial.depositAmount, 1000, 'snapshot deposit wins when present')
  assert.equal(commercial.packageId, 'pkg-a', 'keeps FK when live exists')
  assert.equal(canApprovePathBPackage(commercial).ok, true)
}

{
  const oldSnap: FormInstanceOptionsSnapshot = {
    ...snap,
    packageOptions: [
      { id: 'pkg-a', name: 'Pakiet A', price: 5000, currency: 'PLN' },
    ],
  }
  const live = pkg({
    id: 'pkg-a',
    name: 'Pakiet A',
    price: 9000,
    depositAmount: 2000,
    isActive: false,
  })
  const commercial = resolvePathBPackageCommercial({
    selectedPackageIds: ['pkg-a'],
    optionsSnapshot: oldSnap,
    livePackage: live,
  })
  assert.equal(commercial.packagePrice, 5000, 'historical price after catalog edit')
  assert.equal(commercial.depositAmount, 2000, 'live deposit when snapshot omits deposit')
  assert.equal(commercial.packageActive, false)
  assert.equal(commercial.packageId, 'pkg-a', 'inactive still has FK')
  assert.equal(canApprovePathBPackage(commercial).ok, true, 'inactive approvable')
}

{
  const commercial = resolvePathBPackageCommercial({
    selectedPackageIds: ['pkg-a'],
    optionsSnapshot: snap,
    livePackage: null,
  })
  assert.equal(commercial.packageId, null, 'deleted → no fake FK')
  assert.equal(commercial.packagePrice, 5000, 'deleted uses snapshot price')
  assert.equal(commercial.packageName, 'Pakiet A')
  assert.equal(commercial.depositAmount, 1000, 'deleted uses snapshot deposit when present')
  assert.equal(canApprovePathBPackage(commercial).ok, true, 'deleted + snapshot ok')
}

{
  const commercial = resolvePathBPackageCommercial({
    selectedPackageIds: ['gone'],
    optionsSnapshot: snap,
    livePackage: null,
  })
  assert.equal(commercial.snapshotOptionFound, false)
  assert.equal(canApprovePathBPackage(commercial).ok, false, 'no snapshot + no live → fail')
}

{
  const commercial = resolvePathBPackageCommercial({
    selectedPackageIds: [],
    optionsSnapshot: snap,
    livePackage: null,
  })
  assert.equal(canApprovePathBPackage(commercial).ok, true, 'zero-package Path B ok')
}

console.log('pathBPackageCommercialAcceptance: ok')
