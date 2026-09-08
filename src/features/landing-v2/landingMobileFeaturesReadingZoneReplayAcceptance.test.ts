/**
 * Landing V2 — Iteration 3E.2 directional reading-line feature demos.
 */

import {
  FEATURE_DEMO_READING_LINE,
  FEATURE_DEMO_RESET_BELOW,
  createFeatureDemoSample,
  crossedReadingLineBackward,
  crossedReadingLineForward,
  featureDemoDataAttr,
  shouldIgnoreFeatureDemoSample,
  stepFeatureDemo,
} from '@/features/landing-v2/features-grid/mobileFeatureDemoGeometry'
import { FEATURE_DEMO_COARSE_ROOT_MARGIN } from '@/features/landing-v2/features-grid/useMobileFeatureDemo'
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

function run(ratios: number[]) {
  let sample = createFeatureDemoSample('rest')
  const plays: number[] = []
  for (const r of ratios) {
    const next = stepFeatureDemo(sample, r)
    if (next.played) plays.push(r)
    sample = {
      phase: next.phase,
      prevRatio: next.prevRatio,
      playCount: next.playCount,
    }
  }
  return { sample, plays }
}

console.log('\n=== landing mobile features reading-line directional (3E.2) ===\n')

{
  assert(FEATURE_DEMO_READING_LINE === 0.75, 'reading line 0.75')
  assert(FEATURE_DEMO_RESET_BELOW === 0.95, 'reset below 0.95')
  assert(
    FEATURE_DEMO_COARSE_ROOT_MARGIN === '-40% 0px 5% 0px',
    'coarse corridor rootMargin',
  )
  console.log('PASS  1. constants')
}

{
  assert(
    crossedReadingLineForward(0.86, 0.67),
    'sparse forward 0.86→0.67 crosses',
  )
  assert(
    !crossedReadingLineBackward(0.86, 0.67),
    '0.86→0.67 is not backward',
  )
  assert(
    crossedReadingLineBackward(0.6, 0.88),
    'sparse backward 0.60→0.88 crosses',
  )
  assert(!crossedReadingLineForward(0.6, 0.88), '0.60→0.88 is not forward')
  console.log('PASS  2. crossing primitives')
}

{
  const { sample, plays } = run([0.95, 0.86, 0.8, 0.76, 0.73, 0.65])
  assert(plays.length === 1, 'normal forward: exactly 1 play')
  assert(plays[0] === 0.73, 'play on sample that crossed 0.75')
  assert(sample.phase === 'settled', 'settled after play')
  assert(sample.playCount === 1, 'playCount 1')
  console.log('PASS  3. forward reading-line crossing')
}

{
  let sample = createFeatureDemoSample('rest')
  for (const r of [0.9, 0.7]) {
    const n = stepFeatureDemo(sample, r)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === 1 && sample.phase === 'settled', 'pre-settled')

  const before = sample.playCount
  for (const r of [0.6, 0.7, 0.76, 0.85, 0.95]) {
    const n = stepFeatureDemo(sample, r)
    assert(!n.played, `backward sample ${r} must not play`)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === before, 'play count unchanged on backward')
  assert(sample.phase === 'rest', 'reset after safely below')
  console.log('PASS  4. backward crossing does not play')
}

{
  const { sample, plays } = run([0.88, 0.68])
  assert(plays.length === 1, 'skipped-band forward still plays')
  assert(sample.playCount === 1, 'playCount after skip')
  /* Must not require a sample inside 0.72–0.78 */
  assert(!plays.includes(0.75), 'no exact mid-band sample required')
  console.log('PASS  5. skipped-band forward crossing')
}

{
  const { plays } = run([0.91, 0.64])
  assert(plays.length === 1, 'momentum sparse forward plays once')
  console.log('PASS  6. momentum / sparse samples')
}

