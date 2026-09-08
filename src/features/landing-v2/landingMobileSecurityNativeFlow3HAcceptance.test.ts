/**
 * Landing V2 — Iteration 3H compact Security/History native document flow.
 *
 * Architecture change (owner): remove compact phone→lock theater.
 * Phone unpins after tour (1:1 document exit). Security + History are
 * normal-flow sections with CSS view-timeline enhancement only.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_TOUR_DASH_SCROLL_MS,
  COMPACT_TOUR_DAY_SCROLL_MS,
  COMPACT_TOUR_ROUTE_TRAVEL_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  MOBILE_TRACK_POST_BRIEF_SVH_COMPACT,
  POST_BRIEF_MORPH_START,
  POST_BRIEF_RANGES,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH,
  STUDIO_HISTORY_RANGES,
  STUDIO_LOCK_SCALE_END,
  STUDIO_LOCK_Y_VH_END,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'
import {
  LV2_HISTORY_SEASONS,
  LV2_SECURITY_COPY,
  LV2_SECURITY_MICRO_POINTS,
} from '@/features/landing-v2/security-history/securityHistoryClaims'

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

function countOccurrences(src: string, needle: string): number {
  let n = 0
  let i = 0
  while ((i = src.indexOf(needle, i)) !== -1) {
    n += 1
    i += needle.length
  }
  return n
}

console.log('\n=== landing mobile security native flow 3H ===\n')

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, "data-compact-native-exit={isCompactViewport ? '3h3' : 'false'}", '3H/3H.3 marker')
  assertIncludes(mobile, "'native-exit'", 'native exit transition')
  assertIncludes(mobile, "'--mobile-track-post-brief-svh': isCompactViewport ? 0", 'compact postBrief 0')
  assertIncludes(mobile, "'--mobile-track-studio-history-svh': isCompactViewport", 'compact studio gated')
  assertIncludes(mobile, '? 0', 'compact studio 0')
  assertIncludes(mobile, 'if (compactRef.current) return enterScale', 'no compact phone shrink')
  assertIncludes(mobile, 'if (compactRef.current) return enterPx', 'no compact phone Y morph')
  assertIncludes(mobile, 'STATIC_LOCK_MORPH', 'compact identity lockMorph')
  assertIncludes(mobile, '{!isCompactViewport ? (', 'Security/History not in compact sticky')
  assertNotIncludes(mobile, 'compactIntro', 'no compact StudioHistoryReveal intro')
  assertNotIncludes(mobile, 'compactSecurityLockLiftVhAt', 'no securityLift')
  assertNotIncludes(mobile, 'compactPostBriefVisualAt', 'no compact morph remap')
  assertNotIncludes(mobile, 'postBriefProgress={postBriefProgress}', 'no tour morph freeze signal')
  console.log('PASS  1. compact phone→lock theater removed; native exit')
}

{
  /* Desktop morph constants frozen */
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'desktop postBrief')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH_COMPACT, 90, 'helper still exports compact 90 (unused by Mobile)')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH, 145, 'desktop studio')
  assertEq(POST_BRIEF_MORPH_START, 0.001, 'desktop morph start')
  assertEq(POST_BRIEF_RANGES.phoneShrink.end, 0.26, 'desktop shrink')
  assertEq(STUDIO_LOCK_Y_VH_END, -30, 'desktop lock Y')
  assertEq(STUDIO_LOCK_SCALE_END, 0.175, 'desktop lock scale')
  assertEq(STUDIO_HISTORY_RANGES.lockTravel.start, 0.06, 'desktop lock travel')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'postBriefShrinkScaleAt(Number(pb))', 'desktop shrink wired')
  assertIncludes(mobile, 'StudioHistoryReveal progress={studioProgress}', 'desktop History sticky')
  console.log('PASS  2. desktop phone→lock preserved')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  assertIncludes(hist, 'data-compact-security-section', 'Security section in document flow')
  assertIncludes(hist, 'data-security-sticky="0"', 'Security sticky 0')
  assertIncludes(hist, 'SecurityLockGraphic', 'Security lock in Security DOM')
  assertIncludes(hist, 'LV2_SECURITY_COPY', 'Security copy')
  assertIncludes(hist, 'showSecurity', 'compact Security gate')
  assertIncludes(hist, 'data-studio-history-intro', 'History intro in same flow')
  assertIncludes(hist, 'data-studio-year-chapter', 'years in flow')
  assertIncludes(hist, 'Layers3', 'History uses Layers3 (3H.1)')
  assertNotIncludes(hist, 'yearsPeek', 'no 2026 peek')
  assertNotIncludes(hist, 'data-studio-years-peek', 'no peek marker')
  assertNotIncludes(hist, 'whileInView', 'no Framer scroll scrub for entry')
  assertNotIncludes(hist, 'useTransform', 'no MotionValues for Security/History')
  assertIncludes(histCss, 'min-height: 0', 'Security content-driven height (3H.1)')
  assertNotIncludes(histCss, 'min-height: calc(100svh - var(--lv3-nav-h, 68px))', 'no forced full-svh Security')
  assertNotIncludes(histCss, '100dvh', 'no dvh')
  assertNotIncludes(histCss, 'visualViewport', 'no visualViewport')
  assertIncludes(histCss, 'justify-content: center', 'Security block centered')
  assertIncludes(histCss, '--studio-history-to-year-gap', 'paragraph→year gap token')
  assertIncludes(histCss, 'clamp(5.5rem, 14vw, 7.5rem)', 'gap ~88–120px')
  assertIncludes(histCss, '@supports (animation-timeline: view())', 'progressive enhancement')
  assertIncludes(histCss, 'opacity: 1', 'base visible')
  console.log('PASS  3. Security + History native flow composition')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const reveal = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx')
  assertNotIncludes(reveal, 'yearsPeek', 'peek deleted from StudioHistoryReveal')
  assertNotIncludes(reveal, 'yearPeekLabel', 'peek label deleted')
  assertNotIncludes(hist, 'data-studio-years-peek', 'no peek marker')
  assertEq(countOccurrences(hist, 'data-studio-year-label'), 1, 'one year-label template')
  assertEq(LV2_HISTORY_SEASONS.length, 3, 'three seasons')
  assertEq(LV2_HISTORY_SEASONS[0]!.year, 2026, '2026')
  assertEq(LV2_HISTORY_SEASONS[1]!.year, 2027, '2027')
  assertEq(LV2_HISTORY_SEASONS[2]!.year, 2028, '2028')
  assertIncludes(hist, '{seasons.map((season) => (', 'years from single map')
  console.log('PASS  4. exactly one 2026/2027/2028 source — peek removed')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  assertIncludes(histCss, 'animation-timeline: view()', 'view timeline')
  assertIncludes(histCss, 'transform: translate3d', 'transform only motion')
  assertNotIncludes(histCss, 'filter:', 'no blur')
  assertNotIncludes(histCss, 'scale(', 'no scale keyframes in season')
  for (const vw of [375, 390, 393, 402, 430]) {
    const gap = Math.min(7.5 * 16, Math.max(5.5 * 16, 0.14 * vw))
    assert(gap >= 80 && gap <= 150, `${vw}px support→2026 gap ≈${gap.toFixed(0)}`)
  }
  assertIncludes(histCss, 'clamp(1.125rem, 4.5vw, 1.5rem)', 'Layers3→eyebrow gap')
  console.log('PASS  5. motion props + History gap bounds')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertNotIncludes(hist, 'addEventListener(\"scroll\"', 'no scroll listener')
  assertNotIncludes(hist, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(hist, 'useScroll', 'no useScroll')
  assertNotIncludes(hist, 'useMotionValue', 'no MotionValue Security/History')
  assertIncludes(mobile, 'data-mobile-phone-lock-owner={isCompactViewport ? \'false\' : \'true\'}', 'compact not lock owner')
  console.log('PASS  6. zero JS scroll cost for Security/History')
}

{
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route')
  assertIncludes(LV2_SECURITY_COPY.eyebrow, 'Bezpieczeństwo', 'copy')
  assertEq(LV2_SECURITY_MICRO_POINTS.length, 3, 'three bullets')
  console.log('PASS  7. phone tour timing + Security copy unchanged')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  8. registration lock')
}

console.log('\nPASS  landing mobile security native flow 3H\n')
