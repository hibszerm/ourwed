/**
 * Landing V2 — Iteration 3E Features mobile interaction parity.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FEATURE_CARDS } from '@/features/landing-v2/features-grid/featuresData'

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

const features = read(
  'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.tsx',
)
const featuresCss = read(
  'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.module.css',
)
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== landing mobile features interaction (3E) ===\n')

{
  assert(FEATURE_CARDS.length === 9, 'nine feature cards')
  const ids = FEATURE_CARDS.map((c) => c.id)
  assert(ids.includes('finanse') && ids.includes('ankiety'), 'catalog ends')
  for (const id of ids) {
    assertIncludes(features, `id={feature.id}`, 'maps features')
    assertIncludes(featuresCss, `data-feature='${id}'`, `css for ${id}`)
  }
  console.log('PASS  1. nine cards present')
}

{
  assertIncludes(
    featuresCss,
    '@media (hover: hover) and (pointer: fine)',
    'desktop hover scoped',
  )
  assertIncludes(features, 'FeaturesGridDesktop', 'desktop path retained')
  assertIncludes(features, 'useScroll', 'desktop still uses scroll reveal')
  console.log('PASS  2. desktop hover / scroll preserved')
}

{
  /* Coarse must NOT force permanent hover end-states at rest */
  const coarse = featuresCss.slice(featuresCss.indexOf('@media (hover: none)'))
  assertIncludes(coarse, "data-feature-demo='done'", 'demo-done settles hover language')
  assertNotIncludes(
    coarse.split('[data-feature-demo')[0] ?? '',
    '.inboxCountHover { opacity: 1',
    'no unconditional hover count at rest',
  )
  assertIncludes(features, "data-feature-demo={demo}", 'demo attr wired')
  assertIncludes(features, 'demonstratedRef', 'one-shot latch')
  assertIncludes(features, 'ratio >= 0.55', 'IO threshold')
  assertIncludes(features, 'io.disconnect()', 'disconnect after once')
  console.log('PASS  3. mobile rest + one-shot demo')
}

{
  assertIncludes(features, 'data-features-scroll-engine="none"', 'no compact useScroll')
  /* Permanent will-change on all nine cards is forbidden; only transient reveal. */
  assertNotIncludes(
    featuresCss,
    `.module {\n  will-change: transform`,
    'no permanent will-change on .module',
  )
  assertIncludes(featuresCss, 'prefers-reduced-motion: reduce', 'reduced motion')
  assertIncludes(features, "reduced ? 'done' : 'idle'", 'PRM settles immediately')
  console.log('PASS  4. perf + reduced motion')
}

{
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  5. registration')
}

console.log('\nPASS  landing mobile features interaction (3E)\n')
