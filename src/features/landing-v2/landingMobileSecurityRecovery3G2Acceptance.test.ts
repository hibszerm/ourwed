/**
 * Landing V2 — Iteration 3G.2 Security story surgical recovery.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_MORPH_CONTINUITY_SAMPLES,
  COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT,
  COMPACT_POST_BRIEF_RUNWAY_SVH,
  COMPACT_SECURITY_LOCK_CENTER_PCT,
  COMPACT_SECURITY_LOCK_LIFT,
  COMPACT_SECURITY_LOCK_LIFT_VH,
  compactSecurityLockLiftVhAt,
} from '@/features/landing-v2/mobile-story/compactSecurityRevealProgress'
import {
  MOBILE_TRACK_POST_BRIEF_SVH,
  MOBILE_TRACK_POST_BRIEF_SVH_COMPACT,
  POST_BRIEF_LOCK_ESTABLISHED,
  POST_BRIEF_MORPH_START,
  POST_BRIEF_RANGES,
  compactPostBriefVisualAt,
  postBriefCompressAt,
  postBriefShrinkScaleAt,
} from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT,
  STUDIO_LOCK_SCALE_END_COMPACT,
  STUDIO_LOCK_Y_VH_END_COMPACT,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'
import {
  COMPACT_PHONE_TOUR_DURATION_S,
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

console.log('\n=== landing mobile security recovery 3G.2 ===\n')

{
  assertEq(COMPACT_POST_BRIEF_RUNWAY_SVH, 90, 'phone→lock runway')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH_COMPACT, 90, 'postBrief compact')
  assertEq(MOBILE_TRACK_POST_BRIEF_SVH, 112, 'desktop postBrief frozen')
  assertEq(MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT, 72, 'studio intro f019/3G')
  assertEq(COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT, 50, 'phone settled stageCenter')
  assert(COMPACT_SECURITY_LOCK_CENTER_PCT >= 40 && COMPACT_SECURITY_LOCK_CENTER_PCT <= 42, 'lock center')
  assertEq(COMPACT_SECURITY_LOCK_LIFT_VH, 9, 'lift 50→41')
  assertEq(STUDIO_LOCK_Y_VH_END_COMPACT, -18, 'history lock Y f019')
  assertEq(STUDIO_LOCK_SCALE_END_COMPACT, 0.28, 'history lock scale f019')
  console.log('PASS  1. recovered runway + separated Y tokens')
}

{
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  assertIncludes(css, 'top: 50%', 'stageCenter 50% for phone')
  assertNotIncludes(css, 'top: 40%', 'no shared 40% stageCenter')
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  assertIncludes(mobile, 'compactSecurityLockLiftVhAt', 'late lock lift separate from phone')
  assertIncludes(mobile, 'postBriefVisual', 'lift uses visual progress')
  assert(compactSecurityLockLiftVhAt(0) === 0, 'lift identity at morph start')
  assert(compactSecurityLockLiftVhAt(POST_BRIEF_MORPH_START) === 0, 'lift identity at morph start+ε')
  assert(compactSecurityLockLiftVhAt(0.5) === 0, 'lift still 0 mid-morph')
  assert(
    Math.abs(compactSecurityLockLiftVhAt(COMPACT_SECURITY_LOCK_LIFT.end) + COMPACT_SECURITY_LOCK_LIFT_VH) <
      1e-9,
    'lift complete at security hold end',
  )
  /* Reverse determinism */
  const fwd = [0, 0.75, 0.8, 0.86, 0.8, 0.75, 0].map(compactSecurityLockLiftVhAt)
  assertEq(fwd[0], fwd[6], 'lift reverse to 0')
  assertEq(fwd[1], fwd[5], 'lift reverse mid')
  console.log('PASS  2. phone settled ≠ security lock Y; lift reverse-ok')
}

{
  const scales = COMPACT_MORPH_CONTINUITY_SAMPLES.map((p) =>
    postBriefShrinkScaleAt(compactPostBriefVisualAt(Math.max(0, p))),
  )
  for (let i = 1; i < scales.length; i++) {
    const d = scales[i - 1] - scales[i]
    assert(d >= -1e-9, `monotonic shrink at sample ${i}: ${scales[i - 1]} → ${scales[i]}`)
    assert(d < 0.02, `no scale jump at sample ${i}: Δ=${d}`)
  }
  assert(Math.abs(scales[0] - 1) < 0.002, 'pre-morph scale ≈ 1')
  assert(Math.abs(scales[1] - 1) < 0.002, 'morph-start scale ≈ 1')
  assert(postBriefCompressAt(compactPostBriefVisualAt(POST_BRIEF_MORPH_START)) === 0, 'compress 0 at start')
  assert(postBriefCompressAt(compactPostBriefVisualAt(0.2)) === 0, 'compress 0 mid stage-1')
  console.log('PASS  3. morph-start continuity (no scale jump)')
}

