/**
 * Landing V2 — Iteration 3F.2 phone fidelity + calm Day timing.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
  COMPACT_PHONE_TOUR_DURATION_S_3F1,
  COMPACT_PHONE_TOUR_SEGMENTS,
  appProgressAtTourElapsedMs,
  compactTourSegmentById,
  uniformMappedDurationS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'
import { MOBILE_APP_RANGES } from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'
import {
  HEADLINE_SEP_COMPACT_SCALE,
  HEADLINE_SEP_PX,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'

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

console.log('\n=== landing mobile story 3F.2 (fidelity + calm day) ===\n')

{
  const tour = read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx')
  assertIncludes(tour, 'MobileOurWedApp', 'live app retained')
  assertIncludes(tour, 'appProgressAtTourNormalized', 'segment remap')
  assertIncludes(tour, 'animate(masterT, 1', 'one master time')
  assertIncludes(tour, "ease: 'linear'", 'linear master clock')
  assertNotIncludes(tour, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(tour, 'FlattenedPhoneAutoplay', 'no slideshow')
  console.log('PASS  1. 3F.1 architecture retained + remap')
}

{
  const dash = compactTourSegmentById('dashScroll')
  const day = compactTourSegmentById('dayScroll')
  const dayIntro = compactTourSegmentById('dayIntroHold')
  const dayEnd = compactTourSegmentById('dayEndHold')
  const route = compactTourSegmentById('routeTravel')
  assert(!!dash && !!day && !!dayIntro && !!dayEnd && !!route, 'core segments present')
  const priorDay = uniformMappedDurationS(
    MOBILE_APP_RANGES.dayScroll.start,
    MOBILE_APP_RANGES.dayScroll.end,
  )
  assert(priorDay > 1 && priorDay < 1.5, `3F.1 day ~1.27s (got ${priorDay.toFixed(3)})`)
  /* 3F.2 perceived day calmness kept via physical px/s; 3F.3 shortens wall-clock. */
  assert(day!.durationMs >= 1900, `day scroll compensated >= 1.9s (got ${day!.durationMs})`)
  assert(day!.durationMs <= 2200, `day scroll compensated <= 2.2s (got ${day!.durationMs})`)
  assert(day!.durationMs > priorDay * 1000 * 1.4, 'day still slower than 3F.1 uniform map')
  assert(dayIntro!.durationMs >= 600 && dayIntro!.durationMs <= 900, 'day intro hold')
  assert(dayEnd!.durationMs >= 500 && dayEnd!.durationMs <= 800, 'day end hold')
  assert(dash!.durationMs >= 3000 && dash!.durationMs <= 3400, 'dash scroll 3F.3 phys compensation')
  assert(route!.durationMs >= 1800 && route!.durationMs <= 2000, 'route 3F.3 phys compensation')
  assert(COMPACT_PHONE_TOUR_DURATION_S > COMPACT_PHONE_TOUR_DURATION_S_3F1, 'tour longer than 3F.1')
  assert(COMPACT_PHONE_TOUR_DURATION_S >= 13 && COMPACT_PHONE_TOUR_DURATION_S <= 16, 'total band after compensation')
  console.log(
    `PASS  2. day ${day!.durationMs}ms vs prior ~${(priorDay * 1000).toFixed(0)}ms; total ${COMPACT_PHONE_TOUR_DURATION_S.toFixed(2)}s`,
  )
}

{
  const ids = COMPACT_PHONE_TOUR_SEGMENTS.map((s) => s.id)
  assert(ids[0] === 'dashBreath', 'starts dashBreath')
  assert(ids.includes('dashScroll'), 'dashScroll')
  assert(ids.includes('handoff'), 'handoff')
  assert(ids.includes('dayScroll'), 'dayScroll')
  assert(ids.includes('routeTravel'), 'routeTravel')
  assert(ids.includes('briefHold'), 'briefHold')
  assert(ids.indexOf('dayScroll') > ids.indexOf('dashScroll'), 'day after dash')
  assert(ids.indexOf('routeTravel') > ids.indexOf('dayScroll'), 'nav after day')
  assert(ids.indexOf('briefHold') > ids.indexOf('routeTravel'), 'brief after nav')
  for (const s of COMPACT_PHONE_TOUR_SEGMENTS) {
    assert(s.easing === 'linear', `${s.id} linear`)
  }
  console.log('PASS  3. event order + linear pans')
}

{
  /* Remap continuity: mid-day scroll progress stays inside dayScroll range */
  const day = compactTourSegmentById('dayScroll')!
  let elapsed = 0
  for (const s of COMPACT_PHONE_TOUR_SEGMENTS) {
    if (s.id === 'dayScroll') break
    elapsed += s.durationMs
  }
  const mid = appProgressAtTourElapsedMs(elapsed + day.durationMs * 0.5)
  assert(
    mid > MOBILE_APP_RANGES.dayScroll.start && mid < MOBILE_APP_RANGES.dayScroll.end,
    `mid-day progress in range (got ${mid.toFixed(3)})`,
  )
  assert(appProgressAtTourElapsedMs(0) === 0, 'start 0')
  assert(appProgressAtTourElapsedMs(1e9) === 1, 'end 1')
  console.log('PASS  4. remapped progress continuity')
}

{
  const phoneCss = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.module.css')
  assertIncludes(phoneCss, '76.5vw', 'phone ~0.88× prior')
  assertIncludes(phoneCss, '100svh', 'stable svh height budget')
  assertNotIncludes(phoneCss, '100dvh', 'no dvh phone budget')
  assertNotIncludes(phoneCss, 'visualViewport', 'no visualViewport')
  assertIncludes(phoneCss, '--phone-ratio-num', 'aspect preserved')
  console.log('PASS  5. phone scale + stable viewport')
}

{
  const appCss = read('src/features/landing-v2/mobile-story/app/MobileOurWedApp.module.css')
  const dashCss = read(
    'src/features/landing-v2/mobile-story/app/screens/MobileDashboardDemo.module.css',
  )
  assertIncludes(dashCss, 'min-height: 164px', 'hero CRM parity at canonical width')
  assertIncludes(dashCss, 'min-height: 72px', 'upcoming row CRM parity')
  assertNotIncludes(appCss, '100cqw / var(--ow-density-canon-w)', 'ineffective rem density removed')
  const crmHero = read('src/features/dashboard-v3/DashboardV3Hero.module.css')
  assertIncludes(crmHero, 'min-height: 164px', 'CRM hero unchanged')
  console.log('PASS  6. canonical-width CRM parity; no fake rem density')
}

{
  assert(HEADLINE_SEP_COMPACT_SCALE === 90 / HEADLINE_SEP_PX, 'headline frozen')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'linear: true', 'headline linear')
  assertIncludes(mobile, 'PHONE_ENTER_Y_COMPACT = 48', 'entrance freeze')
  console.log('PASS  7. headline + entrance freeze')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  8. registration')
}

console.log('\nPASS  landing mobile story 3F.2\n')
