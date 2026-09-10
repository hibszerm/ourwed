import { useEffect, useState, useSyncExternalStore } from 'react'
import { GuideDiscoveryModal } from '@/features/onboarding/guide/GuideDiscoveryModal'
import {
  readGuideDiscoveryEligible,
  retainGuideDiscoveryEligibleSnapshot,
  subscribeGuideDiscoveryEligible,
} from '@/lib/guideDiscovery/eligibleSession'
import { shouldShowGuideDiscoveryModal } from '@/features/onboarding/guide/guideDiscoveryRules'
import { useGuideIntegrationPreference } from '@/features/onboarding/guide/useGuideIntegrationPreference'

type GuideDiscoveryModalHostProps = {
  /** When true, First Run Home owns the surface — never show. */
  showingFirstRunHome: boolean
}

const OPEN_DELAY_MS = 900

/**
 * Calm Dashboard-only host for the one-time Guide discovery modal.
 * Mount only on operational Dashboard (not First Run Home).
 * Eligibility = session 0→>0 transition marker (not wedding-count ceilings).
 *
 * Real QA sequence writes the marker BEFORE this host mounts (create → detail →
 * Pulpit). Initial snapshot must read sessionStorage on mount; same-tab notify
 * alone is not enough. Delay is mount-scoped so eligible flicker cannot
 * indefinitely reset the calm timer.
 */
export function GuideDiscoveryModalHost({
  showingFirstRunHome,
}: GuideDiscoveryModalHostProps) {
  const { preference, markDiscovered, dismissModal } =
    useGuideIntegrationPreference()
  const [delayElapsed, setDelayElapsed] = useState(false)

  const discoveryEligible = useSyncExternalStore(
    subscribeGuideDiscoveryEligible,
    readGuideDiscoveryEligible,
    readGuideDiscoveryEligible,
  )

  const eligible = shouldShowGuideDiscoveryModal({
    preference,
    discoveryEligible,
    showingFirstRunHome,
    isCalmOperationalSurface: true,
  })

  // Marker is often written on another route before this host mounts. Re-notify
  // after mount so subscribers re-read sessionStorage even when no new write
  // occurs (and getServerSnapshot cannot stay stuck at a false default).
  useEffect(() => {
    retainGuideDiscoveryEligibleSnapshot()
  }, [])

  // Mount-scoped calm delay — do not tie timer lifetime to eligible flips.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDelayElapsed(true)
    }, OPEN_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const open = eligible && delayElapsed

  return (
    <GuideDiscoveryModal
      open={open}
      onOpenGuide={markDiscovered}
      onDismiss={dismissModal}
    />
  )
}
