/**
 * Landing V2 — Iteration 3G.1 compositor architecture (REJECTED).
 * 3G.2 recovery asserts the reveal-under-phone path is gone.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT,
  COMPACT_POST_BRIEF_RUNWAY_SVH,
  COMPACT_SECURITY_LOCK_CENTER_PCT,
} from '@/features/landing-v2/mobile-story/compactSecurityRevealProgress'
import { MOBILE_TRACK_POST_BRIEF_SVH_COMPACT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import { MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT } from '@/features/landing-v2/mobile-story/studioHistoryProgress'

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

console.log('\n=== landing mobile security story 3G.1 (rejected) — recovery guards ===\n')

{
  assertEq(COMPACT_POST_BRIEF_RUNWAY_SVH, 90, 'runway kept')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH_COMPACT, 90, 'postBrief compact 90')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT, 58, 'compact studio intro')
  assertEq(COMPACT_SECURITY_LOCK_CENTER_PCT, 38.5, 'large lock ~38.5%')
  assert(COMPACT_SECURITY_LOCK_CENTER_PCT >= 37 && COMPACT_SECURITY_LOCK_CENTER_PCT <= 40, 'lock 37–40%')
  assertEq(COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT, 50, 'phone settled 50%')
  console.log('PASS  1. recovered composition tokens')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const phone = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.tsx')
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertNotIncludes(mobile, 'securityRevealLock', 'no pre-mounted lock layer')
  assertNotIncludes(mobile, 'compactPhoneExitScaleAt', 'no phone-exit scale path')
  assertNotIncludes(mobile, 'compactLockRevealOpacityAt', 'no lock reveal opacity')
  assertNotIncludes(mobile, 'geometryMorph={!isCompactViewport}', 'compact geometry morph restored')
  assertNotIncludes(mobile, 'data-security-transition="lock-layer"', 'no lock-layer marker')
  assertNotIncludes(css, 'securityRevealLock', 'no reveal-lock CSS')
  assertNotIncludes(phone, 'geometryMorph', 'HeroPhoneFrame always morphs (f019)')
  assertIncludes(mobile, 'data-security-transition="continuous-morph"', 'continuous morph restored')
  assertIncludes(mobile, 'postBriefShrinkScaleAt', 'shrink morph restored')
  assertIncludes(mobile, 'postBriefCompressAt', 'compress morph restored')
  console.log('PASS  2. 3G.1 reveal-under-phone architecture removed')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  3. registration')
}

console.log('\nPASS  landing mobile security story 3G.1 rejection guards\n')
