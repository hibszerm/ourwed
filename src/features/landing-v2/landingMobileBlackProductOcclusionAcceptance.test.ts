/**
 * Landing V2 — Iteration 3F.3 black narrative → Product occlusion seam.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blackCoverDisplacementRatio } from '@/features/landing-v2/sections/compactProblemNarrativeProgress'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, label: string) {
  assert(src.includes(needle), `missing ${label}: ${needle}`)
}

function assertNotIncludes(src: string, needle: string, label: string) {
  assert(!src.includes(needle), `unexpected ${label}: ${needle}`)
}

console.log('\n=== landing mobile black→product occlusion (3F.3) ===\n')

{
  const narrativeCss = read(
    'src/features/landing-v2/sections/CompactProblemNarrative.module.css',
  )
  const productCss = read(
    'src/features/landing-v2/product-story/CompactProductReveal.module.css',
  )
  assertIncludes(narrativeCss, 'z-index: 10', 'narrative above product')
  assertIncludes(productCss, 'z-index: 6', 'product under narrative')
  assertIncludes(productCss, 'background: transparent', 'product wrappers transparent')
  assertIncludes(productCss, 'margin-top: calc(var(--lv2-nav-h) - 100svh)', 'overlap geometry')
  assertIncludes(narrativeCss, '.sticky::before', 'static black occlusion plate')
  assertIncludes(narrativeCss, 'max(56px, 7svh)', 'safety bleed')
  assertIncludes(narrativeCss, 'overflow: visible', 'sticky allows overscan paint')
  assertIncludes(narrativeCss, 'z-index: 0', 'plate behind copy')
  assertIncludes(narrativeCss, 'z-index: 1', 'reading zone above plate')
  console.log('PASS  1. static black overscan occlusion')
}

{
  const narrative = read('src/features/landing-v2/sections/CompactProblemNarrative.tsx')
  const product = read('src/features/landing-v2/product-story/CompactProductReveal.tsx')
  const productCss = read(
    'src/features/landing-v2/product-story/CompactProductReveal.module.css',
  )
  assertNotIncludes(narrative, 'setZIndex', 'no runtime z switch')
  assertNotIncludes(product, 'content-visibility', 'no content-visibility switch')
  assertIncludes(product, 'data-product-exit="native-sticky"', 'native exit')
  assertIncludes(productCss, 'pointer-events: none', 'pointer-events none')
  assert(blackCoverDisplacementRatio() === 1, 'native black displacement 1.0')
  console.log('PASS  2. no JS ownership / native 1:1')
}

{
  const narrativeCss = read(
    'src/features/landing-v2/sections/CompactProblemNarrative.module.css',
  )
  const productCss = read(
    'src/features/landing-v2/product-story/CompactProductReveal.module.css',
  )
  assertNotIncludes(productCss, '@keyframes', 'no product opacity keyframes')
  assertNotIncludes(productCss, 'opacity: 0', 'product not opacity-hidden')
  assertIncludes(narrativeCss, 'height: calc(100svh - var(--lv2-nav-h))', 'sticky height unchanged')
  assertIncludes(productCss, 'height: calc(100svh - var(--lv2-nav-h))', 'product sticky height')
  console.log('PASS  3. reveal timing geometry preserved')
}

{
  const progress = read(
    'src/features/landing-v2/sections/compactProblemNarrativeProgress.ts',
  )
  const narrativeTsx = read('src/features/landing-v2/sections/CompactProblemNarrative.tsx')
  assertIncludes(progress, 'COMPACT_NARRATIVE_COVER_HOLD_SVH = 0', 'no dead cover hold')
  assertNotIncludes(narrativeTsx, 'scene07HandoffMv', 'no handoff MV ownership')
  console.log('PASS  4. narrative choreography untouched')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(register, 'const REGISTRATION_ENABLED = false', 'registration')
  console.log('PASS  5. registration')
}

console.log('\nPASS  landing mobile black→product occlusion\n')
