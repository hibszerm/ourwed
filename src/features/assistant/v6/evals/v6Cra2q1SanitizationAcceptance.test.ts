/**
 * V6-CRA2Q1 — User-visible error sanitization boundary.
 */

import assert from 'node:assert/strict'
import { ASSISTANT_PLAN_BLOCKED, ASSISTANT_UNSUPPORTED } from '../../copy'
import { decideV6Authority } from '../authority/decide'
import type { V6ShadowTurnResult } from '../agent/loop'
import {
  renderV6TurnResult,
  sanitizeUserFacingReason,
} from '../render/renderV6TurnResult'

function check(cond: unknown, msg: string): asserts cond {
  assert.ok(cond, msg)
}

const INTERNAL = [
  'search.conceptFilters[0]:eq',
  'NOT_FAITHFUL: missing prior collection handle',
  'unsupported_concept_cmp:CONTACT.BRIDE_NAME',
  'LIST_RELATED relation missing',
  'steps[0].search.concept_filters: Invalid',
  'TurnPlan schema path ops[1].predicate',
  'FAITHFUL but capability gate failed',
  'collectionHandle col_abc',
  'adapterId contact.bride_name',
  'writes_not_enabled_in_f1',
  'a0000000-0000-4000-8000-000000000001',
]

for (const raw of INTERNAL) {
  check(
    sanitizeUserFacingReason(raw) === null,
    `S: must sanitize ${JSON.stringify(raw)}`,
  )
}

const PRODUCT = [
  'Zapisy są obecnie wyłączone.',
  'Oznaczenie zadatku jako opłaconego jest operacją zapisu/mutacji, a zapisy są wyłączone.',
  'Nie mam uzupełnionego numeru telefonu dla tej osoby.',
]
for (const raw of PRODUCT) {
  check(
    sanitizeUserFacingReason(raw) === raw,
    `S: must keep product copy ${JSON.stringify(raw)}`,
  )
}

function unsupportedResult(reason: string | null): V6ShadowTurnResult {
  return {
    turnId: 't1',
    rounds: 1,
    response: { status: 'unsupported', reason },
    toolTrace: [],
    authority: decideV6Authority({}),
    errorCode: 'CAPABILITY_UNSUPPORTED',
    verificationBlockReason: reason ?? undefined,
  }
}

// S1
{
  const rendered = renderV6TurnResult(
    unsupportedResult('search.conceptFilters[0]:eq'),
  )
  check(rendered.kind === 'unsupported', 'S1 kind')
  check(
    rendered.kind === 'unsupported' &&
      !/conceptFilters|:eq/.test(rendered.message),
    'S1 no internal leak',
  )
  check(
    rendered.kind === 'unsupported' &&
      (rendered.message === ASSISTANT_UNSUPPORTED ||
        rendered.message === ASSISTANT_PLAN_BLOCKED),
    'S1 safe fallback',
  )
}

// S2
{
  const rendered = renderV6TurnResult(
    unsupportedResult('NOT_FAITHFUL: Use the previously referenced collection'),
  )
  check(rendered.kind === 'unsupported', 'S2 kind')
  check(
    rendered.kind === 'unsupported' &&
      !/NOT_FAITHFUL|previously referenced/i.test(rendered.message),
    'S2 no verifier prose',
  )
}

// S3–S5
for (const [id, reason] of [
  ['S3', 'invalid ConceptKey FOO.BAR'],
  ['S4', 'LIST_RELATED relation missing'],
  ['S5', 'steps[0].inspect_concepts: Required'],
] as const) {
  const rendered = renderV6TurnResult(unsupportedResult(reason))
  check(rendered.kind === 'unsupported', `${id} kind`)
  check(
    rendered.kind === 'unsupported' &&
      !/ConceptKey|LIST_RELATED|inspect_concepts|steps\[/i.test(
        rendered.message,
      ),
    `${id} sanitized`,
  )
}

{
  const rendered = renderV6TurnResult(unsupportedResult(null))
  check(
    rendered.kind === 'unsupported' &&
      rendered.message === ASSISTANT_UNSUPPORTED,
    'null reason → ASSISTANT_UNSUPPORTED',
  )
}

{
  const rendered = renderV6TurnResult(
    unsupportedResult(
      'Oznaczenie zadatku jako opłaconego jest operacją zapisu/mutacji, a zapisy są wyłączone.',
    ),
  )
  check(
    rendered.kind === 'unsupported' &&
      rendered.message.includes('zapisy są wyłączone'),
    'write-disabled product copy preserved',
  )
}

console.log('v6Cra2q1SanitizationAcceptance PASS')
