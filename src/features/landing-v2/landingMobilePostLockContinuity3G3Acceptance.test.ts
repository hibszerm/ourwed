/**
 * Landing V2 — Iteration 3G.3 post-lock Security/History continuity.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_HISTORY_LOCK_Y_PCT,
  COMPACT_PHONE_SETTLED_Y_PCT,
  COMPACT_POST_LOCK_BOUNDARY_SAMPLES,
  COMPACT_POST_LOCK_RANGES,
  COMPACT_POST_LOCK_SCALE_END,
  COMPACT_POST_LOCK_Y_SVH_END,
  COMPACT_SECURITY_LOCK_Y_PCT,
  MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT_3G3,
  compactPostLockEyebrowOpAt,
  compactPostLockHeadlineOpAt,
  compactPostLockScaleAt,
  compactPostLockSecurityCopyOpAt,
  compactPostLockSupportOpAt,
  compactPostLockTravelT,
  compactPostLockYSvhAt,
  compactPostLockYearsPeekOpAt,
} from '@/features/landing-v2/mobile-story/compactPostLockContinuity'
import {
  COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT,
  COMPACT_POST_BRIEF_RUNWAY_SVH,
  COMPACT_SECURITY_LOCK_CENTER_PCT,
  COMPACT_SECURITY_LOCK_LIFT_VH,
  compactSecurityLockLiftVhAt,
} from '@/features/landing-v2/mobile-story/compactSecurityRevealProgress'
import {
  MOBILE_TRACK_POST_BRIEF_SVH_COMPACT,
  POST_BRIEF_LOCK_ESTABLISHED,
  POST_BRIEF_MORPH_START,
  POST_BRIEF_RANGES,
  postBriefShrinkScaleAt,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT,
  STUDIO_HISTORY_RANGES,
  STUDIO_LOCK_Y_VH_END_COMPACT,
  studioLockScaleAt,
  studioLockYVhAt,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'
import {
  COMPACT_TOUR_DASH_SCROLL_MS,
  COMPACT_TOUR_DAY_SCROLL_MS,
  COMPACT_TOUR_ROUTE_TRAVEL_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  assert(a === b, `${m}: ${String(a)} !== ${String(b)}`)
}

function assertIncludes(src: string, needle: string, label: string) {
  assert(src.includes(needle), `missing ${label}: ${needle}`)
}

function assertNotIncludes(src: string, needle: string, label: string) {
  assert(!src.includes(needle), `unexpected ${label}: ${needle}`)
}

function near(a: number, b: number, eps: number, m: string) {
  assert(Math.abs(a - b) <= eps, `${m}: ${a} vs ${b}`)
}

console.log('\n=== landing mobile post-lock continuity 3G.3 ===\n')

{
  /* —— Phone→lock frozen —— */
  assertEq(COMPACT_POST_BRIEF_RUNWAY_SVH, 90, 'phone→lock runway frozen')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH_COMPACT, 90, 'postBrief compact frozen')
  assertEq(POST_BRIEF_MORPH_START, 0.001, 'morph start frozen')
  assertEq(POST_BRIEF_RANGES.phoneShrink.end, 0.26, 'shrink range frozen')
  assertEq(POST_BRIEF_LOCK_ESTABLISHED, 0.58, 'lock established threshold frozen')
  assertEq(COMPACT_PHONE_SETTLED_Y_PCT, 50, 'PHONE_SETTLED_Y')
  assertEq(COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT, 50, 'alias phone settled')
  assert(postBriefShrinkScaleAt(0) === 1, 'shrink identity at 0')
  assert(compactSecurityLockLiftVhAt(POST_BRIEF_MORPH_START) === 0, 'lift 0 at morph start')
  console.log('PASS  1. phone→lock + PHONE_SETTLED_Y unchanged')
}

