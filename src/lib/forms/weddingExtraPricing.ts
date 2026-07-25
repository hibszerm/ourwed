/**
 * Idempotent wedding contract value from package base + extra snapshots.
 *
 * Formula:
 *   wedding.price = packageBasePrice + Σ(price_snapshot × quantity)
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
 * Derive the package base from the current wedding total and linked extras.
 * Preserves a manual total adjustment inside the "base" component when
 * an explicit package price is not provided.
 */
export function resolvePackageBasePrice(input: {
  currentWeddingPrice: number
  extrasBeforeOrCurrent: ExtraPriceSnapshotPart[]
  explicitPackagePrice?: number | null
}): number {
  if (
    input.explicitPackagePrice != null &&
    Number.isFinite(input.explicitPackagePrice)
  ) {
    return Math.max(0, input.explicitPackagePrice)
  }
  const extrasSum = sumExtraPriceSnapshots(input.extrasBeforeOrCurrent)
  const current = Number.isFinite(input.currentWeddingPrice)
    ? input.currentWeddingPrice
    : 0
  return Math.max(0, current - extrasSum)
}

/** Idempotent total: package base + all linked extras. */
export function computeWeddingContractValue(input: {
  packageBasePrice: number
  extras: ExtraPriceSnapshotPart[]
}): number {
  return (
    Math.max(0, input.packageBasePrice) + sumExtraPriceSnapshots(input.extras)
  )
}

/**
 * Recompute after an extras sync.
 * Pass explicitPackagePrice for new weddings (catalog/primary package).
 * For existing weddings, omit it and pass extras *before* the sync so the
 * previous base (including any manual adjustment) is preserved.
 */
export function recomputeContractValueAfterExtrasSync(input: {
  currentWeddingPrice: number
  extrasBeforeSync: ExtraPriceSnapshotPart[]
  extrasAfterSync: ExtraPriceSnapshotPart[]
  explicitPackagePrice?: number | null
}): number {
  const packageBasePrice = resolvePackageBasePrice({
    currentWeddingPrice: input.currentWeddingPrice,
    extrasBeforeOrCurrent: input.extrasBeforeSync,
    explicitPackagePrice: input.explicitPackagePrice,
  })
  return computeWeddingContractValue({
    packageBasePrice,
    extras: input.extrasAfterSync,
  })
}
