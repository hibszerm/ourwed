/**
 * Decide whether questionnaire package selection conflicts with a confirmed wedding package.
 * When true, keep wedding.packageId / commercial snapshot and flag for review.
 */
export function packageSelectionNeedsReview(
  weddingPackageId: string | null | undefined,
  requestedPrimaryPackageId: string | null | undefined,
): boolean {
  return Boolean(
    weddingPackageId &&
      requestedPrimaryPackageId &&
      weddingPackageId !== requestedPrimaryPackageId,
  )
}
