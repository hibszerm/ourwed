/**
 * Guide discovery + sidebar visibility — browser-local preferences.
 * No DB migration. Defaults: Guide visible, not discovered, modal not dismissed.
 *
 * Separates:
 * - sidebarVisible (nav chrome)
 * - discovered (user knows Guide exists)
 * - modalDismissed (one-time discovery dialog)
 * from First Run / core readiness.
 */

import { clearGuideDiscoveryEligible } from '@/lib/guideDiscovery/eligibleSession'

export type GuideIntegrationPreference = {
  /** Intentional visit to /przewodnik or modal CTA. */
  discovered: boolean
  /** Discovery modal closed via Może później (or equivalent). */
  modalDismissed: boolean
  /** Show Przewodnik in desktop + mobile nav. Undefined/missing → visible. */
  sidebarVisible: boolean
}

export const GUIDE_INTEGRATION_STORAGE_PREFIX = 'ourwed:guide-integration'

const DEFAULT_PREFERENCE: GuideIntegrationPreference = {
  discovered: false,
  modalDismissed: false,
  sidebarVisible: true,
}

export function guideIntegrationStorageKey(userId: string | null | undefined): string {
  const id = userId?.trim()
  if (id) return `${GUIDE_INTEGRATION_STORAGE_PREFIX}:u:${id}`
  return GUIDE_INTEGRATION_STORAGE_PREFIX
}

export function parseGuideIntegrationPreference(
  raw: string | null | undefined,
): GuideIntegrationPreference {
  if (!raw) return { ...DEFAULT_PREFERENCE }
  try {
    const parsed = JSON.parse(raw) as Partial<GuideIntegrationPreference>
    return {
      discovered: parsed.discovered === true,
      modalDismissed: parsed.modalDismissed === true,
      // undefined / missing → visible (safe default)
      sidebarVisible: parsed.sidebarVisible !== false,
    }
  } catch {
    return { ...DEFAULT_PREFERENCE }
  }
}

export function readGuideIntegrationPreference(
  userId?: string | null,
): GuideIntegrationPreference {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCE }
  try {
    return parseGuideIntegrationPreference(
      localStorage.getItem(guideIntegrationStorageKey(userId)),
    )
  } catch {
    return { ...DEFAULT_PREFERENCE }
  }
}

export function writeGuideIntegrationPreference(
  patch: Partial<GuideIntegrationPreference>,
  userId?: string | null,
): GuideIntegrationPreference {
  const current = readGuideIntegrationPreference(userId)
  const next: GuideIntegrationPreference = {
    discovered: patch.discovered ?? current.discovered,
    modalDismissed: patch.modalDismissed ?? current.modalDismissed,
    sidebarVisible:
      patch.sidebarVisible !== undefined
        ? patch.sidebarVisible
        : current.sidebarVisible,
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        guideIntegrationStorageKey(userId),
        JSON.stringify(next),
      )
    } catch {
      // Ignore quota / private-mode failures.
    }
  }

  notifyGuideIntegrationListeners(userId)
  return next
}

type Listener = () => void

const listenersByKey = new Map<string, Set<Listener>>()

function notifyGuideIntegrationListeners(userId?: string | null) {
  const key = guideIntegrationStorageKey(userId)
  const set = listenersByKey.get(key)
  if (!set) return
  for (const listener of set) listener()
}

/** Same-tab reactivity for Sidebar / Settings / modal host. */
export function subscribeGuideIntegrationPreference(
  userId: string | null | undefined,
  listener: Listener,
): () => void {
  const key = guideIntegrationStorageKey(userId)
  let set = listenersByKey.get(key)
  if (!set) {
    set = new Set()
    listenersByKey.set(key, set)
  }
  set.add(listener)

  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
  }

  return () => {
    set!.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
    }
  }
}

export function markGuideDiscovered(userId?: string | null): GuideIntegrationPreference {
  clearGuideDiscoveryEligible()
  return writeGuideIntegrationPreference(
    { discovered: true, modalDismissed: true },
    userId,
  )
}

export function markGuideDiscoveryModalDismissed(
  userId?: string | null,
): GuideIntegrationPreference {
  clearGuideDiscoveryEligible()
  return writeGuideIntegrationPreference({ modalDismissed: true }, userId)
}

export function setGuideSidebarVisible(
  visible: boolean,
  userId?: string | null,
): GuideIntegrationPreference {
  return writeGuideIntegrationPreference({ sidebarVisible: visible }, userId)
}
