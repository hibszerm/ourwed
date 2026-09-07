/**
 * Landing V2 — mobile performance Iteration 3C.2
 * Remove final dead scroll after Statement 7; Product exit pixel-coupled 1:1.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_NARRATIVE_COVER_HOLD_SVH,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  blackCoverDisplacementRatio,
  collisionInvariantHolds,
  compactNarrativeCoverHandoffT,
  compactNarrativeCoverHoldPx,
  compactNarrativeDeadScrollAfterFinalHoldPx,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  incomingMotionRatio,
  statementVisualAtScroll,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'
import {
  COMPACT_PRODUCT_EXIT_BEFORE_RATIO,
  COMPACT_PRODUCT_EXIT_BEFORE_SCROLL_PX,
  COMPACT_PRODUCT_EXIT_BEFORE_TRAVEL_PX,
  COMPACT_PRODUCT_EXIT_RATIO,
  compactProductExitMotionRatio,
  compactProductExitPhase,
  compactProductExitTravelPx,
  compactProductNativeExitY,
} from '@/features/landing-v2/product-story/compactProductExit'

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
const compact = read(
  'src/features/landing-v2/product-story/CompactProductReveal.tsx',
)
const exitHelper = read(
  'src/features/landing-v2/product-story/compactProductExit.ts',
)
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const register = read('src/features/auth/components/RegisterForm.tsx')
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const autoplay = read(
  'src/features/landing-v2/devices/FlattenedProductAutoplay.tsx',
)
const desktopProduct = read(
  'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
)

console.log('\n=== landing mobile performance iteration 3C.2 ===\n')

{
  const dead = compactNarrativeDeadScrollAfterFinalHoldPx(874, 68)
  assert(COMPACT_NARRATIVE_COVER_HOLD_SVH === 0, 'coverHold svh = 0')
  assert(dead.coverHoldPx === 0, `coverHoldPx ${dead.coverHoldPx} must be 0`)
  assert(dead.deadScrollPx === 0, `deadScrollPx ${dead.deadScrollPx} must be 0`)
  assert(
    dead.finalHoldPx === dead.normalHoldPx,
    `final hold ${dead.finalHoldPx} !== normal ${dead.normalHoldPx}`,
  )
  assert(
    dead.finalHoldRatio >= 0.95 && dead.finalHoldRatio <= 1.05,
    `final hold ratio ${dead.finalHoldRatio}`,
  )
  assertIncludes(narrativeCss, '.coverHold', 'coverHold class retained at height 0')
  assertIncludes(narrativeCss, 'height: 0', 'coverHold height 0')
  assertIncludes(progress, 'COMPACT_NARRATIVE_COVER_HOLD_SVH = 0', 'constant 0')
  console.log(
    `PASS  1. final-hold-consistency: normal=${dead.normalHoldPx} final=${dead.finalHoldPx} cover=${dead.coverHoldPx}`,
  )
}

{
  const g = compactNarrativeGeometry(874, 68)
  const slots = compactNarrativeSlotOffsets(g)
  const last = COMPACT_NARRATIVE_STATEMENT_COUNT - 1
  assert(
    slots.holdEnd[last] === slots.scrubBudget,
    'Statement 7 hold end === scrubBudget (no post-hold scrub dead zone)',
  )
  /* Next scroll after holdEnd: sticky unpin geometry begins (handoff > 0). */
  const tPinned = compactNarrativeCoverHandoffT(g.navH, g.navH, g.stickyH)
  const tAfter1 = compactNarrativeCoverHandoffT(g.navH - 1, g.navH, g.stickyH)
  assert(tPinned === 0, 'still pinned → handoff 0')
  assert(tAfter1 > 0, '1px past pin → handoff starts immediately')
  assert(compactNarrativeCoverHoldPx(874) === 0, 'coverHold px geometry 0')
  console.log('PASS  2. no-dead-scroll-before-product')
}

{
  assert(blackCoverDisplacementRatio() === 1, 'black cover ratio constant 1')
  const g = compactNarrativeGeometry(874, 68)
  const t0 = compactNarrativeCoverHandoffT(g.navH, g.navH, g.stickyH)
  const t100 = compactNarrativeCoverHandoffT(g.navH - 100, g.navH, g.stickyH)
  const ratio = ((t100 - t0) * g.stickyH) / 100
  assert(ratio >= 0.98 && ratio <= 1.02, `black release coupling ${ratio}`)
  console.log('PASS  3. black-release-pixel-coupling')
}

