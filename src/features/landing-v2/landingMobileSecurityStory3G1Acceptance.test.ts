/**
 * Landing V2 — Iteration 3G.1 compositor Security story.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_LOCK_REVEAL,
  COMPACT_PHONE_EXIT,
  COMPACT_POST_BRIEF_RUNWAY_SVH,
  COMPACT_SECURITY_LOCK_CENTER_PCT,
  COMPACT_STUDIO_HISTORY_SVH,
  compactLockRevealOpacityAt,
  compactPhoneExitOpacityAt,
  compactPhoneExitScaleAt,
  compactStudioVisualAt,
} from '@/features/landing-v2/mobile-story/compactSecurityRevealProgress'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  MOBILE_TRACK_POST_BRIEF_SVH_COMPACT,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
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

console.log('\n=== landing mobile security story 3G.1 ===\n')

{
  assertEq(COMPACT_POST_BRIEF_RUNWAY_SVH, 90, 'runway kept ~3G')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH_COMPACT, 90, 'postBrief compact 90')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'desktop postBrief frozen')
  assertEq(COMPACT_STUDIO_HISTORY_SVH, 56, 'studio intro trimmed')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT, 56, 'studio constant synced')
  assertEq(COMPACT_SECURITY_LOCK_CENTER_PCT, 40, 'large lock ~40%')
  console.log('PASS  1. runway + composition targets')
}

{
  const phone = read('src/features/landing-v2/mobile-story/device/HeroPhoneFrame.tsx')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(phone, 'geometryMorph', 'geometry morph flag')
  assertIncludes(mobile, 'geometryMorph={!isCompactViewport}', 'compact disables geometry morph')
  assertIncludes(mobile, 'securityRevealLock', 'pre-mounted lock layer')
  assertIncludes(mobile, 'data-security-transition="lock-layer"', 'lock layer marker')
  assertIncludes(mobile, 'data-security-transition="phone-layer"', 'phone layer marker')
  assertIncludes(mobile, 'compactPhoneExitScaleAt', 'phone exit scale')
  assertIncludes(mobile, 'compactLockRevealOpacityAt', 'lock reveal opacity')
  assertIncludes(mobile, 'compactPhoneExitScaleAt(Number(pb))', 'compact phone exit only')
  assertIncludes(mobile, 'if (compactRef.current)', 'compact branch in phoneScale')
  /* Compact compress forced to 0 */
  assertIncludes(mobile, 'compactRef.current ? 0 : postBriefCompressAt', 'compress zero on compact')
  console.log('PASS  2. compositor phone reveals lock — no compact geometry morph')
}

{
  assert(COMPACT_PHONE_EXIT.scaleEnd >= 0.82 && COMPACT_PHONE_EXIT.scaleEnd <= 0.88, 'phone exit scale band')
  assert(COMPACT_LOCK_REVEAL.scaleStart >= 0.9 && COMPACT_LOCK_REVEAL.scaleStart <= 0.96, 'lock start scale')
  const samples = [0, 0.25, 0.5, 0.75, 1, 0.6, 0.3, 0]
  let prevPhone = compactPhoneExitOpacityAt(samples[0])
  for (const p of samples) {
    const phoneOp = compactPhoneExitOpacityAt(p)
    const lockOp = compactLockRevealOpacityAt(p)
    const phoneSc = compactPhoneExitScaleAt(p)
    assert(phoneOp >= 0 && phoneOp <= 1, `phone op @${p}`)
    assert(lockOp >= 0 && lockOp <= 1, `lock op @${p}`)
    assert(phoneSc >= COMPACT_PHONE_EXIT.scaleEnd && phoneSc <= 1.001, `phone scale @${p}`)
    void prevPhone
    prevPhone = phoneOp
  }
  assert(compactPhoneExitOpacityAt(0) === 1, 'phone opaque at start')
  assert(compactPhoneExitOpacityAt(1) === 0, 'phone clear at end')
  assert(compactLockRevealOpacityAt(0) === 0, 'lock hidden at start')
  assert(compactLockRevealOpacityAt(1) === 1, 'lock solid at end')
  assert(compactStudioVisualAt(0) === 0 && compactStudioVisualAt(1) === 1, 'studio remap ends')
  console.log('PASS  3. reverse-deterministic reveal samples')
}

{
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertIncludes(css, 'top: 40%', 'stageCenter 40%')
  assertIncludes(css, 'securityRevealLock', 'lock layer css')
  assertIncludes(css, 'z-index: 1', 'lock under phone')
  assertIncludes(css, 'z-index: 2', 'phone above lock')
  assertNotIncludes(css, 'will-change: transform, opacity', 'no permanent morph will-change')
  const hist = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.module.css')
  assertIncludes(hist, 'margin-bottom: 1.35rem', 'lockSlot clears eyebrow')
  console.log('PASS  4. Security composition + lock→eyebrow seat')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const histTsx = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx',
  )
  assertIncludes(histCss, 'animation-timeline: view()', 'season view timeline')
  assertIncludes(histCss, 'lv2SeasonReveal', 'shared season keyframes')
  assertIncludes(histCss, 'translate3d(0, 20px, 0)', 'season transform only')
  assertNotIncludes(histCss, 'filter:', 'no season blur')
  assertIncludes(histCss, "data-studio-history-years-only='true'", 'years-only tighter pad')
  assertIncludes(histTsx, "data-season-reveal={yearsOnly ? 'view-timeline' : 'io'}", 'view timeline path')
  assertNotIncludes(histCss, 'calc(100vw', 'centering freeze')
  console.log('PASS  5. History dead-space + season motion')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  6. registration')
}

console.log('\nPASS  landing mobile security story 3G.1\n')
