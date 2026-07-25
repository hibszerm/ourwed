/**
 * Commercial Truth Model — authoritative money vocabulary for OurWed.
 *
 * Meanings (do not invent synonyms):
 * - contractValue         = total agreed contract value (wedding.price / contract_value)
 * - agreedDeposit         = deposit agreed in the contract (wedding.depositAmount)
 * - totalPaid             = sum of paid client payments
 * - remainingToPay        = contractValue − totalPaid
 * - remainingAfterDeposit = contractValue − agreedDeposit
 *
 * Package catalog is for future weddings only.
 * Wedding commercial snapshot is immutable history unless the studio explicitly
 * re-assigns a package or edits the wedding terms.
 */

import type { PackageItem, StudioPackage } from '@/types/package'
import type {
  Wedding,
  WeddingPackageItemSnapshot,
} from '@/types/wedding'
import {
  getDepositPaid,
  getRemainingAfterDeposit,
  getRemainingToPay,
  getTotalPaid,
} from '@/lib/utils/finance'

/** Snapshot field: total agreed contract value. */
export function getContractValue(wedding: Pick<Wedding, 'price'>): number {
  return Number.isFinite(wedding.price) ? Math.max(0, wedding.price) : 0
}

/** Snapshot field: deposit agreed in the contract. */
export function getAgreedDeposit(
  wedding: Pick<Wedding, 'depositAmount'>,
): number {
  const v = wedding.depositAmount
  if (v == null || !Number.isFinite(v)) return 0
  return Math.max(0, v)
}

export interface WeddingCommercialSummary {
  packageId: string | null
  packageName: string
  contractValue: number
  agreedDeposit: number
  currency: string
  accentColor: string
  packageItems: WeddingPackageItemSnapshot[]
  coverageHours: number | null
  coverageEndTime: string | null
  overtimeRate: number | null
  deliveryMonths: number | null
  deliveryDays: number | null
  finalPaymentDueDate: string | null
  totalPaid: number
  remainingToPay: number
  remainingAfterDeposit: number
  depositPaid: number
}

/** One place to derive all commercial figures for UI / resolvers. */
export function getWeddingCommercialSummary(
  wedding: Wedding,
): WeddingCommercialSummary {
  const contractValue = getContractValue(wedding)
  const agreedDeposit = getAgreedDeposit(wedding)
  const payments = wedding.payments ?? []
  return {
    packageId: wedding.packageId ?? null,
    packageName: wedding.packageName ?? '',
    contractValue,
    agreedDeposit,
    currency: wedding.currency || 'PLN',
    accentColor: wedding.accentColor,
    packageItems: wedding.packageItems ?? [],
    coverageHours: wedding.coverageHours ?? null,
    coverageEndTime: wedding.coverageEndTime?.trim() || null,
    overtimeRate: wedding.overtimeRate ?? null,
    deliveryMonths: wedding.deliveryMonths ?? null,
    deliveryDays: wedding.deliveryDays ?? null,
    finalPaymentDueDate: wedding.finalPaymentDueDate?.trim() || null,
    totalPaid: getTotalPaid(payments),
    remainingToPay: getRemainingToPay(contractValue, payments),
    remainingAfterDeposit: getRemainingAfterDeposit(
      contractValue,
      agreedDeposit,
    ),
    depositPaid: getDepositPaid(payments),
  }
}

/** Human-readable delivery term from months and/or days. */
export function formatDeliveryTerm(
  months: number | null | undefined,
  days: number | null | undefined,
): string {
  if (months != null && Number.isFinite(months) && months > 0) {
    const n = Math.round(months)
    const abs = n % 100
    const last = abs % 10
    let word = 'miesięcy'
    if (abs === 1) word = 'miesiąc'
    else if (last >= 2 && last <= 4 && (abs < 10 || abs >= 20)) word = 'miesiące'
    return `${n} ${word}`
  }
  if (days != null && Number.isFinite(days) && days > 0) {
    const n = Math.round(days)
    return n === 1 ? '1 dzień' : `${n} dni`
  }
  return ''
}

/**
 * Product rule: final payment due 14 days before the wedding date.
 * Never copied from DOCX templates.
 */
