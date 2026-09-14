/**
 * PC1 — authority router + mode fail-closed acceptance (shadow era).
 * IC1 unlocks ownership; this suite still proves shadow/off fail-closed paths.
 */

import assert from 'node:assert/strict'
import {
  decideAssistantAuthority,
} from './decideAuthority'
import { IC1_OWNERSHIP_UNLOCKED } from './types'
import {
  buildCapabilityMode,
  minAssistantV5Mode,
  modeAllowsV5Ownership,
  parseAssistantV5Mode,
  resolveEffectiveAssistantMode,
} from './resolveEffectiveMode'
import {
  renderDomainQueryObservation,
} from './renderDomainQueryObservation'
import type { DomainQueryObservation } from '../domainQuery/observations'
import type { DomainQuery } from '../domainQuery/domainQuery'

function baseQuery(partial: Partial<DomainQuery> = {}): DomainQuery {
  return {
    version: 1,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: null,
    aggregate: 'count',
    orderBy: [],
    limit: null,
    dateBinding: null,
    ...partial,
  }
}

console.log('PC1 authority foundation')

assert.equal(IC1_OWNERSHIP_UNLOCKED, true, 'IC1 ownership unlocked (successor)')

// --- Runtime mode parse / fail-closed ---
assert.equal(parseAssistantV5Mode('shadow'), 'shadow')
assert.equal(parseAssistantV5Mode('canary'), 'canary')
assert.equal(parseAssistantV5Mode('authority_read_query'), 'authority_read_query')
assert.equal(parseAssistantV5Mode('nope'), null)
assert.equal(parseAssistantV5Mode(1), null)

assert.equal(minAssistantV5Mode('shadow', 'authority_read_query'), 'shadow')
assert.equal(minAssistantV5Mode('off', 'shadow'), 'off')

assert.equal(
  resolveEffectiveAssistantMode({ runtimeMode: null }),
  'off',
  'missing runtime → off',
)
assert.equal(
  resolveEffectiveAssistantMode({ runtimeMode: undefined }),
  'off',
  'undefined runtime → off',
)

{
  const withShadowRuntime = resolveEffectiveAssistantMode({
    runtimeMode: 'shadow',
  })
  assert.ok(
    withShadowRuntime === 'off' || withShadowRuntime === 'shadow',
    'shadow runtime never exceeds build',
  )
  assert.equal(
    resolveEffectiveAssistantMode({ runtimeMode: 'authority_read_query' }),
    minAssistantV5Mode(buildCapabilityMode(), 'authority_read_query'),
  )
}

assert.equal(modeAllowsV5Ownership('shadow'), false)

// --- Router: OFF ---
{
  const d = decideAssistantAuthority({
    effectiveMode: 'off',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'valid',
  })
  assert.equal(d.kind, 'v3_fallback')
  assert.equal(d.visibleOwner, 'v3')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'MODE_NOT_AUTHORITATIVE')
  }
}

// --- Router: SHADOW + valid bound → eligible but V3 visible ---
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'valid',
    canaryEligible: true,
  })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v3')
  assert.equal(d.ownershipActive, false)
  assert.equal(d.eligibleForV5Authority, true)
}

// --- Router: CANARY without allowlist → V3 ---
{
  const d = decideAssistantAuthority({
    effectiveMode: 'canary',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'valid',
    canaryEligible: false,
  })
  assert.equal(d.visibleOwner, 'v3')
  assert.equal(d.ownershipActive, false)
  assert.equal(d.kind, 'v3_fallback')
}

// --- Families ---
for (const kind of ['unsupported', 'product_help', 'prepare_action', 'goal_plan'] as const) {
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: kind,
    interpreterStatus: kind === 'unsupported' ? 'unsupported' : 'ok',
    resolverOutcome: 'unsupported',
    domainQueryStatus: 'not_attempted',
  })
  assert.equal(d.kind, 'v3_fallback', kind)
  assert.equal(d.visibleOwner, 'v3', kind)
}

// --- Schema / provider ---
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: null,
    interpreterStatus: 'schema_error',
    resolverOutcome: 'interpret_error',
    domainQueryStatus: 'not_attempted',
  })
  assert.equal(d.kind, 'v3_fallback')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'INTERPRETER_SCHEMA_ERROR')
  }
}
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: null,
    interpreterStatus: 'provider_error',
    resolverOutcome: 'interpret_error',
    domainQueryStatus: 'not_attempted',
  })
  assert.equal(d.kind, 'v3_fallback')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'INTERPRETER_PROVIDER_ERROR')
  }
}

