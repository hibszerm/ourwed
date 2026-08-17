/**
 * Travel fee commercial component — snapshotted per wedding.
 *
 * contract_value = package_base + extras + effectiveTravel
 * effectiveTravel = status === 'charged' ? amount : 0
 *
 * Never incremental: never `contractValue += fee`.
 */

import type { ContractStatus, Wedding } from '@/types/wedding'
import {
  computeWeddingContractValue,
  resolvePackageBasePrice,
  type ExtraPriceSnapshotPart,
} from '@/lib/forms/weddingExtraPricing'

export type TravelFeeStatus = 'unresolved' | 'included' | 'charged'

export const TRAVEL_FEE_STATUSES: TravelFeeStatus[] = [
  'unresolved',
  'included',
  'charged',
]

export function isTravelFeeStatus(value: unknown): value is TravelFeeStatus {
  return (
    value === 'unresolved' || value === 'included' || value === 'charged'
  )
}

/** Effective travel component inside contract_value. */
export function getEffectiveTravelFeeAmount(
  wedding: Pick<Wedding, 'travelFeeStatus' | 'travelFeeAmount'> | {
    travelFeeStatus?: TravelFeeStatus | null
    travelFeeAmount?: number | null
  },
): number {
  const status = wedding.travelFeeStatus ?? 'unresolved'
  if (status !== 'charged') return 0
  const amount = wedding.travelFeeAmount
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return 0
  return amount
}

export function normalizeTravelFeeDecision(input: {
  status: TravelFeeStatus
  amount: number
}): { status: TravelFeeStatus; amount: number; effectiveTravel: number } {
  if (input.status === 'charged') {
    const amount = Math.max(0, Number.isFinite(input.amount) ? input.amount : 0)
    if (amount <= 0) {
      throw new Error('CHARGED_REQUIRES_POSITIVE_AMOUNT')
    }
    return { status: 'charged', amount, effectiveTravel: amount }
  }
  return {
    status: input.status,
    amount: 0,
    effectiveTravel: 0,
  }
}

/**
 * Draft validation for UI — does not throw.
 * Persist path must still use normalizeTravelFeeDecision.
 */
export function isValidTravelFeeDraft(input: {
  status: TravelFeeStatus
  amount: number
}): boolean {
  if (input.status === 'charged') {
    return Number.isFinite(input.amount) && input.amount > 0
  }
  return input.status === 'included' || input.status === 'unresolved'
}

/**
 * Persisted travel decision is complete enough for contract generation.
 * Missing/legacy status is unresolved. Charged requires a valid positive amount.
 */
export function isTravelFeeResolved(
  wedding: Pick<Wedding, 'travelFeeStatus' | 'travelFeeAmount'> | {
    travelFeeStatus?: TravelFeeStatus | null
    travelFeeAmount?: number | null
  },
): boolean {
  const status = wedding.travelFeeStatus ?? 'unresolved'
  if (status === 'included') return true
  if (status === 'charged') {
    return isValidTravelFeeDraft({
      status: 'charged',
      amount: wedding.travelFeeAmount ?? 0,
    })
  }
  return false
}

/**
 * Non-throwing preview for incomplete form drafts.
 * Returns null when charged amount is not yet valid (empty / 0).
 * Does not weaken normalizeTravelFeeDecision for persisted decisions.
 */
export function previewTravelFeeContractValue(input: {
  currentContractValue: number
  extrasTotal: number
  previousEffectiveTravel: number
  nextStatus: TravelFeeStatus
  nextAmount: number
}): number | null {
  if (!isValidTravelFeeDraft({ status: input.nextStatus, amount: input.nextAmount })) {
    return null
  }
  const previous = Math.max(0, input.previousEffectiveTravel)
  const nextTravel =
    input.nextStatus === 'charged' ? Math.max(0, input.nextAmount) : 0
  const packageBase = Math.max(
    0,
    input.currentContractValue - input.extrasTotal - previous,
  )
  return packageBase + input.extrasTotal + nextTravel
}

