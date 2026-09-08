/**
 * Landing V2 — Iteration 3E.1 feature reading-zone + replay hysteresis.
 */

import {
  FEATURE_DEMO_ACTIVATE_MAX,
  FEATURE_DEMO_ACTIVATE_MIN,
  FEATURE_DEMO_ACTIVATION_RATIO,
  FEATURE_DEMO_RESET_ABOVE,
  FEATURE_DEMO_RESET_BELOW,
  featureDemoDataAttr,
  isFeatureDemoActivationBand,
  isFeatureDemoResetZone,
  nextMobileFeatureDemoPhase,
  type MobileFeatureDemoPhase,
} from '@/features/landing-v2/features-grid/mobileFeatureDemoGeometry'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const VH = 844

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

function yAt(ratio: number) {
  return ratio * VH
}

console.log('\n=== landing mobile features reading-zone replay (3E.1) ===\n')

{
  assert(FEATURE_DEMO_ACTIVATION_RATIO === 0.75, 'nominal 0.75')
  assert(FEATURE_DEMO_ACTIVATE_MIN === 0.72, 'band min')
  assert(FEATURE_DEMO_ACTIVATE_MAX === 0.78, 'band max')
  assert(FEATURE_DEMO_RESET_ABOVE === 0.22, 'reset above')
  assert(FEATURE_DEMO_RESET_BELOW === 1.1, 'reset below')
  console.log('PASS  1. geometry constants')
}

{
  /* Bottom-edge entry must NOT activate */
  assert(
    !isFeatureDemoActivationBand(yAt(0.95), VH),
    'no activate near bottom 95%',
  )
  assert(
    !isFeatureDemoActivationBand(yAt(0.9), VH),
    'no activate at 90%',
  )
  assert(nextMobileFeatureDemoPhase('rest', yAt(0.95), VH) === 'rest', 'rest at 95%')
  assert(nextMobileFeatureDemoPhase('rest', yAt(1.0), VH) === 'rest', 'rest at 100%')
  console.log('PASS  2. no early bottom trigger')
}

{
  assert(isFeatureDemoActivationBand(yAt(0.75), VH), 'activate at 75%')
  assert(isFeatureDemoActivationBand(yAt(0.72), VH), 'activate at 72%')
  assert(isFeatureDemoActivationBand(yAt(0.78), VH), 'activate at 78%')
  assert(
    nextMobileFeatureDemoPhase('rest', yAt(0.75), VH) === 'active',
    'rest→active at reading zone',
  )
  console.log('PASS  3. reading-zone activation')
}

{
  let phase: MobileFeatureDemoPhase = 'rest'
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.75), VH)
  assert(phase === 'active', 'forward activate')
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.6), VH)
  assert(phase === 'settled', 'forward settle nearby')
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.1), VH)
  assert(phase === 'rest', 'reset far above')
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.75), VH)
  assert(phase === 'active', 'replay after reset above')
  console.log('PASS  4. forward replay')
}

{
  let phase: MobileFeatureDemoPhase = 'rest'
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.75), VH) // active
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.55), VH) // settled
  assert(phase === 'settled', 'settled mid')
  phase = nextMobileFeatureDemoPhase(phase, yAt(1.2), VH)
  assert(phase === 'rest', 'reset far below')
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.75), VH)
  assert(phase === 'active', 'replay approaching from below/above into band')
  console.log('PASS  5. reverse / below reset replay')
}

{
  let phase: MobileFeatureDemoPhase = 'rest'
  let activations = 0
  const apply = (ratio: number) => {
    const next = nextMobileFeatureDemoPhase(phase, yAt(ratio), VH)
    if (phase === 'rest' && next === 'active') activations += 1
    phase = next === 'active' ? 'settled' : next
  }
  apply(0.75)
  assert(activations === 1, 'first activation')
  apply(0.75 - 10 / VH)
  apply(0.75 + 10 / VH)
  apply(0.75 - 5 / VH)
  apply(0.75 + 8 / VH)
  assert(activations === 1, 'no thrash around band')
  assert(phase === 'settled', 'still settled')
  console.log('PASS  6. threshold thrash')
}

{
  let phase: MobileFeatureDemoPhase = nextMobileFeatureDemoPhase(
    'rest',
    yAt(0.75),
    VH,
  )
  phase = nextMobileFeatureDemoPhase(phase, yAt(0.5), VH)
  assert(phase === 'settled', 'central screen stays settled')
  assert(!isFeatureDemoResetZone(yAt(0.5), VH), '0.5 not reset')
  assert(isFeatureDemoResetZone(yAt(0.15), VH), '0.15 is reset')
  assert(isFeatureDemoResetZone(yAt(1.15), VH), '1.15 is reset')
  console.log('PASS  7. reset offscreen only')
}

{
  assert(featureDemoDataAttr('rest') === 'rest', 'attr rest')
  assert(featureDemoDataAttr('active') === 'done', 'attr active→done')
  assert(featureDemoDataAttr('settled') === 'done', 'attr settled→done')
  console.log('PASS  8. CSS data attr mapping')
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
  assertIncludes(features, 'useMobileFeatureDemo', 'shared hook wired')
  assertIncludes(features, 'data-feature-demo-anchor', 'illustration anchor')
  assertIncludes(hook, 'landingLayoutViewportSize', 'stable viewport')
  assertNotIncludes(hook, "addEventListener('scroll'", 'no scroll listener')
  assertNotIncludes(hook, 'requestAnimationFrame', 'no rAF')
  assertNotIncludes(hook, 'useScroll(', 'no Framer useScroll')
  assertNotIncludes(hook, 'visualViewport', 'no visualViewport')
  assertIncludes(hook, "rootMargin: '-72% 0px -22% 0px'", 'activation band IO')
  assertIncludes(hook, "rootMargin: '-22% 0px 10% 0px'", 'presence / reset IO')
  assertIncludes(geom, 'FEATURE_DEMO_ACTIVATION_RATIO = 0.75', '75% nominal')
  assertNotIncludes(features, 'ratio >= 0.55', 'old ratio trigger removed')
  assertNotIncludes(features, 'demonstratedRef', 'one-shot latch removed')
  console.log('PASS  9. wiring / perf contract')
}

{
  const register = read('src/features/auth/components/RegisterForm.tsx')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration',
  )
  console.log('PASS  10. registration')
}

console.log('\nPASS  landing mobile features reading-zone replay (3E.1)\n')
