/**
 * Landing V2 — mobile performance Iteration 2.1 (historical assets + mapping).
 * Compact Product motion superseded by Iteration 3A (curtain + autoplay).
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  productAppContentLayerCount,
  productLayersAt,
} from './devices/landingDeviceAssets'
import { PRODUCT_STORY_RANGES } from './product-story/productStoryProgress'

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
const flatProduct = read(
  'src/features/landing-v2/devices/FlattenedProductTabletContent.tsx',
)
const autoplay = read(
  'src/features/landing-v2/devices/FlattenedProductAutoplay.tsx',
)
const assets = read('src/features/landing-v2/devices/landingDeviceAssets.ts')
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const surface = read(
  'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.tsx',
)
const register = read('src/features/auth/components/RegisterForm.tsx')
const progress = read('src/features/landing-v2/product-story/productStoryProgress.ts')

console.log('\n=== landing mobile performance iteration 2.1 (product tablet) ===\n')

{
  assertIncludes(progress, "ProductStoryTabId =", 'tab id union')
  assertIncludes(progress, "| 'overview'", 'overview tab')
  assertIncludes(progress, "| 'logistics'", 'logistics tab')
  assertIncludes(progress, "| 'finance'", 'finance tab')
  assertIncludes(progress, "| 'questionnaire'", 'questionnaire tab')
  assertIncludes(assets, 'productTabletLogistics', 'logistics asset')
  assertIncludes(assets, 'productTabletFinance', 'finance asset')
  assertIncludes(assets, 'productTabletQuestionnaire', 'questionnaire asset')
  assertIncludes(flatProduct, 'productLayersAt', 'scroll-map helper retained')
  assertIncludes(autoplay, 'FlattenedProductAutoplay', '3A autoplay reuses states')
  assertIncludes(product, 'ProductStoryWorkspace', 'desktop live kept')
  assertIncludes(product, 'CompactProductReveal', 'compact reveal path')
  console.log('PASS  1. four Product tab assets + desktop live path')
}

{
  assert(productLayersAt(0.1).a === 'overview', 'start overview')
  assert(productLayersAt(0.28).a === 'overview' && productLayersAt(0.28).b === 'logistics', 'to logistics blend')
  assert(productAppContentLayerCount(0.28) === 2, 'transition = 2')
  assert(productLayersAt(0.4).a === 'logistics' && productLayersAt(0.4).b === 'logistics', 'logistics hold')
  assert(productAppContentLayerCount(0.4) === 1, 'hold = 1')
  assert(productLayersAt(0.58).b === 'finance', 'to finance')
  assert(productLayersAt(0.7).a === 'finance', 'finance hold')
  assert(productLayersAt(0.86).b === 'questionnaire', 'to questionnaire')
  assert(productLayersAt(0.96).a === 'questionnaire', 'questionnaire hold')
  let max = 0
  for (let i = 0; i <= 100; i++) {
    max = Math.max(max, productAppContentLayerCount(i / 100))
  }
  assert(max <= 2, `max product layers ≤ 2 (got ${max})`)
  assert(
    PRODUCT_STORY_RANGES.toLogistics.start === 0.22,
    'original logistics threshold frozen',
  )
  console.log('PASS  2. scroll progress → state mapping + layer budget')
}

{
  for (const name of [
    'product-tablet-overview.webp',
    'product-tablet-logistics.webp',
    'product-tablet-finance.webp',
    'product-tablet-questionnaire.webp',
  ]) {
    const rel = `public/landing-v2/devices/${name}`
    assert(existsSync(join(ROOT, rel)), `missing ${rel}`)
    assert(statSync(join(ROOT, rel)).size > 1000, `too small ${rel}`)
  }
  console.log('PASS  3. product tab assets present')
}

{
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero flatten unchanged')
  assertIncludes(hero, 'themeProgressMv', 'hero light→dark intact')
  assertIncludes(problem, 'SCENE07_BLUR_MAX_COMPACT = 18', 'compact blur constant retained')
  assertIncludes(surface, 'width: surfaceWidth', 'lifecycle width morph kept')
  assertNotIncludes(surface, 'scaleX:', 'lifecycle no scaleX')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration lock')
  console.log('PASS  4. hero / blur constant / pill / registration regressions guarded')
}

{
  assertNotIncludes(
    flatProduct,
    "from '@/features/landing-v2/product-story/ProductStoryWorkspace'",
    'flat product does not import live workspace',
  )
  assertNotIncludes(
    autoplay,
    "from '@/features/landing-v2/product-story/ProductStoryWorkspace'",
    'autoplay does not import live workspace',
  )
  console.log('PASS  5. ProductStoryWorkspace absent from flattened paths')
}

console.log('\nPASS  landing mobile performance iteration 2.1\n')
