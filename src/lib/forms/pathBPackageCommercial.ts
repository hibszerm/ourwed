/**
 * Path B commercial resolution from options_snapshot (+ live package when helpful).
 */

import type { FormInstanceOptionsSnapshot } from '@/types/contractQuestionnaire'
import type { StudioPackage } from '@/types/package'

export type PathBPackageCommercial = {
  requestedPackageId: string | null
  /** Writable FK — null when catalog row is gone. */
  packageId: string | null
  packageName: string
  packagePrice: number
  /** From snapshot when present; else live package; else undefined. */
  depositAmount: number | undefined
  currency: string
  accentColor: string | undefined
  packageFound: boolean
  packageActive: boolean
  /** Live row when available (active or inactive). */
  resolvedPackage: StudioPackage | null
  /** Snapshot had this package option (historical truth for name/price). */
  snapshotOptionFound: boolean
}

/**
 * Resolve Path B package commercial terms.
 * Price/name/currency prefer options_snapshot (frozen at link creation).
 * Deposit prefers snapshot when present; else live catalog when row exists.
 */
export function resolvePathBPackageCommercial(input: {
  selectedPackageIds: string[]
  legacyPackageId?: string | null
  optionsSnapshot?: FormInstanceOptionsSnapshot | null
  livePackage: StudioPackage | null
}): PathBPackageCommercial {
  const requested =
    input.selectedPackageIds[0]?.trim() ||
    input.legacyPackageId?.trim() ||
    null

  if (!requested) {
    return {
      requestedPackageId: null,
      packageId: null,
      packageName: '',
      packagePrice: 0,
      depositAmount: undefined,
      currency: 'PLN',
      accentColor: undefined,
      packageFound: false,
      packageActive: false,
      resolvedPackage: null,
      snapshotOptionFound: false,
    }
  }

  const snapOpt =
    input.optionsSnapshot?.packageOptions.find((p) => p.id === requested) ??
    null
  const live = input.livePackage

  const snapPrice =
    snapOpt?.price != null && Number.isFinite(snapOpt.price)
      ? Number(snapOpt.price)
      : null
  const snapDeposit =
    snapOpt?.depositAmount != null && Number.isFinite(snapOpt.depositAmount)
      ? Number(snapOpt.depositAmount)
      : null

  const packageFound = Boolean(live)
  const packageActive = Boolean(live?.isActive)
  const snapshotOptionFound = Boolean(snapOpt)

  // FK only when catalog row still exists (active or inactive).
  const packageId = live?.id ?? null

  const packageName =
    (snapOpt?.name?.trim() || live?.name?.trim() || '') ||
    (snapshotOptionFound || packageFound ? 'Pakiet' : '')

  const packagePrice =
    snapPrice != null && snapPrice >= 0
      ? snapPrice
      : live?.price != null && Number.isFinite(live.price)
        ? live.price
        : 0

  const depositAmount =
    snapDeposit != null && snapDeposit >= 0
      ? snapDeposit
      : live?.depositAmount != null && Number.isFinite(live.depositAmount)
        ? live.depositAmount
        : undefined

  const currency =
    (typeof snapOpt?.currency === 'string' && snapOpt.currency.trim()) ||
    live?.currency ||
    'PLN'

  return {
    requestedPackageId: requested,
    packageId,
    packageName,
    packagePrice,
    depositAmount,
    currency,
    accentColor: live?.color ?? undefined,
    packageFound,
    packageActive,
    resolvedPackage: live,
    snapshotOptionFound,
  }
}

/** Whether Path B may create a wedding from this commercial resolution. */
export function canApprovePathBPackage(
  commercial: PathBPackageCommercial,
): { ok: true } | { ok: false; message: string } {
  if (!commercial.requestedPackageId) return { ok: true }
  if (commercial.snapshotOptionFound || commercial.packageFound) return { ok: true }
  return {
    ok: false,
    message:
      'Wybrany pakiet nie jest dostępny w tej ankiecie ani w katalogu. Nie można zatwierdzić bez historycznych danych pakietu.',
  }
}