// --- Clarification (shadow) ---
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'needs_clarification',
    clarificationSlot: 'measure',
    domainQueryStatus: 'not_attempted',
    canaryEligible: true,
  })
  assert.equal(d.kind, 'v5_clarification')
  assert.equal(d.visibleOwner, 'v3')
  if (d.kind === 'v5_clarification') {
    assert.equal(d.clarificationSlot, 'measure')
    assert.equal(d.ownershipActive, false)
  }
}

// --- Safe error ---
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'valid',
    securityViolation: true,
  })
  assert.equal(d.kind, 'safe_error')
  if (d.kind === 'safe_error') {
    assert.equal(d.reason, 'SECURITY_BOUNDARY_VIOLATION')
  }
}
{
  const d = decideAssistantAuthority({
    effectiveMode: 'shadow',
    requestKind: 'prepare_action',
    interpreterStatus: 'ok',
    resolverOutcome: 'unsupported',
    domainQueryStatus: 'not_attempted',
    writeAttemptOnReadPath: true,
  })
  assert.equal(d.kind, 'safe_error')
  if (d.kind === 'safe_error') {
    assert.equal(d.reason, 'WRITE_ATTEMPT_ON_READ_PATH')
  }
}

console.log('  OK router + mode')

// --- Renderer ---
{
  const countObs: DomainQueryObservation = {
    kind: 'domain_query',
    query: baseQuery({ aggregate: 'count' }),
    aggregate: 'count',
    measure: null,
    totalCount: 8,
    returnedCount: 8,
    truncated: false,
    currency: 'PLN',
  }
  const r = renderDomainQueryObservation(countObs)
  assert.equal(r.kind, 'scalar')
  if (r.kind === 'scalar') assert.equal(r.value, 8)
}
for (const [measure, field] of [
  ['wedding.contract_value', 'contractValue'],
  ['wedding.paid_amount', 'paidAmount'],
  ['wedding.remaining_amount', 'remainingAmount'],
] as const) {
  const obs: DomainQueryObservation = {
    kind: 'domain_query',
    query: baseQuery({
      aggregate: 'sum',
      measure,
    }),
    aggregate: 'sum',
    measure,
    totalCount: 3,
    returnedCount: 3,
    truncated: false,
    amount: 12400,
    currency: 'PLN',
  }
  const r = renderDomainQueryObservation(obs)
  assert.equal(r.kind, 'money', measure)
  if (r.kind === 'money') {
    assert.equal(r.value, 12400)
    assert.equal(r.field, field)
  }
}
{
  const empty: DomainQueryObservation = {
    kind: 'domain_query',
    query: baseQuery({ aggregate: null, limit: 20 }),
    aggregate: 'list',
    measure: null,
    totalCount: 0,
    returnedCount: 0,
    truncated: false,
    currency: 'PLN',
    items: [],
  }
  const r = renderDomainQueryObservation(empty)
  assert.equal(r.kind, 'collection')
  if (r.kind === 'collection') {
    assert.equal(r.resultCount, 0)
    assert.equal(r.items.length, 0)
  }
}
{
  const list: DomainQueryObservation = {
    kind: 'domain_query',
    query: baseQuery({ aggregate: null, limit: 20 }),
    aggregate: 'list',
    measure: null,
    totalCount: 2,
    returnedCount: 2,
    truncated: false,
    currency: 'PLN',
    items: [
      {
        resource: { kind: 'wedding', id: 'w1' },
        displayName: 'A i B',
        date: '2027-01-01',
      },
      {
        resource: { kind: 'wedding', id: 'w2' },
        displayName: 'C i D',
        date: '2027-02-01',
      },
    ],
  }
  const r = renderDomainQueryObservation(list)
  assert.equal(r.kind, 'collection')
  if (r.kind === 'collection') {
    assert.equal(r.shownCount, 2)
    assert.equal(r.items[0]?.displayName, 'A i B')
  }
}

console.log('  OK renderer')
console.log('PC1 authority foundation: ALL PASSED')
