/**
 * Landing V2 — Iteration 3F headline calibration (phone tour superseded by 3F.1).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

function approxPreTravel(vh = 874, nav = 68): number {
  const usable = vh - nav
  const preSvh = MOBILE_TRACK_PRE_SVH_COMPACT
  const mappingSvh = preSvh + 36 + 24 + 112
  const svh = vh / 100
  const mappingHeight = mappingSvh * svh
  const preHeight = mappingHeight * (preSvh / mappingSvh)
  return Math.max(1, preHeight - usable)
}

console.log('\n=== landing mobile story 3F (headline freeze) ===\n')

{
  const beforeScale = 188 / 155
  const beforeVisual = HEADLINE_SEP_PX * beforeScale
  const pre = approxPreTravel()
  const scroll = headlineSepProgressSpan() * pre
  const beforeRatio = beforeVisual / scroll
  const afterRatio = compactHeadlineSepRatio(pre)
  assert(beforeRatio > 0.65, `BEFORE ratio high (got ${beforeRatio.toFixed(3)})`)
  assert(afterRatio >= 0.35 && afterRatio <= 0.6, `AFTER ratio band (got ${afterRatio.toFixed(3)})`)
  console.log(
    `PASS  1. headline ratio BEFORE≈${beforeRatio.toFixed(3)} AFTER≈${afterRatio.toFixed(3)}`,
  )
}

{
  assert(headlineSepYAt(0.52, { linear: true }) === HEADLINE_SEP_PX, 'linear sep end')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'linear: true', 'compact sep linear')
  assertIncludes(mobile, 'HEADLINE_SEP_COMPACT_SCALE', 'compact scale')
  assertNotIncludes(mobile, '188 / 155', 'amplified sep removed')
  assert(HEADLINE_SEP_COMPACT_SCALE === 90 / HEADLINE_SEP_PX, 'scale frozen 90/155')
  console.log('PASS  2. headline linear + reduced scale frozen')
}

{
  assert(phoneSettled(0.74), 'PHONE_SETTLED')
  assert(!phoneSettled(0.73), 'not settled early')
  console.log('PASS  3. PHONE_SETTLED')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'CompactPhoneProductTour', '3F.1 tour wired')
  assertNotIncludes(mobile, 'FlattenedPhoneAutoplay', '3F slideshow gone')
  assertIncludes(mobile, 'PHONE_ENTER_Y_COMPACT = 48', 'phone entrance frozen')
  assertIncludes(mobile, 'PHONE_SCALE_START_COMPACT = 0.94', 'phone scale frozen')
  console.log('PASS  4. phone entrance freeze + tour successor')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  5. registration')
}

console.log('\nPASS  landing mobile story 3F\n')
