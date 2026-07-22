/**
 * Module-level caches that must die when auth.uid() changes.
 * Kept in a leaf module so auth reset cannot create import cycles.
 */

type InFlightMap = Map<string, Promise<unknown>>

const weddingDemoInFlight: InFlightMap = new Map()

export function getWeddingDemoInFlightMap(): Map<string, Promise<unknown>> {
  return weddingDemoInFlight
}

export function clearTenantModuleCaches(): void {
  weddingDemoInFlight.clear()
}
