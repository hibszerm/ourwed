/**
 * Landing V2 — mobile performance Iteration 3D
 * Native CSS scroll-timeline narrative + remove main-thread scrub.
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
  compactNarrativeCssIncomingSpanPx,
  compactNarrativeCssScrollRanges,
  compactNarrativePinScrollY,
} from '@/features/landing-v2/sections/compactNarrativeCssScroll'
import {
  COMPACT_MAX_PRODUCT_BITMAP_LAYERS,
  COMPACT_MOTIONVALUES_VISIBLE_MOTION_AFTER,
  COMPACT_RAF_SCROLL_LOOPS_AFTER,
  COMPACT_SCROLL_LISTENERS_AFTER,
  COMPACT_STICKY_COUNT_AFTER,
  COMPACT_STICKY_COUNT_BEFORE,
} from '@/features/landing-v2/sections/compactScrollArchitecture3D'
import {
  COMPACT_PRODUCT_EXIT_RATIO,
  compactProductExitMotionRatio,
  compactProductExitTravelPx,
} from '@/features/landing-v2/product-story/compactProductExit'
import {
  compactHandoffBoundaryScrollPx,
  compactHandoffOwnerJump,
  compactHandoffReverseDeterministic,
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

const narrative = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.tsx',
)
const narrativeCss = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.module.css',
)
const cssScroll = read(
  'src/features/landing-v2/sections/compactNarrativeCssScroll.ts',
)
const arch = read(
  'src/features/landing-v2/sections/compactScrollArchitecture3D.ts',
)
const compact = read(
  'src/features/landing-v2/product-story/CompactProductReveal.tsx',
)
const compactCss = read(
  'src/features/landing-v2/product-story/CompactProductReveal.module.css',
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

console.log('\n=== landing mobile performance iteration 3D ===\n')

{
  assertIncludes(arch, 'BEFORE (990177f)', 'documents BEFORE classification')
  assertIncludes(arch, 'NATIVE CSS SCROLL-DRIVEN', 'AFTER CSS class')
  assertIncludes(cssScroll, 'supportsCssScrollTimeline', 'feature detect')
  assertIncludes(narrative, 'supportsCssScrollTimeline', 'wired detect')
  assertIncludes(narrative, "data-narrative-engine", 'engine attr')
  assertIncludes(narrativeCss, 'animation-timeline: scroll(root)', 'scroll timeline')
  assertIncludes(narrativeCss, '@keyframes lv2NarrativeIncoming', 'incoming kf')
  assertIncludes(narrativeCss, '@keyframes lv2NarrativeOutgoing', 'outgoing kf')
  assertIncludes(narrativeCss, '@supports (animation-timeline: scroll())', 'progressive enhance')
  assertNotIncludes(narrativeCss, 'filter:', 'no scroll-driven filter')
  assertNotIncludes(narrativeCss, 'backdrop-filter', 'no backdrop-filter')
  /* CSS path: no continuous handoff publish / ownership */
  assertNotIncludes(narrative, 'publishScene07HandoffT', 'no handoff publish on compact')
  assertNotIncludes(narrative, 'setTheaterOwned', 'no ownership state')
  assertNotIncludes(compact, 'scene07HandoffMv', 'product no handoff Mv')
  assertNotIncludes(compact, "addEventListener('scroll'", 'product no scroll listener')
  assertIncludes(compact, "data-product-scroll-measure=\"off\"", 'measure off')
  console.log('PASS  1. architecture: CSS scroll timeline + no parallel JS scrub path')
}

