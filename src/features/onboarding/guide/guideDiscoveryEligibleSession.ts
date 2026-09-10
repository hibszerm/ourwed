/**
 * Re-export session eligibility helpers for onboarding feature consumers.
 */
export {
  clearGuideDiscoveryEligible,
  GUIDE_DISCOVERY_ELIGIBLE_SESSION_KEY,
  markGuideDiscoveryEligibleIfFirstBooking,
  readGuideDiscoveryEligible,
  retainGuideDiscoveryEligibleSnapshot,
  subscribeGuideDiscoveryEligible,
} from '@/lib/guideDiscovery/eligibleSession'
