/**
 * Landing V2 — Iteration 3F Mobile Story headline + time-driven phone demo.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PHONE_DEMO_PHASES,
  PHONE_DEMO_SETTLE_DELAY_MS,
  phoneDemoActiveLayerCount,
  phoneDemoTotalDurationMs,
} from '@/features/landing-v2/devices/flattenedPhoneAutoplaySchedule'
import {
  HEADLINE_SEP_COMPACT_SCALE,
  HEADLINE_SEP_PX,
  compactHeadlineSepRatio,
  headlineSepProgressSpan,
  headlineSepYAt,
  phoneSettled,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import { MOBILE_TRACK_PRE_SVH_COMPACT } from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertIncludes(src: string, needle: string, label: string) {
  assert(src.includes(needle), `missing ${label}: ${needle}`)
}

function assertNotIncludes(src: string, needle: string, label: string) {
  assert(!src.includes(needle), `unexpected ${label}: ${needle}`)
}

/** Approximate compact preTravel at vh=874, nav=68 (matches measure geometry). */
function approxPreTravel(vh = 874, nav = 68): number {
  const usable = vh - nav
  const preSvh = MOBILE_TRACK_PRE_SVH_COMPACT
  const dash = 36
  const post = 24
  const postBrief = 112
  const mappingSvh = preSvh + dash + post + postBrief
  const svh = vh / 100
  const mappingHeight = mappingSvh * svh
  const preHeight = mappingHeight * (preSvh / mappingSvh)
  return Math.max(1, preHeight - usable)
}

console.log('\n=== landing mobile story 3F ===\n')

{
  const beforeScale = 188 / 155
  const beforeVisual = HEADLINE_SEP_PX * beforeScale
  const pre = approxPreTravel()
  const scroll = headlineSepProgressSpan() * pre
  const beforeRatio = beforeVisual / scroll
  const afterRatio = compactHeadlineSepRatio(pre)
  assert(beforeRatio > 0.65, `BEFORE ratio should be high (got ${beforeRatio.toFixed(3)})`)
  assert(afterRatio >= 0.35 && afterRatio <= 0.6, `AFTER ratio in band (got ${afterRatio.toFixed(3)})`)
  assert(afterRatio <= 0.65, 'hard max 0.65')
  assert(Math.abs(afterRatio - 0.45) < 0.12, `near 0.45 target (got ${afterRatio.toFixed(3)})`)
  console.log(
    `PASS  1. headline ratio BEFORE≈${beforeRatio.toFixed(3)} AFTER≈${afterRatio.toFixed(3)} (scroll≈${scroll.toFixed(0)} visual=${HEADLINE_SEP_PX * HEADLINE_SEP_COMPACT_SCALE})`,
  )
}

{
  assert(
    headlineSepYAt(0.52, { linear: true }) === HEADLINE_SEP_PX,
    'linear reaches full sep at end',
  )
  assert(
    headlineSepYAt(0.43, { linear: true }) < headlineSepYAt(0.43),
    'eased front-loads more than linear mid-window',
  )
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'linear: true', 'compact sep linear')
  assertIncludes(mobile, 'HEADLINE_SEP_COMPACT_SCALE', 'compact scale')
  assertNotIncludes(mobile, '188 / 155', 'amplified sep scale removed')
  assertNotIncludes(mobile, 'letter-spacing:', 'no letter-spacing in tsx motion')
  console.log('PASS  2. headline linear + reduced scale')
}

{
  assert(phoneSettled(0.74), 'PHONE_SETTLED at hold start')
  assert(!phoneSettled(0.73), 'not settled before hold')
  console.log('PASS  3. PHONE_SETTLED definition')
}

{
  assert(PHONE_DEMO_SETTLE_DELAY_MS >= 250 && PHONE_DEMO_SETTLE_DELAY_MS <= 500, 'settle delay')
  assert(PHONE_DEMO_PHASES.length >= 7, 'multi-phase tour')
  assert(PHONE_DEMO_PHASES[0]?.a === 'dashStrip', 'starts dashboard')
  assert(PHONE_DEMO_PHASES[PHONE_DEMO_PHASES.length - 1]?.a === 'brief', 'ends brief')
  const total = phoneDemoTotalDurationMs()
  assert(total >= 7000 && total <= 12000, `duration ~7–10s (got ${total})`)
  for (let i = 0; i < PHONE_DEMO_PHASES.length; i++) {
    assert(phoneDemoActiveLayerCount(i) <= 2, `phase ${i} ≤2 layers`)
  }
  console.log(`PASS  4. phase schedule total=${total}ms`)
}

{
  const autoplay = read(
    'src/features/landing-v2/devices/FlattenedPhoneAutoplay.tsx',
  )
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'FlattenedPhoneAutoplay', 'compact uses autoplay')
  assertIncludes(autoplay, 'phoneSettled', 'starts after settle')
  assertIncludes(autoplay, 'PHONE_DEMO_SETTLE_DELAY_MS', 'calm beat')
  assertIncludes(autoplay, 'IntersectionObserver', 'offscreen gate')
  assertNotIncludes(autoplay, 'appProgress', 'not scroll-scrubbed')
  assertNotIncludes(autoplay, 'useScroll', 'no useScroll')
  assertNotIncludes(autoplay, 'requestAnimationFrame', 'no rAF engine')
  assertNotIncludes(autoplay, 'filter:', 'no filter motion')
  assertIncludes(autoplay, 'translate3d', 'compositor transform')
  assertIncludes(mobile, 'MOBILE_TRACK_DASH_SVH_COMPACT', 'short compact runway')
  assertIncludes(mobile, 'PHONE_ENTER_Y_COMPACT = 48', 'phone entrance frozen')
  assertIncludes(mobile, 'PHONE_SCALE_START_COMPACT = 0.94', 'phone scale frozen')
  console.log('PASS  5. autoplay architecture + entrance freeze')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  6. registration')
}

console.log('\nPASS  landing mobile story 3F\n')