/**
 * Idempotent recompute when travel fee changes.
 * packageBase = CV − extras − previousTravel
 * CV' = packageBase + extras + newTravel
 */
export function recomputeContractValueAfterTravelFeeChange(input: {
  currentContractValue: number
  extras: ExtraPriceSnapshotPart[]
  previousEffectiveTravel: number
  nextStatus: TravelFeeStatus
  nextAmount: number
}): {
  packageBase: number
  newContractValue: number
  previousEffectiveTravel: number
  nextEffectiveTravel: number
  status: TravelFeeStatus
  amount: number
} {
  const normalized = normalizeTravelFeeDecision({
    status: input.nextStatus,
    amount: input.nextAmount,
  })
  const previousTravel = Math.max(0, input.previousEffectiveTravel)
  const packageBase = resolvePackageBasePrice({
    currentWeddingPrice: input.currentContractValue,
    extrasBeforeOrCurrent: input.extras,
    effectiveTravelFee: previousTravel,
  })
  const newContractValue = computeWeddingContractValue({
    packageBasePrice: packageBase,
    extras: input.extras,
    effectiveTravelFee: normalized.effectiveTravel,
  })
  return {
    packageBase,
    newContractValue,
    previousEffectiveTravel: previousTravel,
    nextEffectiveTravel: normalized.effectiveTravel,
    status: normalized.status,
    amount: normalized.amount,
  }
}

/** Human-readable travel fee label for UI / Cockpit. */
export function formatTravelFeeDisplay(
  wedding: Pick<Wedding, 'travelFeeStatus' | 'travelFeeAmount'>,
  formatMoney: (n: number) => string,
): string {
  const status = wedding.travelFeeStatus ?? 'unresolved'
  if (status === 'unresolved') return 'Nieustalony'
  if (status === 'included') return 'W cenie'
  return formatMoney(getEffectiveTravelFeeAmount(wedding))
}

export type TravelFeeContractGuardLevel =
  | 'none'
  | 'generated'
  | 'sent'
  | 'signed'

export function getTravelFeeContractGuardLevel(
  status: ContractStatus | null | undefined,
): TravelFeeContractGuardLevel {
  if (status === 'generated') return 'generated'
  if (status === 'sent') return 'sent'
  if (status === 'signed') return 'signed'
  return 'none'
}

export function travelFeeContractGuardMessage(
  level: TravelFeeContractGuardLevel,
): string | null {
  switch (level) {
    case 'generated':
      return 'Zmiana kosztu dojazdu zmieni wartość zlecenia. Wygenerowana umowa nie zaktualizuje się automatycznie i będzie wymagała ponownego wygenerowania.'
    case 'sent':
      return 'Umowa została już wysłana. Zmiana kosztu dojazdu zmieni wartość zlecenia w OurWed, ale nie zmieni wysłanego dokumentu.'
    case 'signed':
      return 'Umowa jest podpisana. Podpisany dokument się nie zmieni. Wartość zlecenia w OurWed zostanie zmieniona tylko jeśli świadomie potwierdzisz nadpisanie danych handlowych.'
    default:
      return null
  }
}

/** Free-km suggestion from round-trip meters (no auto-save). */
export function suggestTravelFeeFromFreeKm(input: {
  freeDistanceKm: number | null | undefined
  roundTripDistanceMeters: number | null | undefined
  status: TravelFeeStatus
}): 'included' | 'manual' | null {
  if (input.status !== 'unresolved') return null
  const freeKm = input.freeDistanceKm
  const meters = input.roundTripDistanceMeters
  if (
    freeKm == null ||
    !Number.isFinite(freeKm) ||
    freeKm < 0 ||
    meters == null ||
    !Number.isFinite(meters) ||
    meters < 0
  ) {
    return null
  }
  const distanceKm = meters / 1000
  return distanceKm <= freeKm ? 'included' : 'manual'
}

export function metersToDisplayKm(meters: number): number {
  return Math.round((meters / 1000) * 10) / 10
}
