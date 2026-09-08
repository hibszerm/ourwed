/**
 * Landing V2 — mobile performance Iteration 3C.3
 * Fast-flick handoff hardening + transparent Product silhouette.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  blackCoverDisplacementRatio,
  collisionInvariantHolds,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  incomingMotionRatio,
  primaryStatementAtScroll,
  statementVisualAtScroll,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'
import {
  COMPACT_PRODUCT_EXIT_RATIO,
  compactProductExitMotionRatio,
  compactProductNativeExitY,
  compactProductExitTravelPx,
} from '@/features/landing-v2/product-story/compactProductExit'
import {
  COMPACT_HANDOFF_DUAL_PIN_OVERLAP_PX,
  compactHandoffBoundaryScrollPx,
  compactHandoffOwnerJump,
  compactHandoffReverseDeterministic,
  compactHandoffTAtScroll,
  compactMajorStickyOwnerAt,
} from '@/features/landing-v2/product-story/compactHandoffStability'

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

const compact = read(
  'src/features/landing-v2/product-story/CompactProductReveal.tsx',
)
const compactCss = read(
  'src/features/landing-v2/product-story/CompactProductReveal.module.css',
)
const stability = read(
  'src/features/landing-v2/product-story/compactHandoffStability.ts',
)
const narrative = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.tsx',
)
const narrativeCss = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.module.css',
)
const autoplay = read(
  'src/features/landing-v2/devices/FlattenedProductAutoplay.tsx',
)
const flatCss = read(
  'src/features/landing-v2/devices/FlattenedProductTabletContent.module.css',
)
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const desktopProduct = read(
  'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
)
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== landing mobile performance iteration 3C.3 ===\n')

{
  assert(COMPACT_HANDOFF_DUAL_PIN_OVERLAP_PX === 0, 'dual-pin overlap ~0')
  assertIncludes(
    stability,
    'Product pin aligns with narrative unpin',
    'documents single-owner sequence',
  )
  assertIncludes(
    stability,
    'never paint ownership',
    'handoff Mv not for paint',
  )
  const g = compactNarrativeGeometry(874, 68)
  const boundary = compactHandoffBoundaryScrollPx(g)
  assert(
    compactMajorStickyOwnerAt(boundary - 100, g) === 'narrative',
    'before boundary: narrative',
  )
  assert(
    compactMajorStickyOwnerAt(boundary + 20, g) === 'product',
    'after boundary: product',
  )
  assertIncludes(compact, 'data-product-handoff="geometry"', 'geometry handoff')
  assertIncludes(compact, 'data-ps-paint="geometry"', 'paint geometry marker')
  assertNotIncludes(compact, 'setTheaterOwned', 'no React ownership latch')
  assertNotIncludes(compact, 'data-ps-theater-owned', 'no ownership attr paint')
  assertNotIncludes(
    compactCss,
    "sticky[data-ps-theater-owned='true']",
    'no CSS ownership visibility latch',
  )
  console.log('PASS  1. single sticky owner / no frame-dependent paint latch')
}

{
  assertIncludes(compactCss, 'pointer-events: none', 'presentation pointer-events none')
  assertIncludes(compact, 'data-product-pointer="none"', 'pointer contract marker')
  assertNotIncludes(compactCss, 'pointer-events: auto', 'no auto hit testing')
  assertIncludes(compactCss, 'touch-action: pan-y', 'document pan-y')
  assertIncludes(flatCss, '-webkit-user-drag: none', 'no image drag')
  assertNotIncludes(compact, 'preventDefault', 'no preventDefault')
  assertNotIncludes(compact, 'touchstart', 'no touchstart handler')
  assertNotIncludes(compact, 'overflow: auto', 'no nested overflow auto in TSX')
  assertNotIncludes(compactCss, 'overflow: auto', 'no nested overflow auto')
  assertNotIncludes(compactCss, 'overflow: scroll', 'no nested overflow scroll')
  assertNotIncludes(compactCss, 'scroll-snap', 'no scroll-snap')
  console.log('PASS  2. touch / nested scroll / presentation-only tablet')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const b = compactHandoffBoundaryScrollPx(g)
  const samples = [-300, -200, -100, -20, 0, 20, 100, 200, 300]
  for (const d of samples) {
    const s = b + d
    const owner = compactMajorStickyOwnerAt(s, g)
    const t = compactHandoffTAtScroll(s, g)
    assert(owner === compactMajorStickyOwnerAt(s, g), `deterministic owner @${d}`)
    assert(t === compactHandoffTAtScroll(s, g), `deterministic handoffT @${d}`)
    if (d < 0) assert(owner === 'narrative', `narrative @${d}`)
    if (d > 0 && d < g.stickyH) assert(owner === 'product', `product @${d}`)
  }
  const jump = compactHandoffOwnerJump(b - 250, b + 250, g)
  assert(jump.from === 'narrative' && jump.to === 'product', 'fast jump owners')
  assert(
    compactHandoffReverseDeterministic(b - 80, b + 40, b + 180, g),
    'reverse determinism',
  )
  console.log('PASS  3. fast boundary jump + reverse determinism')
}

{
  assert(blackCoverDisplacementRatio() === 1, 'black 1:1')
  assert(COMPACT_PRODUCT_EXIT_RATIO === 1, 'product exit ratio 1')
  assert(
    compactProductExitMotionRatio(100, compactProductExitTravelPx(806)) === 1,
    'product exit motion 1',
  )
  assert(compactProductNativeExitY(68 - 100, 68, 806) === -100, 'exit -100')
  assertIncludes(compact, 'data-product-exit="native-sticky"', 'native exit kept')
  console.log('PASS  4. black + product exit 1:1 preserved')
}

{
  assertIncludes(compactCss, 'background: transparent', 'transparent wrappers')
  const stickyBlock = compactCss.slice(
    compactCss.indexOf('.sticky {'),
    compactCss.indexOf('.sticky[data-ps-lifecycle-exit'),
  )
  assert(stickyBlock.includes('background: transparent'), 'sticky bg transparent')
  assert(!stickyBlock.includes('hero-paper'), 'sticky no hero-paper fill')
  assertIncludes(compact, 'data-ps-beige-scope="screen"', 'beige scoped to screen')
  assertIncludes(compact, 'data-ps-stage-bg="transparent"', 'stage transparent attr')
  assertIncludes(flatCss, 'background: #f7f4ef', 'beige inside flattened screen root')
  assertNotIncludes(compactCss, 'clip-path:', 'no animated mask')
  assertNotIncludes(compactCss, 'mask-image', 'no mask-image')
  assertIncludes(
    stability,
    'full-viewport `--lv2-hero-paper` beige',
    'documents prior beige plate',
  )
  console.log('PASS  5. silhouette / beige restricted to device screen')
}

{
  const g = compactNarrativeGeometry(874, 68)
  assert(incomingMotionRatio(g, 100) === 1, 'narrative 1:1')
  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    assert(collisionInvariantHolds(g, i).ok, `collision ${i}`)
  }
  const slots = compactNarrativeSlotOffsets(g)
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const primary = primaryStatementAtScroll(slots.arriveEnd[i]!, g)
    assert(primary === i, `stmt ${i} reachable`)
    const v = statementVisualAtScroll(slots.arriveEnd[i]!, i, g)
    assert(v.y === 0 && v.opacity >= 0.99, `stmt ${i} settled`)
  }
  assertIncludes(narrativeCss, 'z-index: 10', 'narrative z-10 preserved')
  assertIncludes(narrative, 'data-narrative-engine', 'engine attribute')
  console.log('PASS  6. narrative regression frozen')
}

{
  assertIncludes(autoplay, 'HOLD_MS = 1750', 'autoplay hold')
  assertIncludes(autoplay, 'CROSSFADE_MS = 420', 'autoplay crossfade')
  assertIncludes(compact, 'FlattenedProductAutoplay', 'autoplay wired')
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero intact')
  assertIncludes(problem, 'LandingV2ProblemStoryDesktop', 'desktop problem')
  assertIncludes(desktopProduct, 'lifecycleExitScale', 'desktop product exit intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  7. autoplay / hero / desktop / registration')
}

console.log('\nPASS  landing mobile performance iteration 3C.3\n')
