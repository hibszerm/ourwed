/**
 * S0 — Semantic regression harness acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/regression/semanticRegressionAcceptance.test.ts
 */

import { SEMANTIC_REGRESSION_CASES } from './semanticRegressionCases'
import { INTERPRETER_REPLAY_CORPUS } from './interpreterReplayCorpus'
import { runSemanticRegressionSuite } from './semanticRegressionHarness'
import { formatSemanticDiff } from './semanticDiff'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

console.log('S0 Semantic regression harness')

// Diff helper smoke
{
  const msg = formatSemanticDiff(
    'smoke',
    { source: 'wedding', operation: 'list', dateFrom: '2026-08-01' },
    { source: 'wedding', operation: 'list', dateFrom: '2026-09-01' },
  )
  assert(msg.includes('CASE: smoke'), 'diff case')
  assert(msg.includes('EXPECTED:'), 'diff expected')
  assert(msg.includes('ACTUAL:'), 'diff actual')
  assert(msg.includes('dateFrom'), 'diff slot')
  console.log('  OK semantic diff helper')
}

// Interpreter corpus defined (not executed live)
{
  assert(INTERPRETER_REPLAY_CORPUS.length >= 8, 'replay corpus size')
  const families = new Set(INTERPRETER_REPLAY_CORPUS.map((e) => e.family))
  assert(families.has('explicit_money_query'), 'family money')
  assert(families.has('temporal_follow_up'), 'family temporal')
  assert(families.has('list_projection_follow_up'), 'family list')
  assert(families.has('ambiguous_measure'), 'family amb')
  console.log('  OK interpreter replay corpus defined (no live LLM)')
}

const suite = runSemanticRegressionSuite(SEMANTIC_REGRESSION_CASES)

const byStatus = {
  PASS_CURRENT: SEMANTIC_REGRESSION_CASES.filter((c) => c.status === 'PASS_CURRENT')
    .length,
  KNOWN_GAP: SEMANTIC_REGRESSION_CASES.filter((c) => c.status === 'KNOWN_GAP')
    .length,
  FUTURE_CAPABILITY: SEMANTIC_REGRESSION_CASES.filter(
    (c) => c.status === 'FUTURE_CAPABILITY',
  ).length,
}

console.log(
  `  cases: ${SEMANTIC_REGRESSION_CASES.length} (PASS_CURRENT=${byStatus.PASS_CURRENT}, KNOWN_GAP=${byStatus.KNOWN_GAP}, FUTURE=${byStatus.FUTURE_CAPABILITY})`,
)
console.log(
  `  run: passed=${suite.passed} failed=${suite.failed} skipped=${suite.skipped}`,
)

for (const r of suite.results) {
  const tag =
    r.result === 'pass' ? 'PASS' : r.result === 'skip' ? 'SKIP' : 'FAIL'
  const gap =
    r.status === 'KNOWN_GAP'
      ? ' [KNOWN_GAP]'
      : r.status === 'FUTURE_CAPABILITY'
        ? ' [FUTURE]'
        : ''
  console.log(`  ${tag}${gap} ${r.id} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}

assert(suite.failed === 0, `${suite.failed} failed cases`)

// Core ids 1–20 present
for (let i = 1; i <= 20; i++) {
  assert(
    SEMANTIC_REGRESSION_CASES.some((c) => c.id === String(i)),
    `missing core case ${i}`,
  )
}

console.log('S0 Semantic regression harness: ALL PASSED')
