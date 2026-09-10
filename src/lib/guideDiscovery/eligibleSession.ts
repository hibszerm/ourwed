/**
 * Session-only Guide discovery eligibility.
 * Set when THIS browser session transitions wedding history 0 → >0.
 * Lives under lib so create/approve API paths can mark without feature imports.
 *
 * Same-tab reactivity: sessionStorage alone does not emit `storage` events.
 * Writers notify in-memory subscribers so Dashboard hosts update without reload.
 */

export const GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY =
  'ourwed:guide.discoveryEligible'

type Listener = () => void

const listeners = new Set<Listener>()

function notifyGuideDiscoveryEligibleListeners(): void {
  for (const listener of listeners) listener()
}

/** Same-tab subscription for GuideDiscoveryModalHost (useSyncExternalStore). */
export function subscribeGuideDiscoveryEligible(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Force subscribed hosts to re-read sessionStorage.
 * Used when the host mounts after the marker was already written on another route.
 */
export function retainGuideDiscoveryEligibleSnapshot(): void {
  notifyGuideDiscoveryEligibleListeners()
}

export function readGuideDiscoveryEligible(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function clearGuideDiscoveryEligible(): void {
  if (typeof sessionStorage === 'undefined') return
  let changed = false
  try {
    if (sessionStorage.getItem(GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY) != null) {
      sessionStorage.removeItem(GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY)
      changed = true
    }
  } catch {
    // Ignore private-mode failures.
  }
  if (changed) notifyGuideDiscoveryEligibleListeners()
}

/**
 * Call only after a successful first-booking mutation when prior history was 0.
 * Import of many rows still qualifies when prior was 0.
 */
export function markGuideDiscoveryEligibleIfFirstBooking(
  priorHistoryCount: number,
): void {
  if (priorHistoryCount !== 0) return
  if (typeof sessionStorage === 'undefined') return
  let changed = false
  try {
    if (sessionStorage.getItem(GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY) !== '1') {
      sessionStorage.setItem(GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY, '1')
      changed = true
    }
  } catch {
    // Ignore private-mode failures.
  }
  if (changed) notifyGuideDiscoveryEligibleListeners()
}
