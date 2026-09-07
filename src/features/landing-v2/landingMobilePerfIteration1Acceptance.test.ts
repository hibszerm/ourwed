/**
 * Landing V2 — mobile performance Iteration 1 architecture guards.
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

const gate = read('src/features/landing-v2/motion/useTheaterScrollGate.ts')
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const product = read('src/features/landing-v2/product-story/LandingV2ProductStory.tsx')
const lifecycle = read('src/features/landing-v2/lifecycle-story/LandingV2LifecycleStory.tsx')
const mobile = read('src/features/landing-v2/mobile-story/LandingV2MobileStory.tsx')
const surface = read(
  'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.tsx',
)
const surfaceCss = read(
  'src/features/landing-v2/lifecycle-story/LifecycleTransformSurface.module.css',
)
const navCss = read(
  'src/features/landing-v2/mobile-story/app/screens/MobileNavigationDemo.module.css',
)
const barCss = read(
  'src/features/landing-v2/mobile-story/app/screens/MobileCompactAssignmentBar.module.css',
)
const panelCss = read(
  'src/features/landing-v2/product-story/ProductStoryWorkspace.module.css',
)
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== landing mobile performance iteration 1 ===\n')

{
  assertIncludes(gate, 'IntersectionObserver', 'IO gate')
  assertIncludes(gate, 'activeRef', 'active ref')
  assertIncludes(gate, '100% 0px 100% 0px', 'viewport buffer margin')
  assertNotIncludes(gate, 'iPhone', 'no UA sniff')
  assertNotIncludes(gate, 'userAgent', 'no UA sniff')
  console.log('PASS  1. theater scroll gate helper')
}

{
  const compactNarrative = read(
    'src/features/landing-v2/sections/CompactProblemNarrative.tsx',
  )
  for (const [name, src] of [
    ['hero', hero],
    ['problem', problem],
    ['problem-narrative', compactNarrative],
    ['product', product],
    ['lifecycle', lifecycle],
    ['mobile', mobile],
  ] as const) {
    assertIncludes(src, 'useTheaterScrollGate', `${name} gates scroll`)
    assertIncludes(src, 'if (!activeRef.current', `${name} skips offscreen measure`)
  }
  console.log('PASS  2. all sticky theaters gate continuous measure')
}

{
  assertNotIncludes(
    lifecycle,
    "document.addEventListener('scroll'",
    'lifecycle no duplicate document scroll',
  )
  assertNotIncludes(
    mobile,
    "document.addEventListener('scroll'",
    'mobile no duplicate document scroll',
  )
  console.log('PASS  3. duplicate document capture scroll removed')
}

{
  assertIncludes(mobile, 'phoneAppMounted', 'lazy phone app mount')
  assertIncludes(mobile, 'data-mobile-app-placeholder', 'placeholder before mount')
  assertIncludes(mobile, "compactRef.current) return 'none'", 'compact headline no blur')
  console.log('PASS  4. mobile story: deferred app + no compact headline blur')
}

{
  assertIncludes(surface, 'width: surfaceWidth', 'width morph restored')
  assertIncludes(surface, 'height: surfaceHeight', 'height morph restored')
  assertNotIncludes(surface, 'scaleX:', 'no non-uniform scaleX on shell')
  assertNotIncludes(surface, 'scaleY:', 'no non-uniform scaleY on shell')
  assertIncludes(
    surface,
    'never non-uniform',
    'documents no text squash',
  )
  console.log('PASS  5. lifecycle compact avoids non-uniform text scale')
}

{
  assertIncludes(navCss, '@media (pointer: coarse)', 'nav coarse media')
  assertIncludes(barCss, '@media (pointer: coarse)', 'assignment bar coarse media')
  assertIncludes(barCss, 'backdrop-filter: blur(10px) saturate(1.06)', 'desktop glass kept')
  assertIncludes(panelCss, '@media (max-width: 1100px)', 'compact panel blur off')
  console.log('PASS  6. glass/blur reduced on touch / compact')
}

{
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration remains locked',
  )
  console.log('PASS  7. registration lock')
}

console.log('\nPASS  landing mobile performance iteration 1\n')
