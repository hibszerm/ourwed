/**
 * V6-F1.3 — Turn controller unit acceptance (no live Luna).
 */

import assert from 'node:assert/strict'
import {
  assessRequestedOperationsCapability,
  parseRequestedOperations,
} from '../agent/requestedOperations'
import {
  V6_MAX_MODEL_DECISIONS,
  createV6TurnController,
  decideToolExecution,
  fingerprintToolCall,
  markRepairUsed,
  markToolExecuted,
  noteModelDecision,
  noteRequestedOps,
} from '../agent/turnController'
import { parseV6NativeChatMessage } from '../agent/parseNativeStep'
import { V6_NATIVE_OPENAI_TOOLS } from '../agent/nativeTools'

assert.equal(V6_NATIVE_OPENAI_TOOLS.length, 4)
assert.ok(
  !V6_NATIVE_OPENAI_TOOLS.some(
    (t) =>
      (t as { function?: { name?: string } }).function?.name === 'complete_turn',
  ),
)
console.log('  OK complete_turn removed; 4 domain tools')

assert.equal(V6_MAX_MODEL_DECISIONS, 4)
console.log('  OK round budget = 4 model decisions')

const ops = parseRequestedOperations({
  needs_collection_search: false,
  needs_refinement: false,
  needs_sort: false,
  needs_slice: false,
  needs_exclude: false,
  needs_aggregate: 'none',
  needs_group: true,
  needs_rank: false,
  needs_comparison: false,
  needs_restore: false,
})
assert.equal(ops.ok, true)
if (ops.ok) {
  const cap = assessRequestedOperationsCapability(ops.value)
  assert.equal(cap.supported, false)
}
console.log('  OK group → unsupported capability')

const c = createV6TurnController()
noteModelDecision(c)
const fp = fingerprintToolCall(
  'aggregate_collection',
  { collection: 'col_1', aggregation: 'count', measure: null },
  'col_1',
)
assert.equal(decideToolExecution(c, fp).action, 'EXECUTE_TOOL')
markToolExecuted(c, fp, 'aggregate_collection')
const again = decideToolExecution(c, fp)
assert.equal(again.action, 'BLOCK_DUPLICATE')
if (again.action === 'BLOCK_DUPLICATE') assert.equal(again.allowRepair, true)
markRepairUsed(c)
const again2 = decideToolExecution(c, fp)
assert.equal(again2.action, 'BLOCK_DUPLICATE')
if (again2.action === 'BLOCK_DUPLICATE') assert.equal(again2.allowRepair, false)
console.log('  OK loop detection + one repair')

const c2 = createV6TurnController()
const blocked = noteRequestedOps(c2, {
  needsCollectionSearch: false,
  needsRefinement: false,
  needsSort: false,
  needsSlice: false,
  needsExclude: false,
  needsAggregate: 'none',
  needsGroup: false,
  needsRank: true,
  needsComparison: false,
  needsRestore: false,
})
assert.equal(blocked.action, 'UNSUPPORTED')
console.log('  OK rank → controller UNSUPPORTED')

const prose = parseV6NativeChatMessage(
  { content: 'Nie umiem tego policzyć.', tool_calls: null },
  { allowPlainTextFinal: false },
)
assert.equal(prose.ok, false)
console.log('  OK zero-evidence prose rejected')

const structured = parseV6NativeChatMessage(
  {
    content: JSON.stringify({
      status: 'unsupported',
      text: null,
      slot: null,
      reason: 'group_analytics_not_supported',
      candidates: null,
    }),
    tool_calls: null,
  },
  { allowPlainTextFinal: false },
)
assert.equal(structured.ok, true)
if (structured.ok) assert.equal(structured.response.status, 'unsupported')
console.log('  OK structured unsupported accepted')

console.log('v6TurnControllerAcceptance PASS')
