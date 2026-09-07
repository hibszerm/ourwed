/**
 * Landing V2 — mobile performance Iteration 3C.1
 * Sequence bugfix: Statement 1 timing + all 7 statements reachable.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COMPACT_NARRATIVE_OPENING_OPACITY,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  COMPACT_NARRATIVE_STATEMENTS,
  activeStatementIndicesAtScroll,
  collisionInvariantHolds,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  incomingMotionRatio,
  maxStatementOpacityAtScroll,
  primaryStatementAtScroll,
  statementVisualAtScroll,
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

const progress = read(
  'src/features/landing-v2/sections/compactProblemNarrativeProgress.ts',
)
const narrative = read(
  'src/features/landing-v2/sections/CompactProblemNarrative.tsx',
)
const copy = read('src/features/landing-v2/sections/problemStoryCopy.ts')
const register = read('src/features/auth/components/RegisterForm.tsx')

console.log('\n=== landing mobile performance iteration 3C.1 (sequence bugfix) ===\n')

{
  assert(COMPACT_NARRATIVE_STATEMENT_COUNT === 7, 'seven statements')
  assert(COMPACT_NARRATIVE_STATEMENTS[0]!.id === '01', 'stmt0 id')
  assertIncludes(copy, "'Jedno zlecenie.'", 'stmt0 copy')
  assertIncludes(copy, "'Umowa w plikach.'", 'stmt1 copy')
  assertIncludes(copy, "'Płatności w Excelu.'", 'stmt2 copy')
  assertIncludes(copy, "'Zero chaosu.'", 'stmt6 copy')
  assertIncludes(
    progress,
    'out.slice(0, 2), permanently locking',
    'documents 3C.1 root cause',
  )
  assertIncludes(
    narrative,
    'Paint from visual.active directly',
    'DOM paint not gated on capped index set',
  )
  console.log('PASS  1. source array + root-cause documentation')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const open = statementVisualAtScroll(0, 0, g)
  assert(
    open.opacity >= 0.85,
    `Statement 1 at scrub=0 opacity ${open.opacity} < 0.85`,
  )
  assert(open.opacity >= COMPACT_NARRATIVE_OPENING_OPACITY - 1e-6, 'opening floor')
  assert(Math.abs(open.y) <= 12, 'Statement 1 near reading zone at start')
  const settled = statementVisualAtScroll(g.introPx, 0, g)
  assert(settled.opacity >= 0.999, 'Statement 1 settled by intro end')
  assert(settled.y === 0, 'Statement 1 y=0 after intro')
  console.log('PASS  2. Statement 1 immediate timing')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const slots = compactNarrativeSlotOffsets(g)
  const reached = new Set<number>()
  for (let s = 0; s <= slots.scrubBudget; s += 8) {
    const p = primaryStatementAtScroll(s, g)
    if (p != null) reached.add(p)
  }
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    assert(reached.has(i), `statement ${i} never becomes primary readable`)
  }
  console.log('PASS  3. all statements 0–6 reachable as primary')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const slots = compactNarrativeSlotOffsets(g)
  /* Before final release (scrub range): never empty */
  for (let s = 0; s <= slots.scrubBudget; s += 6) {
    const maxOp = maxStatementOpacityAtScroll(s, g)
    assert(
      maxOp >= 0.15,
      `empty narrative frame at scrub=${s} maxOp=${maxOp}`,
    )
  }
  console.log('PASS  4. no empty narrative frame before cover')
}

{
  const g = compactNarrativeGeometry(874, 68)
  const slots = compactNarrativeSlotOffsets(g)
  const order: number[] = []
  let last: number | null = null
  for (let s = 0; s <= slots.scrubBudget; s += 4) {
    const p = primaryStatementAtScroll(s, g)
    if (p != null && p !== last) {
      order.push(p)
      last = p
    }
  }
  assert(
    JSON.stringify(order) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
    `forward order ${JSON.stringify(order)}`,
  )

  const reverse: number[] = []
  last = null
  for (let s = slots.scrubBudget; s >= 0; s -= 4) {
    const p = primaryStatementAtScroll(s, g)
    if (p != null && p !== last) {
      reverse.push(p)
      last = p
    }
  }
  assert(
    JSON.stringify(reverse) === JSON.stringify([6, 5, 4, 3, 2, 1, 0]),
    `reverse order ${JSON.stringify(reverse)}`,
  )
  console.log('PASS  5. statement order forward + reverse')
}

{
  const g = compactNarrativeGeometry(874, 68)
  /* Active set must advance past [0,1] */
  const slots = compactNarrativeSlotOffsets(g)
  const mid2 = Math.floor((slots.arriveStart[2]! + slots.arriveEnd[2]!) / 2)
  const act2 = activeStatementIndicesAtScroll(mid2, g)
  assert(act2.includes(2), `active at stmt2 travel must include 2, got ${act2}`)
  assert(!act2.includes(0) || act2.length <= 2, 'max 2 active')
  assert(act2.length <= 2, `active count ${act2.length}`)

  const mid5 = Math.floor((slots.arriveStart[5]! + slots.arriveEnd[5]!) / 2)
  const act5 = activeStatementIndicesAtScroll(mid5, g)
  assert(act5.includes(5), `active at stmt5 must include 5, got ${act5}`)
  assert(act5.length <= 2, 'max 2 at stmt5')

  /* Pixel coupling preserved for stmt2 (owner reference) and later */
  for (const i of [1, 2, 3, 4, 5, 6]) {
    const start = slots.arriveStart[i]!
    const a = statementVisualAtScroll(start, i, g)
    const b = statementVisualAtScroll(start + 100, i, g)
    const ratio = (a.y - b.y) / 100
    assert(ratio >= 0.95 && ratio <= 1.05, `stmt ${i} ratio ${ratio}`)
  }
  assert(incomingMotionRatio(g, 100) >= 0.95, 'incomingMotionRatio')

  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const c = collisionInvariantHolds(g, i)
    assert(c.ok, `collision ${i}: op=${c.outgoingOpacity}`)
  }
  console.log('PASS  6. active advance + pixel coupling + collision preserved')
}

{
  assertIncludes(
    register,
    'const REGISTRATION_ENABLED = false',
    'registration lock',
  )
  console.log('PASS  7. registration lock')
}

console.log('\nPASS  landing mobile performance iteration 3C.1\n')
