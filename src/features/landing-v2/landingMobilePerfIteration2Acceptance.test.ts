/**
 * Landing V2 — mobile performance Iteration 2 architecture guards.
 * Flattened device application content on compact; desktop stays live.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  phoneAppContentLayerCount,
  phoneLayersAt,
} from './devices/landingDeviceAssets'

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

const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const product = read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx')
const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const surface = read(
  'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.tsx',
)
const flatHero = read(
  'src/features/landing-v2/devices/FlattenedHeroTabletContent.tsx',
)
const flatProduct = read(
  'src/features/landing-v2/devices/FlattenedProductTabletContent.tsx',
)
const flatPhone = read(
  'src/features/landing-v2/devices/FlattenedPhoneAppContent.tsx',
)
const assets = read('src/features/landing-v2/devices/landingDeviceAssets.ts')
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== landing mobile performance iteration 2 ===\n')

{
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero compact flattened')
  assertIncludes(hero, 'isCompactViewport ? (', 'hero compact branch')
  assertIncludes(hero, 'HeroModernDashboard', 'desktop live dashboard kept')
  assert(
    hero.indexOf('FlattenedHeroTabletContent') <
      hero.indexOf('<HeroModernDashboard'),
    'flattened precedes live in compact ternary',
  )
  assertIncludes(flatHero, 'heroTabletLight', 'light snapshot')
  assertIncludes(flatHero, 'heroTabletDark', 'dark snapshot')
  assertIncludes(flatHero, 'opacity: lightOp', 'light opacity')
  assertIncludes(flatHero, 'opacity: darkOp', 'dark opacity')
  assertNotIncludes(flatHero, "from '@/features/landing-v2/hero/HeroModernDashboard'", 'no live dashboard import')
  console.log('PASS  1. compact hero tablet flattens light→dark')
}

{
  assertIncludes(product, 'CompactProductReveal', 'product compact reveal')
  assertIncludes(product, 'ProductStoryWorkspace', 'desktop live workspace kept')
  assertIncludes(
    read('src/features/landing-v2/devices/FlattenedProductAutoplay.tsx'),
    'FlattenedProductAutoplay',
    'autoplay flattened product',
  )
  console.log('PASS  2. compact product tablet flattens via reveal/autoplay')
}

{
  assertIncludes(mobile, 'CompactPhoneProductTour', 'compact desktop-parity phone tour')
  assertIncludes(
    read('src/features/landing-v2/devices/CompactPhoneProductTour.tsx'),
    'MobileOurWedApp',
    'tour uses live MobileOurWedApp choreography',
  )
  assertIncludes(mobile, 'MobileOurWedApp', 'desktop live phone app kept')
  assertNotIncludes(mobile, 'FlattenedPhoneAutoplay', 'rejected slideshow gone')
  assertNotIncludes(mobile, 'FlattenedPhoneAppContent', 'compact does not mount strip slideshow')
  /* FlattenedPhoneAppContent retained as unused asset helper module only — not wired to compact. */
  assertIncludes(flatPhone, 'stripY', 'legacy strip module still transform-based')
  console.log('PASS  3. compact phone uses desktop-parity MobileOurWedApp tour')
}

{
  const midScroll = phoneLayersAt(0.25)
  assert(midScroll.a === 'dashStrip' && midScroll.b === 'dashStrip', 'dash = 1 strip')
  assert(phoneAppContentLayerCount(0.25) === 1, 'normal dash layer count 1')
  assert(phoneAppContentLayerCount(0.6) === 2, 'handoff max 2')
  assert(phoneAppContentLayerCount(0.72) === 1, 'day alone = 1')
  assert(phoneAppContentLayerCount(0.8) === 2, 'day→nav transition = 2')
  assert(phoneAppContentLayerCount(0.95) === 2, 'nav→brief transition = 2')
  assert(phoneAppContentLayerCount(0.99) === 1, 'brief settled = 1')
  let max = 0
  for (let i = 0; i <= 100; i++) {
    max = Math.max(max, phoneAppContentLayerCount(i / 100))
  }
  assert(max <= 2, `max layers across story ≤ 2 (got ${max})`)
  console.log('PASS  4. phone app-content layer budget ≤ 2')
}

{
  const required = [
    'public/landing-v2/devices/hero-tablet-light.webp',
    'public/landing-v2/devices/hero-tablet-dark.webp',
    'public/landing-v2/devices/product-tablet-overview.webp',
    'public/landing-v2/devices/phone-dashboard-strip.webp',
    'public/landing-v2/devices/phone-day.webp',
    'public/landing-v2/devices/phone-nav.webp',
    'public/landing-v2/devices/phone-brief.webp',
  ]
  for (const rel of required) {
    assert(existsSync(join(ROOT, rel)), `missing asset ${rel}`)
    assert(statSync(join(ROOT, rel)).size > 1000, `asset too small ${rel}`)
  }
  assertIncludes(assets, 'phoneDashboardStrip', 'strip asset URL')
  console.log('PASS  5. flattened assets present')
}

{
  assertIncludes(problem, 'SCENE07_BLUR_MAX_COMPACT = 18', 'compact blur constant retained')
  /* Iteration 3A: curtain uses blur 0; constant kept for desktop/docs. */
  assertIncludes(problem, 'SCENE07_BLUR_MAX_DESKTOP = 25', 'desktop blur kept')
  console.log('PASS  6. Scene07 blur constants present')
}

{
  assertIncludes(surface, 'width: surfaceWidth', 'pill width morph')
  assertIncludes(surface, 'height: surfaceHeight', 'pill height morph')
  assertNotIncludes(surface, 'scaleX:', 'no scaleX on shell/content')
  assertNotIncludes(surface, 'scaleY:', 'no scaleY on shell/content')
  assertIncludes(surface, 'never non-uniform', 'documents text scale rule')
  console.log('PASS  7. Lifecycle pill no non-uniform text scale')
}

{
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration remains locked',
  )
  console.log('PASS  8. registration lock')
}

{
  assertNotIncludes(hero, 'isIPhone', 'no UA sniff hero')
  assertNotIncludes(mobile, 'userAgent', 'no UA sniff mobile')
  assertIncludes(hero, 'useLandingCompactViewport', 'compact capability path')
  console.log('PASS  9. compact path via viewport capability')
}

console.log('\nPASS  landing mobile performance iteration 2\n')
