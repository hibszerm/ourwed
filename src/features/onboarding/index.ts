export { FirstRunHome } from '@/features/onboarding/FirstRunHome'
export {
  isZeroWeddingHistory,
  shouldShowFirstRunHome,
} from '@/features/onboarding/firstRunDiscriminator'
export { FIRST_RUN_ROUTES } from '@/features/onboarding/firstRunRoutes'
export {
  deriveGuideActivationStage,
  deriveSetupGuidanceState,
  isGuidePreparationComplete,
  isSetupCoreReady,
  studioPackagesSetupSignalsQueryKey,
} from '@/features/onboarding/setup/setupGuidanceReadiness'
export { SETUP_GUIDANCE_ROUTES } from '@/features/onboarding/setup/setupGuidanceRoutes'
export { PrzewodnikPageContent } from '@/features/onboarding/guide/PrzewodnikPageContent'
export {
  markGuideDiscovered,
  markGuideDiscoveryModalDismissed,
  parseGuideIntegrationPreference,
  readGuideIntegrationPreference,
  setGuideSidebarVisible,
  writeGuideIntegrationPreference,
} from '@/features/onboarding/guide/guideIntegrationPreference'
export {
  clearGuideDiscoveryEligible,
  GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY,
  markGuideDiscoveryEligibleIfFirstBooking,
  readGuideDiscoveryEligible,
  retainGuideDiscoveryEligibleSnapshot,
  subscribeGuideDiscoveryEligible,
} from '@/features/onboarding/guide/guideDiscoveryEligibleSession'
export {
  shouldAnimateGuideCompass,
  shouldShowGuideDiscoveryModal,
} from '@/features/onboarding/guide/guideDiscoveryRules'
export { GuideDiscoveryModalHost } from '@/features/onboarding/guide/GuideDiscoveryModalHost'
