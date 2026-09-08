/**
 * Landing V2 — Iteration 3F.1 continuous desktop-parity phone tour.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_SETTLE_DELAY_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'
import { MOBILE_APP_RANGES } from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'
import {
  HEADLINE_SEP_COMPACT_SCALE,
  HEADLINE_SEP_PX,
  compactHeadlineSepRatio,
  phoneSettled,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import { MOBILE_TRACK_PRE_SVH_COMPACT } from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, label: string) {
  assert(src.includes(needle), `missing ${label}: ${needle}`)
}

function assertNotIncludes(src: string, needle: string, label: string) {
  assert(!src.includes(needle), `unexpected ${label}: ${needle}`)
}

function exists(rel: string) {
  try {
    read(rel)
    return true
  } catch {
    return false
  }
}

console.log('\n=== landing mobile story 3F.1 (desktop-parity tour) ===\n')

{
  assert(!exists('src/features/landing-v2/devices/FlattenedPhoneAutoplay.tsx'), '3F autoplay deleted')
  assert(
    !exists('src/features/landing-v2/devices/flattenedPhoneAutoplaySchedule.ts'),
    '3F schedule deleted',
  )
  console.log('PASS  1. rejected slideshow engine removed')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const tour = read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx')
  assertIncludes(mobile, 'CompactPhoneProductTour', 'compact wires tour')
  assertNotIncludes(mobile, 'FlattenedPhoneAutoplay', 'no slideshow import')
  assertIncludes(tour, 'MobileOurWedApp', 'live desktop app engine')
  assertIncludes(tour, 'data-phone-tour-engine="mobile-ourwed-app"', 'engine marker')
  assertIncludes(tour, 'animate(tourProgress, 1', 'one master time animation')
  assertIncludes(tour, "ease: 'linear'", 'linear master progress')
  assertIncludes(tour, 'COMPACT_PHONE_TOUR_SETTLE_DELAY_MS', 'settle beat')
  assertNotIncludes(tour, 'requestAnimationFrame', 'no rAF tour')
  assertNotIncludes(tour, 'setInterval', 'no interval tour')
  console.log('PASS  2. one continuous MobileOurWedApp tour')
}

{
  assert(COMPACT_PHONE_TOUR_SETTLE_DELAY_MS >= 450 && COMPACT_PHONE_TOUR_SETTLE_DELAY_MS <= 650, 'settle delay')
  assert(COMPACT_PHONE_TOUR_DURATION_S >= 8 && COMPACT_PHONE_TOUR_DURATION_S <= 14, 'duration band')
  assert(phoneSettled(0.74), 'PHONE_SETTLED')
  console.log('PASS  3. settle + duration')
}

{
  /* Desktop choreography order encoded in MOBILE_APP_RANGES */
  assert(MOBILE_APP_RANGES.dashBreath.start === 0, 'starts dash top')
  assert(MOBILE_APP_RANGES.dashScroll.start === 0.03, 'dash scroll after breath')
  assert(MOBILE_APP_RANGES.handoff.start === 0.56, 'handoff after dash')
  assert(MOBILE_APP_RANGES.mapIn.start === 0.788, 'nav after day')
  assert(MOBILE_APP_RANGES.briefEnter.start === 0.932, 'brief after nav')
  assert(MOBILE_APP_RANGES.briefHold.end === 1, 'ends at brief hold')
  const app = read('src/features/landing-v2/mobile-story/app/MobileOurWedApp.tsx')
  assertIncludes(app, 'MobileCompactAssignmentBar', 'nearest glass bar in shell')
  assertIncludes(app, 'MobileDashboardDemo', 'dashboard canvas')
  assertIncludes(app, 'dashScrollYAt', 'continuous dash Y')
  console.log('PASS  4. desktop choreography sequence preserved')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(
    mobile,
    'Compact phone tour owns app progress locally',
    'compact scroll appProgress gated',
  )
  assertIncludes(mobile, "compactRef.current ? 'tour'", 'diagnostic shows tour mode')
  console.log('PASS  5b. compact scroll appProgress gated off')
}

{
  const tour = read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx')
  /* Compact tour progress is local — scroll appProgress must not drive it */
  assertNotIncludes(tour, 'publishMobileAppProgress', 'tour does not publish scroll app')
  assertIncludes(tour, 'tourProgress', 'local tour MV')
  assertIncludes(tour, 'appProgress={tourProgress}', 'app fed by tour only')
  console.log('PASS  5. appProgress scroll decoupling')
}

{
  const barCss = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileCompactAssignmentBar.module.css',
  )
  assertIncludes(barCss, 'pointer: coarse', 'coarse glass without live blur')
  console.log('PASS  6. compact glass overlay policy')
}

{
  /* Headline frozen from 3F */
  assert(HEADLINE_SEP_COMPACT_SCALE === 90 / HEADLINE_SEP_PX, 'headline scale frozen')
  const preSvh = MOBILE_TRACK_PRE_SVH_COMPACT
  const vh = 874
  const nav = 68
  const usable = vh - nav
  const mappingSvh = preSvh + 36 + 24 + 112
  const mappingHeight = mappingSvh * (vh / 100)
  const preTravel = Math.max(1, mappingHeight * (preSvh / mappingSvh) - usable)
  const ratio = compactHeadlineSepRatio(preTravel)
  assert(ratio >= 0.35 && ratio <= 0.6, `headline still ~0.45 (got ${ratio.toFixed(3)})`)
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'linear: true', 'headline linear untouched')
  console.log('PASS  7. headline regression freeze')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  8. registration')
}

console.log('\nPASS  landing mobile story 3F.1\n')
