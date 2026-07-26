/**
 * Scene modules — Landing V2 scroll chapters.
 * Choreography lives in LandingV2.tsx (GSAP ScrollTrigger).
 * These files document the intended scene boundaries for reuse.
 */

export { DeviceFrame as HeroSceneDevice } from '@/features/landing-v2/devices/DeviceFrame'
export { DesktopAppScreen as DashboardSceneScreen } from '@/features/landing-v2/screens/AppScreens'
export { ContractMagicScreen as ContractSceneScreen } from '@/features/landing-v2/screens/AppScreens'
export { MobileAppScreen as MobileWeddingSceneScreen } from '@/features/landing-v2/screens/AppScreens'
export { DeviceFrame as LaptopToPhoneMorphDevice } from '@/features/landing-v2/devices/DeviceFrame'
export { PinnedScene } from '@/features/landing-v2/choreography/PinnedScene'
export { SceneLabel } from '@/features/landing-v2/shared/SceneLabel'