{
  assert(COMPACT_SECURITY_LOCK_Y_PCT >= 37 && COMPACT_SECURITY_LOCK_Y_PCT <= 40, 'Security lock 37–40%')
  assertEq(COMPACT_SECURITY_LOCK_CENTER_PCT, COMPACT_SECURITY_LOCK_Y_PCT, 'alias sync')
  near(COMPACT_SECURITY_LOCK_LIFT_VH, 11.5, 0.01, 'lift 50→38.5')
  assertEq(COMPACT_HISTORY_LOCK_Y_PCT, 18, 'History lock slot band')
  assertEq(COMPACT_POST_LOCK_Y_SVH_END, COMPACT_HISTORY_LOCK_Y_PCT - COMPACT_SECURITY_LOCK_Y_PCT, 'Y path')
  assertEq(STUDIO_LOCK_Y_VH_END_COMPACT, COMPACT_POST_LOCK_Y_SVH_END, 'studio compact Y sync')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT, MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT_3G3, 'runway sync')
  assert(MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT >= 52 && MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT <= 60, 'runway 52–60')
  console.log('PASS  2. separated Y tokens + raised Security lock')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertNotIncludes(css, 'height: calc(100dvh', 'sticky no dvh height')
  assertIncludes(css, 'height: calc(100svh - var(--lv2-nav-h))', 'sticky svh stable')
  assertIncludes(mobile, "compactRef.current ? 'svh' : 'vh'", 'svh only on compact')
  assertNotIncludes(mobile, 'visualViewport', 'no visualViewport in MobileStory')
  assertNotIncludes(
    read('src/features/landing-v2/mobile-story/compactPostLockContinuity.ts'),
    'visualViewport',
    'no visualViewport in post-lock',
  )
  assertNotIncludes(
    read('src/features/landing-v2/mobile-story/compactPostLockContinuity.ts'),
    'dvh',
    'no dvh in post-lock',
  )
  assertIncludes(
    read('src/features/landing-v2/motion/landingStableViewport.ts'),
    'LANDING_VIEWPORT_HEIGHT_NOISE_PX',
    'stable viewport policy exists',
  )
  console.log('PASS  3. stable post-lock viewport (svh; no dvh/visualViewport)')
}

{
  assertEq(COMPACT_POST_LOCK_RANGES.lockTravel.start, 0, 'no securityHold dead zone')
  assert(COMPACT_POST_LOCK_RANGES.lockTravel.end <= COMPACT_POST_LOCK_RANGES.hold.start, 'travel before hold')
  assert(COMPACT_POST_LOCK_RANGES.eyebrow.start < COMPACT_POST_LOCK_RANGES.lockTravel.end, 'History overlaps lock')
  assert(COMPACT_POST_LOCK_RANGES.securityExit.end < COMPACT_POST_LOCK_RANGES.lockTravel.end, 'copy exits during travel')
  assert(compactPostLockTravelT(0) === 0, 'travel identity')
  assert(compactPostLockTravelT(1) === 1, 'travel complete by end')
  assert(compactPostLockScaleAt(0) === 1, 'scale identity at LOCK_ESTABLISHED')
  near(compactPostLockScaleAt(1), COMPACT_POST_LOCK_SCALE_END, 1e-9, 'scale end')
  assert(compactPostLockYSvhAt(0) === 0, 'Y identity at LOCK_ESTABLISHED')
  near(compactPostLockYSvhAt(1), COMPACT_POST_LOCK_Y_SVH_END, 1e-9, 'Y end')
  assert(studioLockScaleAt(0, true) === 1, 'wired scale')
  assert(studioLockYVhAt(0, true) === 0, 'wired Y')

  /* Continuity at every boundary ±ε */
  for (const b of COMPACT_POST_LOCK_BOUNDARY_SAMPLES) {
    const y0 = compactPostLockYSvhAt(Math.max(0, b - 0.001))
    const y1 = compactPostLockYSvhAt(b)
    const y2 = compactPostLockYSvhAt(Math.min(1, b + 0.001))
    assert(y0 >= y2 - 1e-9 || b >= COMPACT_POST_LOCK_RANGES.lockTravel.end, `Y monotonic near ${b}`)
    assert(Math.abs(y1 - y0) < 0.05 && Math.abs(y2 - y1) < 0.05, `Y continuous near ${b}`)
    const s0 = compactPostLockScaleAt(Math.max(0, b - 0.001))
    const s1 = compactPostLockScaleAt(b)
    const s2 = compactPostLockScaleAt(Math.min(1, b + 0.001))
    assert(Math.abs(s1 - s0) < 0.02 && Math.abs(s2 - s1) < 0.02, `scale continuous near ${b}`)
  }

  /* Reverse determinism */
  const samples = [0, 0.25, 0.5, 0.75, 1, 0.6, 0.3, 0]
  const ys = samples.map(compactPostLockYSvhAt)
  const ss = samples.map(compactPostLockScaleAt)
  assertEq(ys[0], ys[7], 'Y reverse')
  assertEq(ss[0], ss[7], 'scale reverse')
  assertEq(ys[2], compactPostLockYSvhAt(0.5), 'Y mid stable')

  const activeShare =
    COMPACT_POST_LOCK_RANGES.lockTravel.end - COMPACT_POST_LOCK_RANGES.lockTravel.start
  const deadShare = 1 - COMPACT_POST_LOCK_RANGES.hold.start
  const activePx = activeShare * MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT
  const deadPx = deadShare * MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT
  assert(deadPx <= 20, `dead scroll ≤20svh (got ${deadPx})`)
  assert(activePx >= 35, `active lock travel ≥35svh (got ${activePx})`)
  console.log(`PASS  4. one continuous lock path (active≈${activePx.toFixed(0)}svh dead≈${deadPx.toFixed(0)}svh)`)
}

