import type { GuideIntegrationPreference } from '@/features/onboarding/guide/guideIntegrationPreference'

export type GuideCompassAttentionInput = {
  preference: GuideIntegrationPreference
  /** Exact /przewodnik active. */
  isGuideRouteActive: boolean
  prefersReducedMotion: boolean
  /**
   * Guide V3.2 Przygotuj OurWed core readiness
   * (`isGuidePreparationComplete` / `isSetupCoreReady`).
   */
  isGuidePreparationComplete: boolean
}

/**
 * Quiet sidebar compass attention while Guide preparation is incomplete.
 * `discovered` does NOT gate animation — knowing the Guide exists ≠ setup done.
 * Active Guide route and reduced motion: always static.
 */
export function shouldAnimateGuideCompass(
  input: GuideCompassAttentionInput,
): boolean {
  if (input.prefersReducedMotion) return false
  if (!input.preference.sidebarVisible) return false
  if (input.isGuideRouteActive) return false
  if (input.isGuidePreparationComplete) return false
  return true
}

export type GuideDiscoveryModalEligibilityInput = {
  preference: GuideIntegrationPreference
  /** Session 0→>0 first-booking transition marker. */
  discoveryEligible: boolean
  /** True while First Run Home would still own the dashboard. */
  showingFirstRunHome: boolean
  /** Calm shell surface only — typically exact /dashboard. */
  isCalmOperationalSurface: boolean
}

/**
 * One-time discovery modal eligibility.
 * Requires a real current-session 0→>0 booking transition marker.
 * Never uses wedding-count ceilings. Never on First Run Home / session-skip empty.
 */
export function shouldShowGuideDiscoveryModal(
  input: GuideDiscoveryModalEligibilityInput,
): boolean {
  if (input.preference.discovered) return false
  if (input.preference.modalDismissed) return false
  if (input.showingFirstRunHome) return false
  if (!input.isCalmOperationalSurface) return false
  if (!input.discoveryEligible) return false
  return true
}
