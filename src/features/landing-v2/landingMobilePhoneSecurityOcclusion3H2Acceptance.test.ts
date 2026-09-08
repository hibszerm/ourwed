/**
 * Landing V2 — Iteration 3H.2 phone→Security occlusion.
 *
 * Root cause (3H.1): sibling stacking contexts both used z-index:2, so later
 * DOM (.flow Security) painted ABOVE .track — sticky child z-index could not
 * escape. Plus .securityInner container transform animation compounded the
 * "Security flies over phone" perception.
 *
 * Fix: compact .track z-index:3 > .flow[3h2] z-index:1; animate Security
 * children only; freeze History / Layers / seasons / phone release timing.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

function extractConst(src: string, name: string): number {
  const m = src.match(new RegExp(`const ${name} = (\\d+)`))
  assert(Boolean(m), `const ${name} not found`)
  return Number(m![1])
}

console.log('\n=== landing mobile phone→Security occlusion 3H.2 ===\n')

{
  const mobileCss = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const featuresShell = read('src/features/landing-v2/mobile-story/FeaturesExitShell.module.css')

  /* Ancestor stacking contract — not child z-index alone. */
  assertIncludes(mobileCss, 'z-index: 3;', 'compact track stacking ancestor z=3')
  assertIncludes(histCss, "data-compact-native-security='3h2']", '3h2 flow gate')
  assertIncludes(histCss, 'z-index: 1;', 'Security flow z=1 below track')
  assertIncludes(featuresShell, 'z-index: 4;', 'Features shell stays above track')
  assertIncludes(mobile, "data-phone-security-stack={isCompactViewport ? 'track-over-flow' : 'false'}", 'stack marker')
  assertIncludes(hist, 'data-security-stack="below-phone-track"', 'Security below marker')
  assertIncludes(mobile, "data-compact-native-exit={isCompactViewport ? '3h2' : 'false'}", '3h2 exit')
  assertIncludes(hist, "data-compact-native-security={showSecurity ? '3h2' : 'false'}", '3h2 security')
  console.log('PASS  1. sibling stacking: track(3) > flow(1); Features(4) > track')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  /* Security root must not animate / create transform stacking context. */
  assertNotIncludes(histCss, '.securityInner {\n      animation:', 'no securityInner animation')
  assertNotIncludes(histCss, '@keyframes lv2SecurityReveal', 'container reveal keyframe removed')
  assertIncludes(histCss, 'transform: none;', 'securityInner transform none')
  assertNotIncludes(
    histCss,
    `.securitySection {
  width: 100%;
  position: relative;
  z-index:`,
    'securitySection no z-index stacking context',
  )
  /* Child-only motion. */
  assertIncludes(histCss, '.securityLockWrap {', 'lock child anim target')
  assertIncludes(histCss, '.securityEyebrow {', 'eyebrow child')
  assertIncludes(histCss, '.securityHeadline {', 'headline child')
  assertIncludes(histCss, '.securitySupport {', 'body child')
  assertIncludes(histCss, '.securityMicro {', 'bullets child')
  assertIncludes(histCss, 'translate3d(0, 8px, 0)', 'lock ≤10px')
  assertIncludes(histCss, 'translate3d(0, 10px, 0)', 'eyebrow/body 10px')
  assertIncludes(histCss, 'translate3d(0, 12px, 0)', 'headline 12px')
  assertNotIncludes(histCss, 'translate3d(0, 18px, 0)', 'no large Security travel')
  assertNotIncludes(histCss, 'translate3d(0, 40px, 0)', 'no 40px+ travel')
  console.log('PASS  2. Security children-only micro-motion; no container transform')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  /* Overlap amount FROZEN from 3H.1 — stacking was the bug, not the number. */
  assertIncludes(
    histCss,
    '--security-under-phone-overlap: calc(0.52 * (100svh - var(--lv3-nav-h, 68px)));',
    'overlap 0.52 svh frozen',
  )
  assertNotIncludes(histCss, '100dvh', 'no dvh')
  assertNotIncludes(histCss, 'visualViewport', 'no visualViewport')
  console.log('PASS  3. overlap amount unchanged; stable svh only')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertEq(extractConst(mobile, 'MOBILE_TRACK_DASH_SVH_COMPACT'), 20, 'dash freeze')
  assertEq(extractConst(mobile, 'MOBILE_TRACK_POST_SVH_COMPACT'), 12, 'post freeze')
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash tour')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day tour')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route tour')
  assertIncludes(mobile, 'if (compactRef.current) return enterScale', 'no exit scale')
  assertIncludes(mobile, 'if (compactRef.current) return enterPx', 'native Y only')
  console.log('PASS  4. phone release timing + 1:1 exit frozen from 3H.1')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  /* History freeze — value-for-value. */
  assertIncludes(histCss, 'padding-top: clamp(1.75rem, 4.5vw, 2.5rem)', 'History top padding')
  assertIncludes(histCss, 'clamp(1.125rem, 4.5vw, 1.5rem)', 'Layers→eyebrow gap')
  assertIncludes(histCss, 'clamp(30px, 8vw, 36px)', 'Layers3 size')
  assertIncludes(hist, 'Layers3', 'Layers3')
  assertIncludes(hist, 'strokeWidth={1.5}', 'stroke')
  assertIncludes(
    histCss,
    `@keyframes lv2SeasonReveal {
  from {
    opacity: 0.4;
    transform: translate3d(0, 16px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}`,
    'season keyframes frozen',
  )
  assertIncludes(histCss, 'animation-range: entry 0% cover 34%', 'season range frozen')
  assertIncludes(
    histCss,
    `@keyframes lv2HistoryIntroReveal {
  from {
    opacity: 0.5;
    transform: translate3d(0, 12px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}`,
    'History intro keyframes frozen',
  )
  assertIncludes(histCss, '.historySection {\n      animation: lv2HistoryIntroReveal', 'History anim target')
  console.log('PASS  5. History / Layers / seasons frozen')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertNotIncludes(hist, 'useScroll', 'no useScroll')
  assertNotIncludes(hist, 'useMotionValue', 'no MotionValue')
  assertNotIncludes(hist, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(hist, 'addEventListener("scroll"', 'no scroll listener')
  assertIncludes(hist, 'data-security-sticky="0"', 'sticky 0')
  console.log('PASS  6. zero Security scroll engine')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  7. registration lock')
}

console.log('\nPASS  landing mobile phone→Security occlusion 3H.2\n')
