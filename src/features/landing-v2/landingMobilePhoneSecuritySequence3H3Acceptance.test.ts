/**
 * Landing V2 — Iteration 3H.3 phone-first Security sequence.
 *
 * 3H.2 fixed stacking but kept negative margin overlap, so Security scrolled
 * into view WHILE the phone sticky was still pinned. Owner rejects that.
 *
 * 3H.3: remove negative overlap; place Security in normal flow below the phone
 * track with a reveal delay ≈ 0.47 × displayed phone height so lock enters
 * from the bottom only after the phone has moved first.
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

/** Compact phone height at 402×874 — mirrors HeroPhoneFrame CSS. */
function phoneDisplayedHeight(vw = 402, vh = 874, nav = 68): number {
  const ratio = 0.4613733906
  const usable = vh - nav
  const avail = usable - 24
  const phoneW = Math.min(0.765 * vw, vw - 56, avail * ratio)
  return phoneW / ratio
}

console.log('\n=== landing mobile phone→Security sequence 3H.3 ===\n')

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')

  assertNotIncludes(histCss, '--security-under-phone-overlap', 'negative overlap token removed')
  assertNotIncludes(histCss, 'margin-top: calc(-1 *', 'no negative flow margin')
  assertNotIncludes(histCss, '0.52 * (100svh', 'old 0.52 overlap gone')
  assertNotIncludes(hist, 'data-security-under-phone', 'under-phone marker removed')
  assertIncludes(hist, "data-compact-native-security={showSecurity ? '3h3' : 'false'}", '3h3')
  assertIncludes(hist, 'data-security-phone-first="3h3"', 'phone-first marker')
  assertIncludes(mobile, "data-compact-native-exit={isCompactViewport ? '3h3' : 'false'}", '3h3 exit')
  assertIncludes(histCss, "data-compact-native-security='3h3']", '3h3 CSS gate')
  assertIncludes(histCss, 'margin-top: 0', 'zero pull-up')
  assertIncludes(histCss, '--security-reveal-delay: calc(0.47 * var(--phone-compact-h))', '0.47P delay')
  assertIncludes(
    histCss,
    'padding-top: max(0px, calc(var(--security-reveal-delay) - var(--security-lock-pad-top)))',
    'spacer = D − pad',
  )
  console.log('PASS  1. negative Security overlap removed; phone-first spacer')
}

{
  const P = phoneDisplayedHeight()
  const D = 0.47 * P
  const padTop = Math.min(4.5 * 16, Math.max(3.25 * 16, 0.08 * 874))
  const spacer = Math.max(0, D - padTop)
  const ratio = D / P
  assert(P > 620 && P < 720, `P≈667 got ${P.toFixed(1)}`)
  assert(D > 280 && D < 340, `D≈313 got ${D.toFixed(1)}`)
  assert(ratio >= 0.4 && ratio <= 0.55, `D/P in 0.40–0.55 got ${ratio.toFixed(3)}`)
  assert(spacer > 200 && spacer < 280, `spacer≈243 got ${spacer.toFixed(1)}`)
  /* At R0: lock.top ≈ V + spacer + pad = V + D → first visible after scroll D. */
  assertEq(Math.round(spacer + padTop), Math.round(D), 'spacer+pad = D')
  console.log(
    `PASS  2. geometry @402×874 P=${P.toFixed(0)} D=${D.toFixed(0)} (${(ratio * 100).toFixed(0)}%P) spacer=${spacer.toFixed(0)}`,
  )
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const mobileCss = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertEq(extractConst(mobile, 'MOBILE_TRACK_DASH_SVH_COMPACT'), 20, 'dash freeze')
  assertEq(extractConst(mobile, 'MOBILE_TRACK_POST_SVH_COMPACT'), 12, 'post freeze')
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash tour')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day tour')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route tour')
  assertIncludes(mobile, 'if (compactRef.current) return enterScale', 'scale frozen')
  assertIncludes(mobile, 'if (compactRef.current) return enterPx', 'native Y')
  assertIncludes(mobileCss, 'z-index: 3;', 'track stacking retained')
  assertIncludes(mobile, 'track-over-flow', 'stack marker retained')
  console.log('PASS  3. phone release timing + exit ratio + stacking frozen')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertIncludes(histCss, 'z-index: 1;', 'flow below track')
  assertNotIncludes(histCss, '@keyframes lv2SecurityReveal', 'no Security root transform anim')
  assertIncludes(histCss, 'translate3d(0, 8px, 0)', 'lock ≤8px')
  assertIncludes(histCss, 'translate3d(0, 12px, 0)', 'headline ≤12px')
  assertNotIncludes(hist, 'useScroll', 'no useScroll')
  assertNotIncludes(hist, 'useMotionValue', 'no MotionValue')
  assertNotIncludes(hist, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(hist, 'addEventListener("scroll"', 'no scroll listener')
  assertIncludes(hist, 'data-security-sticky="0"', 'sticky 0')
  console.log('PASS  4. Security micro-motion + zero scroll engine; stacking safety')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertIncludes(hist, 'Layers3', 'Layers3')
  assertIncludes(hist, 'strokeWidth={1.5}', 'stroke')
  assertIncludes(histCss, 'padding-top: clamp(1.75rem, 4.5vw, 2.5rem)', 'History top')
  assertIncludes(histCss, 'clamp(1.125rem, 4.5vw, 1.5rem)', 'Layers gap')
  assertIncludes(histCss, 'clamp(30px, 8vw, 36px)', 'Layers size')
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
    'season frozen',
  )
  assertIncludes(histCss, 'animation-range: entry 0% cover 34%', 'season range')
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
    'History intro frozen',
  )
  console.log('PASS  5. History / Layers / seasons frozen')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  6. registration lock')
}

console.log('\nPASS  landing mobile phone→Security sequence 3H.3\n')
