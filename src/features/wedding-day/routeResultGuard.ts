/**
 * Bind travel results to the current operational route fingerprint.
 * Stale async getPlan/recalculate results must not write into UI cache.
 */

const expectedFingerprintByWedding = new Map<string, string>()

export function setExpectedRouteFingerprint(
  weddingId: string,
  fingerprint: string,
): void {
  expectedFingerprintByWedding.set(weddingId, fingerprint)
}

export function clearExpectedRouteFingerprint(weddingId: string): void {
  expectedFingerprintByWedding.delete(weddingId)
}

export function getExpectedRouteFingerprint(
  weddingId: string,
): string | undefined {
  return expectedFingerprintByWedding.get(weddingId)
}

/**
 * Accept a travel plan only when its fingerprint matches the current
 * operational expectation (or no expectation is set yet).
 * routeStale placeholders are never treated as a successful commit.
 */
export function shouldAcceptTravelPlanResult(input: {
  weddingId: string
  routeFingerprint: string | null | undefined
  routeStale?: boolean
}): boolean {
  if (input.routeStale) return false
  const expected = expectedFingerprintByWedding.get(input.weddingId)
  if (!expected) return true
  return Boolean(
    input.routeFingerprint && input.routeFingerprint === expected,
  )
}
