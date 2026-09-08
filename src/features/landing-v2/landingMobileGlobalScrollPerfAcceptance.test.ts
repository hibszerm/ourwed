/**
 * Landing V2 — Iteration 3E global scroll performance structure.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LANDING_VIEWPORT_HEIGHT_NOISE_PX,
  landingViewportGeometryChanged,
} from '@/features/landing-v2/motion/landingStableViewport'
import {
  blackCoverDisplacementRatio,
  compactNarrativeGeometry,
  incomingMotionRatio,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'
import { COMPACT_PRODUCT_EXIT_RATIO } from '@/features/landing-v2/product-story/compactProductExit'

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
const product = read(
  'src/features/landing-v2/product-story/CompactProductReveal.tsx',
)
const productCss = read(
  'src/features/landing-v2/product-story/CompactProductReveal.module.css',
)
const lifecycle = read(
  'src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.tsx',
)
const lifecycleCss = read(
  'src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.module.css',
)
const lifecycleSurface = read(
  'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.tsx',
)
const mobile = read(
  'src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx',
)
const seasonImport = read(
  'src/features/landing-v2/mobile-story/LandingV2SeasonImportStory.tsx',
)
const features = read(
  'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.tsx',
)
const stableVp = read(
  'src/features/landing-v2/motion/landingStableViewport.ts',
)
const useScrolled = read('src/features/landing-v3/hooks/useScrolled.ts')
const navCss = read('src/features/landing-v3/styles/landingV3.module.css')
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== landing mobile global scroll perf (3E) ===\n')

{
  assertIncludes(stableVp, 'LANDING_VIEWPORT_HEIGHT_NOISE_PX', 'noise threshold')
  assert(LANDING_VIEWPORT_HEIGHT_NOISE_PX >= 40, 'noise covers toolbar')
  assert(
    !landingViewportGeometryChanged({ w: 390, h: 844 }, { w: 390, h: 860 }),
    '16px height change ignored',
  )
  assert(
    landingViewportGeometryChanged({ w: 390, h: 844 }, { w: 390, h: 920 }),
    'large height change accepted',
  )
  assert(
    landingViewportGeometryChanged({ w: 390, h: 844 }, { w: 430, h: 844 }),
    'width change accepted',
  )
  assertIncludes(narrative, 'landingViewportGeometryChanged', 'narrative gated')
  assertIncludes(lifecycle, 'landingViewportGeometryChanged', 'lifecycle gated')
  assertIncludes(lifecycleSurface, 'landingViewportGeometryChanged', 'surface gated')
  assertNotIncludes(seasonImport, 'visualViewport', 'no visualViewport listener')
  assertIncludes(seasonImport, 'landingViewportGeometryChanged', 'season import gated')
  console.log('PASS  1. toolbar / viewport geometry gate')
}

{
  assertNotIncludes(narrativeCss, '100dvh', 'narrative no dvh sticky')
  assertNotIncludes(productCss, '100dvh', 'product no dvh sticky')
  const stickyIdx = lifecycleCss.indexOf('.sticky {')
  const stickyBlock = lifecycleCss.slice(stickyIdx, stickyIdx + 400)
  assert(!stickyBlock.includes('100dvh'), 'lifecycle sticky no dvh')
  assertIncludes(narrativeCss, '100svh', 'narrative uses svh')
  console.log('PASS  2. svh-stable theater heights')
}

{
  assertIncludes(mobile, "rootMargin: isCompactViewport ? '35% 0px 35% 0px'", 'mobile tighter IO')
  assertIncludes(features, 'data-features-scroll-engine="none"', 'compact features no useScroll')
  assertIncludes(features, 'FeaturesGridCompact', 'compact split')
  const compactBody = features.slice(
    features.indexOf('function FeaturesGridCompact'),
    features.indexOf('function FeaturesGridDesktop'),
  )
  assertNotIncludes(compactBody, 'useScroll(', 'compact grid body has no useScroll')
  assertIncludes(useScrolled, 'if (next === scrolledRef.current) return', 'nav boolean flip only')
  assertIncludes(navCss, 'backdrop-filter: none', 'coarse nav no live blur')
  console.log('PASS  3. offscreen / features / nav cost reductions')
}

{
  assertIncludes(narrativeCss, 'animation-timeline: scroll(root)', 'CSS scroll kept')
  assertNotIncludes(narrativeCss, 'filter:', 'no scroll filter on narrative')
  assertNotIncludes(narrativeCss, 'backdrop-filter', 'no narrative backdrop')
  assertIncludes(product, 'data-product-scroll-measure="off"', 'product no scroll measure')
  assertNotIncludes(product, "addEventListener('scroll'", 'product no scroll')
  assertNotIncludes(narrative, 'preventDefault', 'no preventDefault')
  assertNotIncludes(product, 'touchmove', 'no touchmove')
  console.log('PASS  4. compositor-friendly / no gesture interception')
}

{
  const g = compactNarrativeGeometry(874, 68)
  assert(incomingMotionRatio(g, 100) === 1, 'narrative 1:1')
  assert(blackCoverDisplacementRatio() === 1, 'black 1:1')
  assert(COMPACT_PRODUCT_EXIT_RATIO === 1, 'product exit 1:1')
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration',
  )
  console.log('PASS  5. Problem/Product/Hero/registration regressions')
}

console.log('\nPASS  landing mobile global scroll perf (3E)\n')