{
  let sample = createFeatureDemoSample('rest')
  /* pass 1 */
  for (const r of [0.9, 0.7]) {
    const n = stepFeatureDemo(sample, r)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === 1, 'pass1')
  /* backward reset */
  for (const r of [0.8, 0.96]) {
    const n = stepFeatureDemo(sample, r)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.phase === 'rest', 'reset for pass2')
  /* pass 2 */
  for (const r of [0.9, 0.7]) {
    const n = stepFeatureDemo(sample, r)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === 2, 'pass2')
  /* reset + pass 3 */
  for (const r of [0.85, 0.97, 0.9, 0.7]) {
    const n = stepFeatureDemo(sample, r)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === 3, 'pass3 replay')
  console.log('PASS  7. replay after backward reset')
}

{
  let sample = createFeatureDemoSample('rest')
  for (const r of [0.9, 0.7]) {
    const n = stepFeatureDemo(sample, r)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === 1, 'played once')
  for (const r of [0.73, 0.76, 0.74, 0.77, 0.72]) {
    const n = stepFeatureDemo(sample, r)
    assert(!n.played, `wiggle ${r} no play`)
    sample = { phase: n.phase, prevRatio: n.prevRatio, playCount: n.playCount }
  }
  assert(sample.playCount === 1, 'wiggle playCount stays 1')
  assert(sample.phase !== 'rest', 'not fully reset by wiggle')
  console.log('PASS  8. no wiggle replay')
}

{
  assert(
    shouldIgnoreFeatureDemoSample({
      prevY: 600,
      currY: 601,
      prevH: 844,
      currH: 860,
    }),
    'toolbar height noise ignored',
  )
  assert(
    !shouldIgnoreFeatureDemoSample({
      prevY: 700,
      currY: 580,
      prevH: 844,
      currH: 844,
    }),
    'real scroll not ignored',
  )
  console.log('PASS  9. toolbar / noise filter')
}

{
  assert(featureDemoDataAttr('rest') === 'rest', 'rest attr')
  assert(featureDemoDataAttr('settled') === 'done', 'settled→done')
  assert(featureDemoDataAttr('reset_armed') === 'done', 'armed keeps done look')
  console.log('PASS  10. CSS attr mapping')
}

{
  const features = read(
    'src/features/landing-v2/features-grid/LandingV2FeaturesGrid.tsx',
  )
  const hook = read(
    'src/features/landing-v2/features-grid/useMobileFeatureDemo.ts',
  )
  const geom = read(
    'src/features/landing-v2/features-grid/mobileFeatureDemoGeometry.ts',
  )
  assertIncludes(features, 'useMobileFeatureDemo', 'shared hook')
  assertIncludes(features, 'data-feature-demo-anchor', 'illustration anchor')
  assertIncludes(hook, 'FEATURE_DEMO_COARSE_ROOT_MARGIN', 'coarse corridor')
  assertIncludes(hook, 'stepFeatureDemo', 'crossing machine')
  assertIncludes(hook, 'boundingClientRect', 'IO geometry')
  assertIncludes(hook, 'rootBounds', 'IO rootBounds')
  assertIncludes(hook, 'landingLayoutViewportSize', 'stable viewport fallback')
  assertNotIncludes(hook, "addEventListener('scroll'", 'no scroll listener')
  assertNotIncludes(hook, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(hook, 'useScroll(', 'no Framer useScroll')
  assertNotIncludes(hook, 'visualViewport.', 'no visualViewport API')
  assertNotIncludes(hook, 'innerHeight', 'no window.innerHeight reading line')
  assertNotIncludes(hook, "-72% 0px -22% 0px", 'narrow 6% band removed')
  assertNotIncludes(geom, 'FEATURE_DEMO_ACTIVATE_MIN', 'occupancy band removed')
  assertIncludes(geom, 'crossedReadingLineForward', 'forward semantic')
  assertIncludes(geom, 'crossedReadingLineBackward', 'backward semantic')
  assertNotIncludes(features, 'ratio >= 0.55', 'old ratio gone')
  console.log('PASS  11. wiring / perf / architecture swap')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration',
  )
  console.log('PASS  12. registration')
}

console.log('\nPASS  landing mobile features reading-line directional (3E.2)\n')
