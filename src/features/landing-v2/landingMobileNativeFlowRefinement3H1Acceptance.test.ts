/**
 * Landing V2 — Iteration 3H.1 compact native-flow refinement.
 *
 * - Earlier phone sticky release (~30% less settled→release dead scroll)
 * - Phone physically uncovers Security (document overlap + stacking)
 * - Restrained compact phone shadow
 * - Tighter Security→History spacing
 * - History Lock → Layers3 (compact only)
 * - Season view-timeline motion FROZEN from 3H
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_TOUR_DASH_SCROLL_MS,
  COMPACT_TOUR_DAY_SCROLL_MS,
  COMPACT_TOUR_ROUTE_TRAVEL_MS,
} from '@/features/landing-v2/devices/compactPhoneProductTourTiming'
import { LV2_HISTORY_SEASONS } from '@/features/landing-v2/security-history/securityHistoryClaims'

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

/** Settled→release dead scroll at 402×874 (svh≈874, nav=68). */
function settledToReleaseDeadPx(contentSvh: number, preSvh = 220, nav = 68, vh = 874) {
  const S = vh / 100
  const U = vh - nav
  const settle = 0.74 * (preSvh * S - U)
  const release = contentSvh * S - U
  return release - settle
}

console.log('\n=== landing mobile native flow refinement 3H.1 ===\n')

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const dash = extractConst(mobile, 'MOBILE_TRACK_DASH_SVH_COMPACT')
  const post = extractConst(mobile, 'MOBILE_TRACK_POST_SVH_COMPACT')
  assertEq(dash, 20, 'compact dash svh')
  assertEq(post, 12, 'compact post svh')

  const before = settledToReleaseDeadPx(220 + 36 + 24)
  const after = settledToReleaseDeadPx(220 + dash + post)
  const reduction = (1 - after / before) * 100
  assert(before > 780 && before < 850, `BEFORE dead px ≈815, got ${before.toFixed(1)}`)
  assert(after > 540 && after < 600, `AFTER dead px ≈570, got ${after.toFixed(1)}`)
  assert(reduction >= 25 && reduction <= 35, `reduction ~30%, got ${reduction.toFixed(1)}%`)
  assertIncludes(mobile, "data-compact-native-exit={isCompactViewport ? '3h2' : 'false'}", '3h2 marker')
  assertIncludes(mobile, 'above-security', 'phone release layer marker')
  assertIncludes(mobile, 'if (compactRef.current) return enterScale', 'scale=enter only on compact')
  assertIncludes(mobile, 'if (compactRef.current) return enterPx', 'Y=enter only on compact')
  assertNotIncludes(mobile, 'compactSecurityLockLiftVhAt', 'no securityLift')
  assertNotIncludes(mobile, 'compactPostBriefVisualAt', 'no morph remap')
  console.log(
    `PASS  1. settled→release dead scroll ${before.toFixed(0)}→${after.toFixed(0)}px (−${reduction.toFixed(1)}%)`,
  )
}

{
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash tour ms frozen')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day tour ms frozen')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route tour ms frozen')
  console.log('PASS  2. phone tour timings unchanged')
}

