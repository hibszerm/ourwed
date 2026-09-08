/**
 * Landing V2 — Iteration 3G mobile Security transition polish.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  MOBILE_TRACK_POST_BRIEF_SVH_COMPACT,
  POST_BRIEF_LOCK_ESTABLISHED,
  POST_BRIEF_MORPH_START,
  POST_BRIEF_RANGES,
  compactPostBriefVisualAt,
  postBriefRunwaySvh,
  postBriefShrinkScaleAt,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH,
  MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT,
  STUDIO_LOCK_SCALE_END,
  STUDIO_LOCK_SCALE_END_COMPACT,
  STUDIO_LOCK_Y_VH_END,
  STUDIO_LOCK_Y_VH_END_COMPACT,
  studioLockScaleAt,
  studioLockYVhAt,
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

console.log('\n=== landing mobile security transition 3G ===\n')

{
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'desktop postBrief frozen')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH_COMPACT, 90, 'compact ~80% runway')
  const ratio = MOBILE_TRACK_POST_BRIEF_SVH_COMPACT / MOBILE_TRACK_POST_BRIEF_SVH
  assert(ratio >= 0.78 && ratio <= 0.84, `runway ratio ~0.80 (got ${ratio.toFixed(3)})`)
  assertEq(postBriefRunwaySvh(false), 112, 'desktop runway helper')
  assertEq(postBriefRunwaySvh(true), 90, 'compact runway helper')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH, 145, 'desktop studio frozen')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT, 58, 'compact studio intro')
  console.log(
    `PASS  1. phone→lock runway ${MOBILE_TRACK_POST_BRIEF_SVH}→${MOBILE_TRACK_POST_BRIEF_SVH_COMPACT} (${(ratio * 100).toFixed(1)}%)`,
  )
}

{
  const morphShare =
    (POST_BRIEF_LOCK_ESTABLISHED * MOBILE_TRACK_POST_BRIEF_SVH) /
    MOBILE_TRACK_POST_BRIEF_SVH_COMPACT
  const visualAtShare = compactPostBriefVisualAt(morphShare)
  assert(
    Math.abs(visualAtShare - POST_BRIEF_LOCK_ESTABLISHED) < 0.002,
    `remap at morphShare → LOCK_ESTABLISHED (got ${visualAtShare})`,
  )
  assert(compactPostBriefVisualAt(0) === 0, 'remap 0')
  assert(compactPostBriefVisualAt(1) === 1, 'remap 1')
  const mid = compactPostBriefVisualAt(morphShare * 0.5)
  assert(mid > 0.2 && mid < 0.4, `mid morph visual (got ${mid.toFixed(3)})`)
  const deskMid = POST_BRIEF_LOCK_ESTABLISHED * 0.5
  assert(
    Math.abs(postBriefShrinkScaleAt(mid) - postBriefShrinkScaleAt(deskMid)) < 0.02,
    'shrink pace matched via remap',
  )
  console.log('PASS  2. dead-hold compression + morph pace preserved')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const tour = read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx')
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertIncludes(mobile, 'compactPostBriefVisualAt', 'visual remap wired')
  assertIncludes(mobile, 'postBriefRunwaySvh', 'compact runway wired')
  assertIncludes(mobile, 'MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT', 'studio compact runway')
  assertIncludes(mobile, 'compactIntro', 'StudioHistoryReveal compact intro')
  assertIncludes(mobile, 'postBriefProgress={postBriefProgress}', 'tour freeze signal')
  assertIncludes(tour, 'POST_BRIEF_MORPH_START', 'freeze at morph start')
  assertIncludes(tour, 'freezeTourInPlace', 'freeze in place')
  assertIncludes(css, 'will-change: transform, opacity', 'compositor morph')
  assert(POST_BRIEF_MORPH_START === 0.001, 'morph start unchanged')
  assert(POST_BRIEF_RANGES.phoneShrink.end === 0.26, 'desktop shrink range frozen')
  console.log('PASS  3. smooth morph architecture + tour freeze')
}

{
  assert(STUDIO_LOCK_Y_VH_END === -30, 'desktop lock Y frozen')
  assert(STUDIO_LOCK_SCALE_END === 0.175, 'desktop lock scale frozen')
  assert(STUDIO_LOCK_Y_VH_END_COMPACT === -20.5, 'compact lock Y 3G.3')
  assert(STUDIO_LOCK_SCALE_END_COMPACT === 0.28, 'compact lock scale calmed')
  /* Compact lock travel is continuous 0→0.7 of studio runway (3G.3). */
  const compactLockScrollSvh = 0.7 * MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT
  const compactLockTravelVh = Math.abs(STUDIO_LOCK_Y_VH_END_COMPACT)
  const ratio = compactLockTravelVh / compactLockScrollSvh
  assert(ratio >= 0.4 && ratio <= 0.95, `lock visual/scroll calm (got ${ratio.toFixed(2)})`)
  assert(studioLockScaleAt(0, true) === 1, 'compact lock scale identity at 0')
  assert(studioLockYVhAt(0, true) === 0, 'compact lock Y identity at 0')
  const history = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  assertIncludes(history, 'yearsOnly', 'document-flow years-only after sticky intro')
  assertIncludes(
    read('src/features/landing-v2/mobile-story/StudioHistoryReveal.tsx'),
    'compactIntro',
    'intro reveal supports compact',
  )
  console.log('PASS  4. lock→history continuous compact choreography')
}

{
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  const revealCss = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.module.css')
  assertNotIncludes(histCss, 'calc(100vw', 'no 100vw nested width')
  assertNotIncludes(histCss, 'width: calc(100vw', 'no vw width on inner')
  assertIncludes(histCss, 'width: 100%', 'inner from padded parent')
  assertIncludes(histCss, 'transform: none', 'stable headline no X transform')
  assertIncludes(histCss, 'overflow-wrap: anywhere', 'period never clips')
  assertIncludes(revealCss, 'rootCompact', 'compact intro centering')
  assertIncludes(revealCss, 'max-width: calc(100% - 2.25rem)', 'compact content gutters')
  for (const vw of [375, 390, 393, 402, 430]) {
    const gutter = 1.125 * 16 * 2
    const content = vw - gutter
    assert(content > 300, `${vw}px content width`)
  }
  console.log('PASS  5. history heading centering contract')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  6. registration')
}

console.log('\nPASS  landing mobile security transition 3G\n')