{
  assert(COMPACT_STICKY_COUNT_BEFORE === 2 && COMPACT_STICKY_COUNT_AFTER === 2, 'sticky count')
  assert(COMPACT_SCROLL_LISTENERS_AFTER === 0, 'scroll listeners after = 0')
  assert(COMPACT_RAF_SCROLL_LOOPS_AFTER === 0, 'rAF loops after = 0')
  assert(COMPACT_MOTIONVALUES_VISIBLE_MOTION_AFTER === 0, 'Mv visible motion after = 0')
  assertNotIncludes(narrativeCss, 'will-change: transform, opacity', 'no permanent will-change on stmts')
  assertNotIncludes(flatCss, 'will-change: opacity', 'no permanent layer will-change')
  assertNotIncludes(compactCss, 'content-visibility', 'no content-visibility handoff')
  assertNotIncludes(compact, 'data-ps-theater-owned', 'no z ownership latch')
  console.log('PASS  2. performance structure metrics')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const pin = compactNarrativePinScrollY(4000, g.navH)
  const ranges = compactNarrativeCssScrollRanges(g, pin)
  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const span = compactNarrativeCssIncomingSpanPx(ranges, i)
    assert(span === g.travelPx, `stmt ${i} CSS range span ${span} !== travel ${g.travelPx}`)
  }
  assert(incomingMotionRatio(g, 100) === 1, 'geometry ratio 1')
  assert(blackCoverDisplacementRatio() === 1, 'black 1:1')
  assert(COMPACT_PRODUCT_EXIT_RATIO === 1, 'product exit 1')
  assert(
    compactProductExitMotionRatio(100, compactProductExitTravelPx(806)) === 1,
    'product exit motion',
  )
  console.log('PASS  3. geometry 1:1 (narrative CSS ranges + black + product)')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const b = compactHandoffBoundaryScrollPx(g)
  const jump = compactHandoffOwnerJump(b - 250, b + 250, g)
  assert(jump.from === 'narrative' && jump.to === 'product', 'fast jump')
  assert(
    compactHandoffReverseDeterministic(b - 80, b + 40, b + 180, g),
    'reverse',
  )
  assert(compactMajorStickyOwnerAt(b - 20, g) === 'narrative', 'pre boundary')
  console.log('PASS  4. rapid jump + reverse determinism')
}

{
  assertIncludes(compactCss, 'pointer-events: none', 'pointer none')
  assertIncludes(compact, 'data-product-pointer="none"', 'pointer marker')
  assertNotIncludes(compactCss, 'overflow: auto', 'no nested scroll')
  assertNotIncludes(compactCss, 'overflow: scroll', 'no nested scroll 2')
  const stickyBlock = compactCss.slice(
    compactCss.indexOf('.sticky {'),
    compactCss.indexOf('.stage {'),
  )
  assert(stickyBlock.includes('background: transparent'), 'sticky transparent')
  assertIncludes(compact, 'data-ps-beige-scope="screen"', 'beige in screen')
  assertNotIncludes(compactCss, 'clip-path:', 'no mask')
  console.log('PASS  5. touch + silhouette regressions')
}

{
  assertIncludes(autoplay, 'HOLD_MS = 1750', 'hold')
  assertIncludes(autoplay, 'CROSSFADE_MS = 420', 'crossfade')
  assertIncludes(autoplay, 'data-product-decode-policy="current-next"', 'decode policy')
  assertIncludes(autoplay, 'data-product-layers={dual ? 2 : 1}', 'max 2 layers')
  assert(COMPACT_MAX_PRODUCT_BITMAP_LAYERS === 2, 'max layers const')
  assertIncludes(compact, 'IntersectionObserver', 'hysteretic IO')
  assertIncludes(compact, 'ratio >= 0.62', 'enter hysteresis')
  assertIncludes(compact, 'ratio <= 0.18', 'leave hysteresis')
  assertNotIncludes(autoplay, 'for (const id of PRODUCT_AUTOPLAY_ORDER) warm', 'no mount-all warm')
  console.log('PASS  6. autoplay gate + decode budget')
}

{
  const g = compactNarrativeGeometry(874, 68)
  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    assert(collisionInvariantHolds(g, i).ok, `collision ${i}`)
  }
  const slots = compactNarrativeSlotOffsets(g)
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    assert(primaryStatementAtScroll(slots.arriveEnd[i]!, g) === i, `stmt ${i}`)
    const v = statementVisualAtScroll(slots.arriveEnd[i]!, i, g)
    assert(v.y === 0 && v.opacity >= 0.99, `settled ${i}`)
  }
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero')
  assertIncludes(problem, 'LandingV2ProblemStoryDesktop', 'desktop problem')
  assertIncludes(desktopProduct, 'lifecycleExitScale', 'desktop product')
  assertIncludes(narrative, 'useReducedMotion', 'reduced motion path')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration',
  )
  console.log('PASS  7. narrative / hero / desktop / reduced-motion / registration')
}

console.log('\nPASS  landing mobile performance iteration 3D\n')