{
  const phoneCss = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.module.css')
  assertIncludes(phoneCss, '0 30px 80px rgba(30, 25, 20, 0.12)', 'desktop ambient shadow preserved')
  assertIncludes(phoneCss, '0 14px 28px rgba(30, 25, 20, 0.07)', 'compact restrained contact shadow')
  assertIncludes(phoneCss, '0 4px 10px rgba(30, 25, 20, 0.045)', 'compact soft secondary')
  assertIncludes(phoneCss, '@media (max-width: 1100px)', 'compact shadow media gate')
  console.log('PASS  3. compact phone shadow restrained; desktop preserved')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const mobileCss = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')

  assertIncludes(hist, 'data-security-under-phone="true"', 'Security under-phone marker')
  assertIncludes(hist, "data-compact-native-security={showSecurity ? '3h2' : 'false'}", '3h2 security')
  assertIncludes(histCss, '--security-under-phone-overlap', 'overlap token')
  assertIncludes(histCss, "margin-top: calc(-1 * var(--security-under-phone-overlap))", 'negative margin overlap')
  assertIncludes(histCss, '0.52 * (100svh', 'overlap uses stable svh')
  assertNotIncludes(histCss, '100dvh', 'no dvh')
  assertIncludes(mobileCss, 'z-index: 3;', 'track above Security (3H.2)')
  assertIncludes(histCss, 'z-index: 1;', 'Security flow below phone track')
  assertNotIncludes(histCss, 'min-height: calc(100svh - var(--lv3-nav-h, 68px))', 'no full-svh Security theater')
  assertIncludes(histCss, 'min-height: 0', 'content-driven Security height')
  assertIncludes(histCss, 'padding-top: clamp(1.75rem, 4.5vw, 2.5rem)', 'tight History intro top')
  /* Micro-settle only — uncover is geometry, not travel. */
  assertIncludes(
    histCss,
    `@keyframes lv2SecurityLockReveal {
  from {
    opacity: 0.72;
    transform: translate3d(0, 8px, 0);
  }`,
    'lock micro-settle Y≤10',
  )
  assertIncludes(histCss, 'lv2SecurityHeadlineReveal', 'headline child reveal')
  assertNotIncludes(histCss, '@keyframes lv2SecurityReveal', 'no container Security reveal')
  assertNotIncludes(hist, 'useScroll', 'no useScroll')
  assertNotIncludes(hist, 'useMotionValue', 'no MotionValue')
  assertNotIncludes(hist, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(hist, 'addEventListener("scroll"', 'no scroll listener')
  console.log('PASS  4. Security under-phone geometry + micro-motion; no scroll JS')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const reveal = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx')

  assertIncludes(hist, 'Layers3', 'Layers3 import/use')
  assertIncludes(hist, "from 'lucide-react'", 'existing Lucide')
  assertIncludes(hist, 'data-studio-history-icon="layers3"', 'Layers3 marker')
  assertIncludes(hist, 'strokeWidth={1.5}', 'stroke 1.5')
  assertIncludes(histCss, 'clamp(30px, 8vw, 36px)', 'Layers3 size 30–36')
  assertIncludes(histCss, 'clamp(1.125rem, 4.5vw, 1.5rem)', 'icon→eyebrow ~18–24px')
  /* Compact path: Layers3; PRM desktop retains SecurityLockGraphic. */
  assertIncludes(hist, 'isCompact ? (', 'Layers3 gated to compact')
  assertIncludes(hist, 'data-studio-lock-flow', 'PRM/desktop flow retains lock path')
  /* Desktop sticky History still uses its own reveal (unchanged). */
  assertNotIncludes(reveal, 'Layers3', 'desktop StudioHistoryReveal unchanged (no Layers3)')
  assertIncludes(reveal, 'data-studio-lock-slot', 'desktop History lock slot preserved')
  console.log('PASS  5. compact Layers3; desktop History lock preserved')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  /* Season keyframes FROZEN — identical to 3H. */
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
    'season reveal keyframes identical to 3H',
  )
  assertIncludes(histCss, 'animation-range: entry 0% cover 34%', 'season range frozen')
  assertEq(LV2_HISTORY_SEASONS.length, 3, 'three seasons')
  assertEq(LV2_HISTORY_SEASONS[0]!.year, 2026, '2026')
  assertEq(LV2_HISTORY_SEASONS[1]!.year, 2027, '2027')
  assertEq(LV2_HISTORY_SEASONS[2]!.year, 2028, '2028')
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertEq((hist.match(/data-studio-year-label/g) || []).length, 1, 'one year-label template')
  assertNotIncludes(hist, 'yearsPeek', 'no peek')
  console.log('PASS  6. season motion frozen; one year each')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertIncludes(hist, 'data-security-sticky="0"', 'Security sticky 0')
  assertNotIncludes(hist, 'position: sticky', 'no sticky in TSX')
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  assertNotIncludes(histCss, 'position: sticky', 'History/Security CSS sticky 0')
  console.log('PASS  7. sticky counts remain 0')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  8. registration lock')
}

console.log('\nPASS  landing mobile native flow refinement 3H.1\n')