{
  assert(COMPACT_PRODUCT_EXIT_BEFORE_RATIO > 3.5, 'documents BEFORE ratio ~4')
  assert(
    COMPACT_PRODUCT_EXIT_BEFORE_TRAVEL_PX / COMPACT_PRODUCT_EXIT_BEFORE_SCROLL_PX >
      3.5,
    'BEFORE travel/scroll',
  )
  assertIncludes(exitHelper, 'ratio ≈ 4.0', 'documents before failure')
  assertIncludes(exitHelper, 'No scroll-driven translateY', 'native architecture')
  assertIncludes(compact, 'data-product-exit="native-sticky"', 'native exit marker')
  assertNotIncludes(compact, 'vh * -1.1', 'no accelerated exit Y')
  assertNotIncludes(compact, 'easeInOutCubic', 'no ease on compact exit')
  assertNotIncludes(compact, "from '@/features/landing-v2/lifecycle-story/lifecycleExitClock'", 'no lifecycle exit clock import')
  assert(COMPACT_PRODUCT_EXIT_RATIO === 1, 'exit ratio constant 1')

  const travel = compactProductExitTravelPx(806)
  for (const d of [50, 100, 200] as const) {
    const y = compactProductNativeExitY(68 - d, 68, travel)
    assert(y === -d, `exit +${d}px scroll → y=${y}`)
    const r = (-y) / d
    assert(r >= 0.95 && r <= 1.05, `ratio at +${d}: ${r}`)
    assert(r <= 1.1, `hard max at +${d}`)
  }
  const sample = compactProductExitMotionRatio(100, travel)
  assert(sample >= 0.95 && sample <= 1.05, `motion ratio ${sample}`)
  console.log('PASS  4. product-exit-pixel-coupling')
}

{
  const travel = compactProductExitTravelPx(806)
  const mid = compactProductNativeExitY(68 - 120, 68, travel)
  const again = compactProductNativeExitY(68 - 120, 68, travel)
  assert(mid === again && mid === -120, 'deterministic stop / reverse position')
  assert(compactProductExitPhase(68, 68, travel) === 'idle', 'pinned idle')
  assert(compactProductExitPhase(68 - 10, 68, travel) === 'active', 'active mid')
  assert(
    compactProductExitPhase(68 - travel, 68, travel) === 'done',
    'done at full travel',
  )
  assertNotIncludes(compact, 'setTimeout', 'no timers')
  assertNotIncludes(compact, 'spring', 'no spring')
  assertNotIncludes(compact, 'velocity', 'no velocity')
  console.log('PASS  5. product-exit-reverse + stop')
}

{
  assertIncludes(compact, 'data-ps-exit-scale="false"', 'no scale-out marker')
  assertIncludes(compact, 'data-ps-camera-travel="false"', 'no camera travel')
  assertNotIncludes(compact, 'lifecycleExitScale', 'no exit scale MotionValue')
  assertNotIncludes(compact, 'lifecycleExitY', 'no exit Y MotionValue')
  /* Desktop may still scale — must remain untouched */
  assertIncludes(desktopProduct, 'lifecycleExitScale', 'desktop exit scale retained')
  assertIncludes(desktopProduct, 'e * vh * -1.1', 'desktop exit Y retained')
  console.log('PASS  6. product-exit-no-scale-camera')
}

{
  const g = compactNarrativeGeometry(874, 68)
  assert(incomingMotionRatio(g, 100) === 1, 'narrative travel still 1:1')
  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    assert(collisionInvariantHolds(g, i).ok, `collision stmt ${i}`)
  }
  const slots = compactNarrativeSlotOffsets(g)
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const v = statementVisualAtScroll(slots.arriveEnd[i]!, i, g)
    assert(v.opacity >= 0.99 && v.y === 0, `stmt ${i} reachable settled`)
  }
  console.log('PASS  7. narrative regression (order / 1:1 / collision)')
}

{
  assertIncludes(autoplay, 'HOLD_MS = 1750', 'autoplay hold unchanged')
  assertIncludes(autoplay, 'CROSSFADE_MS = 420', 'autoplay crossfade unchanged')
  assertIncludes(autoplay, "'overview'", 'overview')
  assertIncludes(autoplay, "'logistics'", 'logistics')
  assertIncludes(autoplay, "'finance'", 'finance')
  assertIncludes(autoplay, "'questionnaire'", 'questionnaire')
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero intact')
  assertIncludes(problem, 'LandingV2ProblemStoryDesktop', 'desktop problem intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  8. autoplay / hero / desktop / registration')
}

console.log('\nPASS  landing mobile performance iteration 3C.2\n')
