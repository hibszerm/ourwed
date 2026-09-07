/**
 * Landing V2 — mobile performance Iteration 3B
 * Compact Problem: stacked statement narrative (Founder-style linear scroll).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  activeStatementIndices,
  compactNarrativeHandoffT,
  statementVisualAt,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'

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
const narrativeCss = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.module.css',
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
const founder = read(
  'src/features/landing-v2/mobile-story/FounderStoryContent.tsx',
)
const founderCss = read(
  'src/features/landing-v2/mobile-story/FounderStoryReveal.module.css',
)
const hero = read('src/features/landing-v2/sections/LandingV2Hero.tsx')
const register = read('src/features/auth/components/RegisterForm.tsx')
const copy = read('src/features/landing-v2/sections/problemStoryCopy.ts')

console.log('\n=== landing mobile performance iteration 3B (black narrative) ===\n')

{
  assertIncludes(problem, 'CompactProblemNarrative', 'compact early return')
  assertIncludes(
    problem,
    'if (isCompactViewport) {\n    return <CompactProblemNarrative />',
    'compact stacked path',
  )
  assertIncludes(problem, 'LandingV2ProblemStoryDesktop', 'desktop theater kept')
  assertIncludes(narrative, 'data-problem-compact-narrative', 'narrative marker')
  assertIncludes(narrative, 'stacked-narrative', 'theater attr')
  assertIncludes(narrative, 'data-narrative-black="stable"', 'stable black attr')
  assertIncludes(narrativeCss, 'background: var(--lv2-problem-black)', 'stable black background')
  console.log('PASS  1. compact Problem uses stacked narrative path')
}

{
  assertIncludes(progress, 'statementVisualAt', 'scroll progress → visual')
  assertIncludes(progress, 'compactNarrativeHandoffT', 'linear Product handoff')
  assertNotIncludes(progress, 'easeOutCubic', 'no easeOutCubic acceleration on narrative')
  assertNotIncludes(progress, 'setTimeout', 'no timers in progress SoT')
  assertNotIncludes(narrative, 'setTimeout', 'no timers in narrative UI')
  assertNotIncludes(narrative, 'setInterval', 'no intervals')
  assertIncludes(narrative, 'stickyTrackProgress', 'Founder-like sticky progress')
  assertIncludes(narrative, 'style={{ opacity, y }}', 'translateY + opacity only')
  assertNotIncludes(narrative, 'filter:', 'no filter binding on statements')
  assertNotIncludes(narrative, 'blur(', 'no blur on statements')
  assertNotIncludes(narrative, 'scale:', 'no scale on statements')
  console.log('PASS  2. linear scroll + translateY/opacity only')
}

{
  assertIncludes(copy, "'Jedno miejsce.'", 'final statement line 1')
  assertIncludes(copy, "'Cały sezon.'", 'final statement line 2')
  assertIncludes(copy, "'Zero chaosu.'", 'final statement line 3')
  assert(COMPACT_NARRATIVE_STATEMENT_COUNT === 7, 'seven problem statements')

  const first = statementVisualAt(0.02, 0)
  assert(first.yUnit <= 0.14 + 1e-6, 'first statement near reading position')
  assert(first.opacity > 0 && first.opacity < 1, 'first gently appears')

  const secondTravel = statementVisualAt(0.14, 1)
  assert(secondTravel.yUnit > 0.2, 'second enters from below')

  const midHandoff = statementVisualAt(0.2, 0)
  const midIncoming = statementVisualAt(0.2, 1)
  assert(midHandoff.opacity < 1 || midIncoming.yUnit < 1, 'overlap window exists')

  for (const p of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1]) {
    const active = activeStatementIndices(p)
    assert(active.length <= 2, `max 2 active at p=${p}, got ${active.length}`)
  }

  assert(compactNarrativeHandoffT(0.5) === 0, 'handoff idle mid-narrative')
  assert(compactNarrativeHandoffT(1) === 1, 'handoff complete at end')
  console.log('PASS  3. statement stack semantics + layer budget')
}

{
  assertIncludes(
    read('src/features/landing-v2/mobile-story/founderStoryClaims.ts'),
    'Z BRANŻY',
    'Founder reference copy present',
  )
  assertIncludes(founderCss, 'margin-top: calc(-100svh)', 'Founder 1:1 cover structure')
  assertIncludes(founder, 'whileInView', 'Founder calm reveal primitive present')
  assertIncludes(progress, 'Linear Product handoff', 'documents linear finger coupling')
  assertIncludes(narrativeCss, '--lv2-narrative-svh: 300', 'intentional runway')
  console.log('PASS  4. Founder motion reference retained')
}

{
  assertIncludes(product, 'CompactProductReveal', 'product compact path')
  assertIncludes(compactProduct, 'FlattenedProductAutoplay', 'autoplay tablet kept')
  assertNotIncludes(compactProduct, 'deviceScaleFromHandoff', 'no camera entrance')
  assertIncludes(hero, 'FlattenedHeroTabletContent', 'hero intact')
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  5. product/hero/registration regressions guarded')
}

console.log('\nPASS  landing mobile performance iteration 3B\n')