{
  /* One post-lock transform owner — phoneSystem only; no competing reveal lock */
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'data-phone-transform-owner="phoneSystem"', 'one owner')
  assertNotIncludes(mobile, 'securityRevealLock', 'no second lock layer')
  assertIncludes(mobile, 'studioLockScaleAt', 'scale via studio helper')
  assertIncludes(mobile, 'studioLockYVhAt', 'Y via studio helper')
  assertIncludes(mobile, 'compactSecurityLockLiftVhAt', 'security lift completes before studio')
  /* At LOCK_ESTABLISHED (studio 0): lift done, studio identity — single effective owner thereafter */
  assert(compactSecurityLockLiftVhAt(0.86) === -COMPACT_SECURITY_LOCK_LIFT_VH, 'lift complete')
  assert(compactPostLockYSvhAt(0) === 0, 'studio adds from security seat')
  console.log('PASS  5. one post-lock transform owner')
}

{
  assert(compactPostLockSecurityCopyOpAt(0) === 1, 'Security readable at start')
  assert(compactPostLockSecurityCopyOpAt(1) === 0, 'Security gone at end')
  assert(compactPostLockEyebrowOpAt(0.2) === 0, 'History not early')
  assert(compactPostLockEyebrowOpAt(0.5) > 0.5, 'History mid')
  assert(compactPostLockHeadlineOpAt(0.55) >= 0.99, 'headline settled')
  assert(compactPostLockSupportOpAt(0.62) >= 0.99, 'support settled')
  assert(compactPostLockYearsPeekOpAt(0.44) === 0, 'peek not before support band')
  assert(compactPostLockYearsPeekOpAt(0.7) >= 0.99, '2026 peek at History established')
  /* No empty frame: when Security <0.3, History eyebrow already >0 */
  const pEmpty = 0.35
  assert(compactPostLockSecurityCopyOpAt(pEmpty) < 0.2, 'Security mostly gone')
  assert(compactPostLockEyebrowOpAt(pEmpty) > 0.3, 'History already visible — no empty beige')
  console.log('PASS  6. Security/History overlap — no empty frame')
}

{
  const reveal = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx')
  const revealCss = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.module.css')
  assertIncludes(reveal, 'yearsPeek', '2026 peek in sticky')
  assertIncludes(reveal, 'data-studio-years-peek', 'peek marker')
  assertIncludes(reveal, 'compactPostLockEyebrowOpAt', 'compact History ops')
  assertIncludes(reveal, 'compactIntro ? 1 : studioLockSettledGateAt(p)', 'compact skips settled gate')
  assertIncludes(revealCss, 'yearsPeek', 'peek CSS')
  assertIncludes(revealCss, 'bottom: clamp', 'peek lower band ~84%')
  assertIncludes(revealCss, 'top: 14%', 'History composition raised')
  assertIncludes(revealCss, 'clamp(1.25rem, 5.5vw, 1.75rem)', 'lock→eyebrow gap')
  console.log('PASS  7. 2026 peek + History slot gap')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  assertIncludes(histCss, 'opacity: 1', 'years base visible')
  assertIncludes(histCss, 'animation-range: entry 0% cover 36%', 'season early entry')
  assertIncludes(histCss, 'padding-top: clamp(0.35rem, 1.5vw, 0.75rem)', 'tight yearsOnly gap')
  assertNotIncludes(histCss, 'from {\n    opacity: 0;', 'no opacity:0 keyframes')
  for (const vw of [375, 390, 393, 402, 430]) {
    const pad = Math.min(0.75 * 16, Math.max(0.35 * 16, 0.015 * vw))
    assert(pad <= 24, `${vw} yearsOnly pad ≤24px`)
  }
  console.log('PASS  8. years visibility + early season range + gap')
}

{
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  const stickyDecls = (css.match(/position:\s*sticky/g) ?? []).length
  assert(stickyDecls <= 2, `sticky ≤2 (got ${stickyDecls})`)
  assertNotIncludes(
    read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx'),
    'position: sticky',
    'no nested sticky',
  )
  console.log(`PASS  9. sticky count bounded (${stickyDecls})`)
}

{
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route')
  console.log('PASS  10. phone tour timing unchanged')
}

{
  /* Desktop studio ranges frozen */
  assertEq(STUDIO_HISTORY_RANGES.securityHold.end, 0.06, 'desktop hold frozen')
  assertEq(STUDIO_HISTORY_RANGES.lockTravel.start, 0.06, 'desktop travel frozen')
  console.log('PASS  11. desktop post-lock frozen')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  12. registration lock')
}

console.log('\nPASS  landing mobile post-lock continuity 3G.3\n')
