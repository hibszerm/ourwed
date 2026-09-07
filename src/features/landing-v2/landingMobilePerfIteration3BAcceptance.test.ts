/**
 * Landing V2 — mobile performance Iteration 3B (superseded by 3C)
 * Guards: compact narrative path + copy + regressions remain.
 * Pixel-coupling / collision / document cover live in 3C suite.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPACT_NARRATIVE_STATEMENT_COUNT } from '@/features/landing-v2/sections/compactProblemNarrativeProgress'

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

const problem = read('src/features/landing-v2/sections/LandingV2ProblemStory.tsx')
const narrative = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.tsx',
)
const progress = read(
  'src/features/landing-v2/sections/compactProblemNarrativeProgress.ts',
)
const product = read(
  'src/features/landing-v2/product-story/LandingV2ProductStory.tsx',
)
const compactProduct = read(
  'src/features/landing-v2/product-story/CompactProductReveal.tsx',
)
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const register = read('src/features/auth/components/RegisterForm.tsx')
const copy = read('src/features/landing-v2/sections/problemStoryCopy.ts')

console.log('\n=== landing mobile performance iteration 3B (superseded → 3C) ===\n')

{
  assertIncludes(problem, 'CompactProblemNarrative', 'compact early return')
  assertIncludes(problem, 'LandingV2ProblemStoryDesktop', 'desktop theater kept')
  assertIncludes(narrative, 'data-problem-compact-narrative', 'narrative marker')
  assertIncludes(narrative, 'pixel-coupled', '3C pixel-coupled theater')
  assertIncludes(progress, 'ratio ≈ 3.80 (FAILED)', '3B failure documented')
  console.log('PASS  1. compact Problem narrative path retained (3C geometry)')
}

{
  assertIncludes(copy, "'Jedno miejsce.'", 'final statement line 1')
  assertIncludes(copy, "'Cały sezon.'", 'final statement line 2')
  assertIncludes(copy, "'Zero chaosu.'", 'final statement line 3')
  assert(COMPACT_NARRATIVE_STATEMENT_COUNT === 7, 'seven problem statements')
  assertNotIncludes(progress, 'easeOutCubic', 'no easeOutCubic on narrative')
  assertNotIncludes(narrative, 'setTimeout', 'no timers')
  console.log('PASS  2. copy + no timer/easeOut')
}

{
  assertIncludes(
    read('src/features/landing-v2/mobile-story/founderStoryClaims.ts'),
    'Z BRANŻY',
    'Founder reference copy present',
  )
  assertIncludes(product, 'CompactProductReveal', 'product compact path')
  assertIncludes(compactProduct, 'FlattenedProductAutoplay', 'autoplay tablet kept')
  assertNotIncludes(compactProduct, 'deviceScaleFromHandoff', 'no camera entrance')
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  3. Founder/product/hero/registration regressions')
}

console.log('\nPASS  landing mobile performance iteration 3B\n')
