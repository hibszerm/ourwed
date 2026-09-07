/**
 * Landing V2 — mobile performance Iteration 3A
 * Compact Product: Scene 07 curtain + stable autoplay tablet.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const product = read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx')
const compact = read(
  'src/features/landing-v2/product-story/CompactProductReveal.tsx',
)
const compactCss = read(
  'src/features/landing-v2/product-story/CompactProductReveal.module.css',
)
const autoplay = read(
  'src/features/landing-v2/devices/FlattenedProductAutoplay.tsx',
)
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const problemCss = read(
  'src/features/landing-v2/sections/LandingV2ProblemStory.module.css',
)
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const register = read('src/features/auth/components/RegisterForm.tsx')
const assets = read('src/features/landing-v2/devices/landingDeviceAssets.ts')

console.log('\n=== landing mobile performance iteration 3A (product reveal) ===\n')

{
  assertIncludes(product, 'CompactProductReveal', 'compact path uses reveal')
  assertIncludes(
    product,
    'if (isCompactViewport) {\n    return <CompactProductReveal />',
    'compact early return',
  )
  assertIncludes(product, 'LandingV2ProductStoryDesktop', 'desktop theater kept')
  assertIncludes(product, 'ProductStoryWorkspace', 'desktop live workspace')
  assertNotIncludes(compact, 'deviceScaleFromHandoff', 'no reverse-Hero camera scale')
  assertNotIncludes(compact, 'screenBlackoutFromHandoff', 'no blackout scrub')
  assertNotIncludes(compact, 'ProductStoryWorkspace', 'no live workspace')
  console.log('PASS  1. compact Product uses dedicated reveal path')
}

{
  assertIncludes(
    problem,
    'isCompactViewport ? 0 : SCENE07_BLUR_MAX_DESKTOP',
    'compact curtain no blur',
  )
  assertIncludes(
    problem,
    'scene07ExitScaleTo = isCompactViewport\n    ? 1',
    'compact no exit scale',
  )
  assertIncludes(problem, 's6ExitY', 'curtain translateY')
  assertIncludes(problem, 't * vh * -1.08', 'upward curtain travel')
  assertIncludes(problem, 'Iteration 3A: translateY curtain only', 'compact portal omits scale')
  assertIncludes(
    problem,
    'isCompactViewport\n                      ? undefined /* Iteration 3A: no filter on curtain */',
    'compact omits filter binding',
  )
  assertIncludes(problemCss, 'background: #000000', 'solid black curtain')
  console.log('PASS  2. Scene 07 compact curtain is translate-only')
}

{
  assertIncludes(autoplay, 'FlattenedProductAutoplay', 'autoplay component')
  assertIncludes(autoplay, 'HOLD_MS = 1750', 'hold timing')
  assertIncludes(autoplay, 'CROSSFADE_MS = 420', 'crossfade timing')
  assertIncludes(autoplay, "data-product-layers={dual ? 2 : 1}", 'layer budget attr')
  assertIncludes(autoplay, "'overview'", 'overview state')
  assertIncludes(autoplay, "'logistics'", 'logistics state')
  assertIncludes(autoplay, "'finance'", 'finance state')
  assertIncludes(autoplay, "'questionnaire'", 'questionnaire state')
  assertIncludes(compact, 'FlattenedProductAutoplay', 'wired into reveal')
  assertIncludes(compact, 'autoplayActive', 'viewport-gated autoplay')
  assertIncludes(compact, 'sectionNear', 'IntersectionObserver near-viewport gate')
  assertIncludes(compact, 'IntersectionObserver', 'pauses offscreen')
  assertIncludes(assets, 'productTabletLogistics', 'reuses logistics asset')
  assertIncludes(assets, 'productTabletQuestionnaire', 'reuses questionnaire asset')
  console.log('PASS  3. autoplay four flattened states')
}

{
  assertIncludes(compactCss, '200svh', 'shortened compact runway')
  assertIncludes(compactCss, 'will-change: auto', 'no perpetual fit will-change')
  assertIncludes(compactCss, 'box-shadow:', 'static premium shadow')
  assertNotIncludes(compactCss, 'filter:', 'no filter on compact product stage')
  assertNotIncludes(compactCss, 'clip-path:', 'no clip-path animation')
  console.log('PASS  4. compact runway + static shell')
}

{
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero flatten intact')
  assertIncludes(hero, 'themeProgressMv', 'hero light→dark intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  5. hero + registration regressions guarded')
}

console.log('\nPASS  landing mobile performance iteration 3A\n')
