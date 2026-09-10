import { useCallback, useSyncExternalStore } from 'react'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import {
  markGuideDiscovered,
  markGuideDiscoveryModalDismissed,
  readGuideIntegrationPreference,
  setGuideSidebarVisible,
  subscribeGuideIntegrationPreference,
  type GuideIntegrationPreference,
  writeGuideIntegrationPreference,
} from '@/features/onboarding/guide/guideIntegrationPreference'

const snapshotCache = new Map<string, GuideIntegrationPreference>()

function getCachedPreference(
  userId: string | null | undefined,
): GuideIntegrationPreference {
  const key = userId?.trim() ? `u:${userId.trim()}` : 'anon'
  const next = readGuideIntegrationPreference(userId)
  const prev = snapshotCache.get(key)
  if (
    prev &&
    prev.discovered === next.discovered &&
    prev.modalDismissed === next.modalDismissed &&
    prev.sidebarVisible === next.sidebarVisible
  ) {
    return prev
  }
  snapshotCache.set(key, next)
  return next
}

/**
 * Reactive Guide discovery + visibility preference (localStorage).
 */
export function useGuideIntegrationPreference(): {
  preference: GuideIntegrationPreference
  markDiscovered: () => void
  dismissModal: () => void
  setSidebarVisible: (visible: boolean) => void
  patch: (next: Partial<GuideIntegrationPreference>) => void
} {
  const userId = useStudioAuthId()

  const preference = useSyncExternalStore(
    (listener) => subscribeGuideIntegrationPreference(userId, listener),
    () => getCachedPreference(userId),
    () => getCachedPreference(userId),
  )

  const markDiscovered = useCallback(() => {
    markGuideDiscovered(userId)
  }, [userId])

  const dismissModal = useCallback(() => {
    markGuideDiscoveryModalDismissed(userId)
  }, [userId])

  const setSidebarVisible = useCallback(
    (visible: boolean) => {
      setGuideSidebarVisible(visible, userId)
    },
    [userId],
  )

  const patch = useCallback(
    (next: Partial<GuideIntegrationPreference>) => {
      writeGuideIntegrationPreference(next, userId)
    },
    [userId],
  )

  return {
    preference,
    markDiscovered,
    dismissModal,
    setSidebarVisible,
    patch,
  }
}
