/**
 * Landing V2 — mobile performance Iteration 3C
 * Pixel-coupled narrative + Founder-style document black cover.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_NARRATIVE_COVER_HOLD_SVH,
  COMPACT_NARRATIVE_INCOMING_RATIO,
  COMPACT_NARRATIVE_OUTGOING_FADE_DONE,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  blackCoverDisplacementRatio,
  collisionInvariantHolds,
  compactNarrativeCoverHandoffT,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  incomingMotionRatio,
  statementVisualAtScroll,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'

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

const narrative = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.tsx',
)
const narrativeCss = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.module.css',
)
const progress = read(
  'src/features/landing-v2/sections/compactProblemNarrativeProgress.ts',
)
const productCss = read(
  'src/features/landing-v2/product-story/CompactProductReveal.module.css',
)
const founderCss = read(
  'src/features/landing-v2/mobile-story/FounderStoryReveal.module.css',
)
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const register = read('src/features/auth/components/RegisterForm.tsx')
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')

console.log('\n=== landing mobile performance iteration 3C (pixel-coupled) ===\n')

{
  assertIncludes(narrative, 'data-problem-pixel-coupled="true"', 'pixel-coupled marker')
  assertIncludes(narrative, 'data-narrative-cover="document"', 'document cover marker')
  assertIncludes(narrative, 'data-narrative-engine', 'engine marker (css-scroll|js-scrub)')
  assertNotIncludes(narrative, 'useMotionValue', 'no Framer travel MotionValue')
  assertNotIncludes(narrative, 'useTransform', 'no Framer travel transform')
  assertIncludes(progress, 'COMPACT_NARRATIVE_INCOMING_RATIO = 1', 'incoming ratio 1.0')
  assertIncludes(progress, 'ratio ≈ 3.80 (FAILED)', 'documents 3B failure ratio')
  console.log('PASS  1. architecture: pixel-coupled, no Framer travel')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const ratio = incomingMotionRatio(g, 100)
  assert(ratio >= 0.95 && ratio <= 1.05, `incoming ratio ${ratio} not in 0.95–1.05`)
  assert(ratio <= 1.1, `incoming ratio ${ratio} exceeds hard max 1.10`)
  assert(COMPACT_NARRATIVE_INCOMING_RATIO === 1, 'constant ratio 1')

  /* Every transition: travel scroll == travel px */
  const slots = compactNarrativeSlotOffsets(g)
  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const scrollTravel = slots.arriveEnd[i]! - slots.arriveStart[i]!
    assert(
      scrollTravel === g.travelPx,
      `stmt ${i}: scrollTravel ${scrollTravel} !== travelPx ${g.travelPx}`,
    )
    const a = statementVisualAtScroll(slots.arriveStart[i]!, i, g)
    const b = statementVisualAtScroll(slots.arriveEnd[i]!, i, g)
    assert(a.y === g.travelPx, `stmt ${i} start y`)
    assert(b.y === 0, `stmt ${i} end y`)
    const elementTravel = a.y - b.y
    const r = elementTravel / scrollTravel
    assert(r >= 0.95 && r <= 1.05, `stmt ${i} ratio ${r}`)
  }
  console.log('PASS  2. incoming pixel coupling 1.0 for all transitions')
}

{
  const g = compactNarrativeGeometry(874, 68)
  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const c = collisionInvariantHolds(g, i)
    assert(
      c.ok,
      `collision fail handoff→${i}: opacity=${c.outgoingOpacity} at y=${c.atIncomingY}`,
    )
  }
  assert(COMPACT_NARRATIVE_OUTGOING_FADE_DONE <= 0.7, 'fade done by ~70% travel')
  console.log('PASS  3. collision invariant outgoing opacity ≤ 0.15')
}

{
  assert(blackCoverDisplacementRatio() === 1, 'black cover ratio 1.0')
  assertIncludes(narrativeCss, 'coverHold', 'cover hold spacer class')
  assertIncludes(progress, 'compactNarrativeCoverHandoffT', 'unpin handoff helper')
  assertIncludes(narrative, 'data-narrative-cover="document"', 'document cover black exit')
  assertIncludes(narrativeCss, 'transform: none', 'no transform on sticky ancestors')
  assertIncludes(founderCss, 'margin-top: calc(-100svh)', 'Founder reference intact')
  assertIncludes(productCss, 'margin-top: calc(var(--lv2-nav-h) - 100svh)', 'Product sticky-height overlap')
  assert(COMPACT_NARRATIVE_COVER_HOLD_SVH === 0, 'cover hold removed (3C.2)')
  assertIncludes(narrativeCss, 'height: 0', 'coverHold spacer height 0')

  /* 100px unpin ⇒ 100px handoff progress in stickyH units is linear */
  const g = compactNarrativeGeometry(874, 68)
  const t0 = compactNarrativeCoverHandoffT(g.navH, g.navH, g.stickyH)
  const t100 = compactNarrativeCoverHandoffT(g.navH - 100, g.navH, g.stickyH)
  assert(t0 === 0, 'pinned handoff 0')
  assert(Math.abs(t100 - 100 / g.stickyH) < 1e-9, '100px scroll → proportional handoff')
  /* Document cover: sticky itself moves with scroll when unpinned — ratio 1 */
  console.log('PASS  4. native document black cover (Founder principle)')
}

{
  /* Reverse determinism: same scroll → same visual */
  const g = compactNarrativeGeometry(874, 68)
  const slots = compactNarrativeSlotOffsets(g)
  const mid = slots.arriveStart[2]! + g.travelPx * 0.4
  const a = statementVisualAtScroll(mid, 2, g)
  const b = statementVisualAtScroll(mid, 2, g)
  assert(a.y === b.y && a.opacity === b.opacity, 'deterministic at scroll position')
  assertNotIncludes(progress, 'setTimeout', 'no timers')
  assertNotIncludes(narrative, 'setTimeout', 'no timers in UI')
  assertNotIncludes(narrative, 'velocity', 'no velocity dependence')
  console.log('PASS  5. reverse-scroll determinism')
}

{
  assertNotIncludes(narrativeCss, 'animation-timeline: view()', 'ranges use scroll() not view SoT')
  assertIncludes(
    progress,
    'prefers CSS `animation-timeline: scroll()`',
    'documents 3D CSS scroll timeline preference',
  )
  assertIncludes(problem, 'LandingV2ProblemStoryDesktop', 'desktop preserved')
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  6. scroll-timeline decision + regressions')
}

console.log('\nPASS  landing mobile performance iteration 3C\n')
