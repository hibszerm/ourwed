/**
 * Idempotent wedding contract value from package base + extras + travel fee.
 *
 * Formula:
 *   wedding.price = packageBasePrice
 *                 + Σ(price_snapshot × quantity)
 *                 + effectiveTravelFee
 *
 * effectiveTravelFee = travel_fee_status === 'charged' ? travel_fee_amount : 0
 *
 * Never include deposit or payments in this total.
 * Never trust browser-submitted prices — use questionnaire/options snapshots
 * persisted as wedding_extra_services.price_snapshot.
 *
 * Retry rule: completed questionnaire submit is one-shot (ALREADY_SUBMITTED).
 * Price recomputation is deterministic from components, never
 * `price = price + extras` incremental adds.
 */

export interface ExtraPriceSnapshotPart {
  priceSnapshot: number
  quantity: number
}

/** Sum of extra snapshot lines. */
export function sumExtraPriceSnapshots(
  extras: ExtraPriceSnapshotPart[],
): number {
  return extras.reduce((sum, e) => {
    const price = Number.isFinite(e.priceSnapshot) ? e.priceSnapshot : 0
    const qty = Number.isFinite(e.quantity) && e.quantity > 0 ? e.quantity : 1
    return sum + Math.max(0, price) * qty
  }, 0)
}

/**
 * Derive the package base from the current wedding total, extras, and travel.
 * Preserves a manual total adjustment inside the "base" component when
 * an explicit package price is not provided.
 *
 * packageBase = currentWeddingPrice − extras − effectiveTravelFee
 */
export function resolvePackageBasePrice(input: {
  currentWeddingPrice: number
  extrasBeforeOrCurrent: ExtraPriceSnapshotPart[]
  /** Charged travel fee currently inside contract_value (0 if included/unresolved). */
  effectiveTravelFee?: number | null
  explicitPackagePrice?: number | null
}): number {
  if (
    input.explicitPackagePrice != null &&
    Number.isFinite(input.explicitPackagePrice)
  ) {
    return Math.max(0, input.explicitPackagePrice)
  }
  const extrasSum = sumExtraPriceSnapshots(input.extrasBeforeOrCurrent)
  const travel = Math.max(
    0,
    input.effectiveTravelFee != null && Number.isFinite(input.effectiveTravelFee)
      ? input.effectiveTravelFee
      : 0,
  )
  const current = Number.isFinite(input.currentWeddingPrice)
    ? input.currentWeddingPrice
    : 0
  return Math.max(0, current - extrasSum - travel)
}

/** Idempotent total: package base + extras + effective travel. */
export function computeWeddingContractValue(input: {
  packageBasePrice: number
  extras: ExtraPriceSnapshotPart[]
  effectiveTravelFee?: number | null
}): number {
  const travel = Math.max(
    0,
    input.effectiveTravelFee != null && Number.isFinite(input.effectiveTravelFee)
      ? input.effectiveTravelFee
      : 0,
  )
  return (
    Math.max(0, input.packageBasePrice) +
    sumExtraPriceSnapshots(input.extras) +
    travel
  )
}

/**
 * Recompute after an extras sync.
 * Pass explicitPackagePrice for new weddings (catalog/primary package).
 * For existing weddings, omit it and pass extras *before* the sync so the
 * previous base (including any manual adjustment) is preserved.
 * Pass effectiveTravelFee so travel is not absorbed into package base.
 */
export function recomputeContractValueAfterExtrasSync(input: {
  currentWeddingPrice: number
  extrasBeforeSync: ExtraPriceSnapshotPart[]
  extrasAfterSync: ExtraPriceSnapshotPart[]
  effectiveTravelFee?: number | null
  explicitPackagePrice?: number | null
}): number {
  const packageBasePrice = resolvePackageBasePrice({
    currentWeddingPrice: input.currentWeddingPrice,
    extrasBeforeOrCurrent: input.extrasBeforeSync,
    effectiveTravelFee: input.effectiveTravelFee,
    explicitPackagePrice: input.explicitPackagePrice,
  })
  return computeWeddingContractValue({
    packageBasePrice,
    extras: input.extrasAfterSync,
    effectiveTravelFee: input.effectiveTravelFee,
  })
}

/**
 * Extras-only edit (Wedding Detail package editor).
 *
 * Prefer an explicit draft `packageBasePrice` when present (preserves manual
 * commercial delta / travel decomposition). Otherwise derive base from
 * current CV − old extras − travel.
 *
 * Always: newCV = base + newExtras + travel
 * Equivalent: newCV = currentCV − oldExtras + newExtras (travel unchanged)
 */
export function recomposeContractValueForExtrasEdit(input: {
  currentWeddingPrice: number
  extrasBefore: ExtraPriceSnapshotPart[]
  extrasAfter: ExtraPriceSnapshotPart[]
  effectiveTravelFee?: number | null
  /** Sticky draft package base from createWeddingEditDraft / package change. */
  packageBasePrice?: number | null
}): number {
  const packageBasePrice =
    input.packageBasePrice != null && Number.isFinite(input.packageBasePrice)
      ? Math.max(0, input.packageBasePrice)
      : resolvePackageBasePrice({
          currentWeddingPrice: input.currentWeddingPrice,
          extrasBeforeOrCurrent: input.extrasBefore,
          effectiveTravelFee: input.effectiveTravelFee,
        })
  return computeWeddingContractValue({
    packageBasePrice,
    extras: input.extrasAfter,
    effectiveTravelFee: input.effectiveTravelFee,
  })
}