{
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const tour = read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx')
  assertNotIncludes(mobile, 'securityRevealLock', 'no independent lock under phone')
  assertNotIncludes(mobile, 'compactPhoneExit', 'no phone-exit reveal path')
  assertIncludes(mobile, 'data-security-transition="continuous-morph"', 'continuous morph')
  assertIncludes(tour, 'phoneBrief', 'static Brief asset')
  assertIncludes(tour, 'data-phone-screen-flattened', 'flatten handoff marker')
  assertIncludes(tour, 'activateFlatten', 'flatten activation')
  assertIncludes(tour, 'alreadyFrozen', 'one-time flatten (no per-frame setState)')
  assertIncludes(tour, 'LANDING_DEVICE_ASSETS.phoneBrief', 'real capture asset')
  assert(existsSync(join(ROOT, 'public/landing-v2/devices/phone-brief.webp')), 'phone-brief.webp exists')
  /* Lock silhouette emerges late via compress/shackle — not at morph start */
  assert(POST_BRIEF_RANGES.shackle.start >= 0.28, 'shackle late')
  assert(POST_BRIEF_RANGES.bodyCompress.start >= 0.22, 'body compress after stage-1')
  console.log('PASS  4. continuous morph + flatten handoff; no early lock layer')
}

{
  const revealCss = read('src/features/landing-v2/mobile-story/StudioHistoryReveal.module.css')
  assertIncludes(revealCss, 'rootCompact .lockSlot', 'dedicated history lock slot')
  assertIncludes(revealCss, 'clamp(1.25rem, 5.5vw, 1.75rem)', 'lock→eyebrow gap 20–28px')
  for (const vw of [375, 390, 393, 402, 430]) {
    const gap = Math.min(1.75 * 16, Math.max(1.25 * 16, 0.055 * vw))
    assert(gap >= 20 && gap <= 28, `${vw}px lock-slot gap ≈${gap.toFixed(1)}`)
  }
  console.log('PASS  5. History lock slot above TWOJE STUDIO')
}

{
  const hist = read('src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.tsx')
  const histCss = read(
    'src/features/landing-v2/security-history/LandingV2SecurityHistoryStory.module.css',
  )
  assertIncludes(hist, 'yearsOnly', 'years document-flow sibling')
  assertIncludes(hist, 'data-studio-year-chapter', 'year chapters present')
  assertNotIncludes(hist, 'data-studio-year-label=""\n                initial=', 'years not IO-gated')
  assertIncludes(hist, '<p className={styles.year} data-studio-year-label="">', 'year labels always mounted visible')
  assertIncludes(histCss, 'opacity: 1', 'years base visible')
  assertIncludes(histCss, '@supports (animation-timeline: view())', 'progressive enhancement')
  assertIncludes(histCss, 'data-studio-history-years-only', 'years-only earlier padding')
  assertNotIncludes(histCss, 'from {\n    opacity: 0;', 'no opacity:0 keyframe dependency')
  assertNotIncludes(histCss, 'calc(100vw', 'no 100vw centering bug')
  console.log('PASS  6. years always visible + progressive season motion')
}

{
  /* Sticky count: MobileStory sticky + StudioHistoryReveal compact intro in same sticky — no new sticky */
  const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
  const css = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.module.css')
  const stickyDecls = (css.match(/position:\s*sticky/g) ?? []).length
  assert(stickyDecls <= 2, `sticky decls ≤2 (got ${stickyDecls})`)
  assertIncludes(mobile, 'compactIntro', 'intro inside existing sticky')
  assertNotIncludes(mobile, 'position: sticky', 'no inline sticky')
  console.log(`PASS  7. sticky count bounded (css sticky decls=${stickyDecls})`)
}

{
  /* Tour timing regression — 3F.3 compensated ms frozen */
  assertEq(COMPACT_TOUR_DASH_SCROLL_MS, 3222, 'dash ms')
  assertEq(COMPACT_TOUR_DAY_SCROLL_MS, 2027, 'day ms')
  assertEq(COMPACT_TOUR_ROUTE_TRAVEL_MS, 1878, 'route ms')
  assert(COMPACT_PHONE_TOUR_DURATION_S > 8 && COMPACT_PHONE_TOUR_DURATION_S < 15, 'tour duration band')
  console.log('PASS  8. phone tour timing unchanged')
}

{
  /* Scoped rollback: 3F.3 phone logical viewport + black occlusion untouched */
  assert(existsSync(join(ROOT, 'src/features/landing-v2/devices/MarketingPhoneLogicalViewport.tsx')), 'logical viewport')
  assert(
    existsSync(join(ROOT, 'src/features/landing-v2/landingMobileBlackProductOcclusionAcceptance.test.ts')),
    'black occlusion suite',
  )
  const black = read('src/features/landing-v2/landingMobileBlackProductOcclusionAcceptance.test.ts')
  assertIncludes(black, 'sticky::before', 'occlusion contract present')
  const phoneLv = read('src/features/landing-v2/devices/phoneLogicalViewportCanon.ts')
  assertIncludes(phoneLv, '390', '390 logical width frozen')
  console.log('PASS  9. 3F.3 phone size + black occlusion retained')
}

{
  const morphShare =
    (POST_BRIEF_LOCK_ESTABLISHED * MOBILE_TRACK_POST_BRIEF_SVH) /
    MOBILE_TRACK_POST_BRIEF_SVH_COMPACT
  assert(morphShare > POST_BRIEF_LOCK_ESTABLISHED, 'compact front-loads morph share')
  assert(Math.abs(compactPostBriefVisualAt(morphShare) - POST_BRIEF_LOCK_ESTABLISHED) < 0.002, 'remap')
  console.log('PASS  10. 90svh remap preserves morph pace')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  11. registration lock')
}

console.log('\nPASS  landing mobile security recovery 3G.2\n')
