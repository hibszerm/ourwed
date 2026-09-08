/**
 * Landing V2 — 3G compact morph tests RETIRED by Iteration 3H.
 *
 * Owner abandoned compact phone→lock theater in favor of native document flow.
 * These suites now only assert: desktop morph preserved + compact morph absent.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  POST_BRIEF_MORPH_START,
  POST_BRIEF_RANGES,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH,
  STUDIO_LOCK_SCALE_END,
  STUDIO_LOCK_Y_VH_END,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'

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

console.log('\n=== landing mobile security transition 3G (RETIRED → 3H guards) ===\n')

{
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'desktop postBrief frozen')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH, 145, 'desktop studio frozen')
  assert(POST_BRIEF_MORPH_START === 0.001, 'desktop morph start')
  assert(POST_BRIEF_RANGES.phoneShrink.end === 0.26, 'desktop shrink')
  assert(STUDIO_LOCK_Y_VH_END === -30, 'desktop lock Y')
  assert(STUDIO_LOCK_SCALE_END === 0.175, 'desktop lock scale')
  console.log('PASS  1. desktop morph constants frozen')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'data-compact-native-exit', '3H native exit')
  assertIncludes(mobile, 'isCompactViewport ? 0 : postBriefRunwaySvh(false)', 'compact postBrief runway 0')
  assertNotIncludes(mobile, 'compactIntro', 'compact sticky History intro removed')
  assertIncludes(mobile, 'postBriefShrinkScaleAt(Number(pb))', 'desktop shrink retained')
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  2. compact morph retired; desktop path kept')
}

console.log('\nPASS  landing mobile security transition 3G (retired)\n')