export function defaultFinalPaymentDueDate(weddingDate: string): string | null {
  const trimmed = weddingDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const d = new Date(`${trimmed}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() - 14)
  return d.toISOString().slice(0, 10)
}

/** Freeze catalog package items into a wedding-owned snapshot. */
export function snapshotPackageItems(
  items: PackageItem[],
  options?: { includeDisabled?: boolean },
): WeddingPackageItemSnapshot[] {
  const includeDisabled = options?.includeDisabled === true
  return [...items]
    .filter((item) => includeDisabled || item.enabled !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({
      sourceItemId: item.id,
      title: item.title,
      description: item.description,
      sortOrder: item.sortOrder ?? index,
      enabled: item.enabled !== false,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    }))
}

export function snapshotPackageItemsFromStudioPackage(
  pkg: StudioPackage,
): WeddingPackageItemSnapshot[] {
  return snapshotPackageItems(pkg.items ?? [])
}

export type ApplyPackageSnapshotOptions = {
  /** Sum of wedding extras (priceSnapshot × quantity). */
  extrasTotal?: number
  /**
   * When true, keep wedding.price instead of pkg.price + extrasTotal.
   * Used when the studio confirms “preserve overridden contract price”.
   */
  preserveContractValue?: boolean
  /**
   * When true, keep an existing finalPaymentDueDate.
   * Otherwise set from product rule if wedding.date is known.
   */
  preserveFinalPaymentDueDate?: boolean
}

export type WeddingCommercialSnapshotPatch = Pick<
  Wedding,
  | 'packageId'
  | 'packageName'
  | 'price'
  | 'depositAmount'
  | 'currency'
  | 'accentColor'
  | 'packageItems'
  | 'coverageHours'
  | 'coverageEndTime'
  | 'overtimeRate'
  | 'deliveryMonths'
  | 'deliveryDays'
  | 'finalPaymentDueDate'
>

/**
 * Apply a catalog package as a new commercial snapshot on the wedding.
 * Does not touch payments. Does not mutate the catalog package.
 */
export function applyCommercialPackageSnapshot(
  wedding: Wedding,
  pkg: StudioPackage,
  extrasTotalOrOptions: number | ApplyPackageSnapshotOptions = 0,
): WeddingCommercialSnapshotPatch {
  const options: ApplyPackageSnapshotOptions =
    typeof extrasTotalOrOptions === 'number'
      ? { extrasTotal: extrasTotalOrOptions }
      : extrasTotalOrOptions
  const extrasTotal = options.extrasTotal ?? 0
  const catalogPrice = pkg.price + extrasTotal

  let finalPaymentDueDate: string | null =
    wedding.finalPaymentDueDate?.trim() || null
  if (!options.preserveFinalPaymentDueDate || !finalPaymentDueDate) {
    finalPaymentDueDate =
      defaultFinalPaymentDueDate(wedding.date) ?? finalPaymentDueDate
  }

  return {
    packageId: pkg.id,
    packageName: pkg.name,
    price: options.preserveContractValue ? wedding.price : catalogPrice,
    depositAmount: pkg.depositAmount,
    currency: pkg.currency,
    accentColor: pkg.color ?? wedding.accentColor,
    packageItems: snapshotPackageItemsFromStudioPackage(pkg),
    coverageHours: pkg.coverageHours,
    coverageEndTime: pkg.coverageEndTime,
    overtimeRate: pkg.overtimeRate,
    deliveryMonths: pkg.deliveryMonths,
    deliveryDays: pkg.deliveryDays,
    finalPaymentDueDate,
  }
}

/**
 * Copy current catalog defaults onto a wedding that already has packageId.
 * Requires explicit confirmation in UI — never silent.
 */
export function fillWeddingTermsFromCatalogPackage(
  wedding: Wedding,
  pkg: StudioPackage,
  options?: { preserveContractValue?: boolean; extrasTotal?: number },
): WeddingCommercialSnapshotPatch {
  return applyCommercialPackageSnapshot(wedding, pkg, {
    extrasTotal: options?.extrasTotal ?? 0,
    preserveContractValue: options?.preserveContractValue === true,
    preserveFinalPaymentDueDate: false,
  })
}
