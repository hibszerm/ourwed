/**
 * IC1 — canary authority unlock + allowlist + slice acceptance.
 */

import assert from 'node:assert/strict'
import {
  decideAssistantAuthority,
} from './decideAuthority'
import { isIc1CanaryDomainQueryEligible } from './canarySlice'
import {
  IC1_OWNERSHIP_UNLOCKED,
  IC1_BUILD_MAX_MODE,
} from './types'
import {
  buildCapabilityMode,
  minAssistantV5Mode,
  modeAllowsV5Ownership,
  parseAssistantV5Mode,
  resolveEffectiveAssistantMode,
} from './resolveEffectiveMode'
import {
  fetchAssistantRuntimeConfig,
  __resetAssistantRuntimeModeCacheForTests,
  __setAssistantRuntimeModeCacheForTests,
} from './fetchRuntimeMode'
import {
  setCanaryEligibleFromRuntime,
  setEffectiveAssistantMode,
  isV5OwnershipPathEnabled,
  resetEffectiveAssistantModeForTests,
  getCanaryEligible,
} from './effectiveModeState'
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

console.log('IC1 canary authority')

assert.equal(IC1_OWNERSHIP_UNLOCKED, true, 'IC1 ownership unlocked')
assert.equal(IC1_BUILD_MAX_MODE, 'canary', 'IC1 build max canary')
assert.equal(modeAllowsV5Ownership('canary'), true)
assert.equal(modeAllowsV5Ownership('shadow'), false)
assert.equal(modeAllowsV5Ownership('off'), false)

// --- Slice eligibility ---
assert.equal(
  isIc1CanaryDomainQueryEligible(baseQuery({ aggregate: 'count' })),
  true,
  'count',
)
assert.equal(
  isIc1CanaryDomainQueryEligible(
    baseQuery({ aggregate: null, limit: 20 }),
  ),
  true,
  'list',
)
assert.equal(
  isIc1CanaryDomainQueryEligible(
    baseQuery({
      aggregate: 'sum',
      measure: 'wedding.contract_value',
    }),
  ),
  true,
  'sum cv',
)
assert.equal(
  isIc1CanaryDomainQueryEligible(
    baseQuery({ aggregate: 'sum', measure: 'wedding.paid_amount' }),
  ),
  true,
  'sum paid',
)
assert.equal(
  isIc1CanaryDomainQueryEligible(
    baseQuery({
      aggregate: 'sum',
      measure: 'wedding.remaining_amount',
    }),
  ),
  true,
  'sum remaining',
)
assert.equal(
  isIc1CanaryDomainQueryEligible(
    baseQuery({ aggregate: 'avg', measure: 'wedding.contract_value' }),
  ),
  false,
  'avg ineligible',
)
assert.equal(
  isIc1CanaryDomainQueryEligible(
    baseQuery({ aggregate: 'sum', measure: null }),
  ),
  false,
  'sum without measure',
)

function eligibleBound(input: {
  mode: 'off' | 'shadow' | 'canary' | 'authority_read_query'
  canaryEligible: boolean
  aggregate?: DomainQuery['aggregate']
  measure?: DomainQuery['measure']
}) {
  const q = baseQuery({
    aggregate: input.aggregate ?? 'count',
    measure: input.measure ?? null,
    ...(input.aggregate === null ? { limit: 20 } : {}),
  })
  const slice = isIc1CanaryDomainQueryEligible(q)
  return decideAssistantAuthority({
    effectiveMode: input.mode,
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: slice ? 'valid' : 'slice_ineligible',
    canaryEligible: input.canaryEligible,
    semanticCoverageStatus: slice ? 'complete' : 'not_assessed',
  })
}

// allowlisted + canary + eligible count → V5_AUTHORITY visible
{
  const d = eligibleBound({ mode: 'canary', canaryEligible: true })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v5')
  assert.equal(d.ownershipActive, true)
}

// list
{
  const d = eligibleBound({
    mode: 'canary',
    canaryEligible: true,
    aggregate: null,
  })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v5')
}

// sum
{
  const d = eligibleBound({
    mode: 'canary',
    canaryEligible: true,
    aggregate: 'sum',
    measure: 'wedding.paid_amount',
  })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v5')
}

// ambiguous measure → V5_CLARIFICATION
{
  const d = decideAssistantAuthority({
    effectiveMode: 'canary',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'needs_clarification',
    clarificationSlot: 'measure',
    domainQueryStatus: 'not_attempted',
    canaryEligible: true,
  })
  assert.equal(d.kind, 'v5_clarification')
  assert.equal(d.visibleOwner, 'v5')
  assert.equal(d.ownershipActive, true)
}

// non-allowlisted + canary → V3_FALLBACK
{
  const d = eligibleBound({ mode: 'canary', canaryEligible: false })
  assert.equal(d.kind, 'v3_fallback')
  assert.equal(d.visibleOwner, 'v3')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'CANARY_INELIGIBLE')
  }
}

// shadow + allowlisted → V3 visible (kill-switch proof)
{
  const d = eligibleBound({ mode: 'shadow', canaryEligible: true })
  assert.equal(d.kind, 'v5_authority')
  assert.equal(d.visibleOwner, 'v3')
  assert.equal(d.ownershipActive, false)
}

// off → V3
{
  const d = eligibleBound({ mode: 'off', canaryEligible: true })
  assert.equal(d.kind, 'v3_fallback')
  assert.equal(d.visibleOwner, 'v3')
}

// unsupported / product_help / prepare_action
for (const kind of ['unsupported', 'product_help', 'prepare_action'] as const) {
  const d = decideAssistantAuthority({
    effectiveMode: 'canary',
    requestKind: kind,
    interpreterStatus: kind === 'unsupported' ? 'unsupported' : 'ok',
    resolverOutcome: 'unsupported',
    domainQueryStatus: 'not_attempted',
    canaryEligible: true,
  })
  assert.equal(d.kind, 'v3_fallback', kind)
  assert.equal(d.visibleOwner, 'v3', kind)
}

// unsupported DQ slice
{
  const d = decideAssistantAuthority({
    effectiveMode: 'canary',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'slice_ineligible',
    canaryEligible: true,
  })
  assert.equal(d.kind, 'v3_fallback')
  if (d.kind === 'v3_fallback') {
    assert.equal(d.reason, 'DOMAIN_QUERY_SLICE_INELIGIBLE')
  }
}

// security
{
  const d = decideAssistantAuthority({
    effectiveMode: 'canary',
    requestKind: 'domain_query',
    interpreterStatus: 'ok',
    resolverOutcome: 'bound',
    domainQueryStatus: 'valid',
    canaryEligible: true,
    securityViolation: true,
  })
  assert.equal(d.kind, 'safe_error')
}

// write attempt
{
  const d = decideAssistantAuthority({
    effectiveMode: 'canary',
    requestKind: 'prepare_action',
    interpreterStatus: 'ok',
    resolverOutcome: 'unsupported',
    domainQueryStatus: 'not_attempted',
    canaryEligible: true,
    writeAttemptOnReadPath: true,
  })
  assert.equal(d.kind, 'safe_error')
  if (d.kind === 'safe_error') {
    assert.equal(d.reason, 'WRITE_ATTEMPT_ON_READ_PATH')
  }
}

// --- No client escalation: fetch ignores body canaryEligible ---
__resetAssistantRuntimeModeCacheForTests()
void (async () => {
  {
    const cfg = await fetchAssistantRuntimeConfig({
      invoke: async () => ({
        data: {
          status: 'assistant_runtime_config',
          assistantMode: 'canary',
          // Edge-attested false even if client tried to spoof
          canaryEligible: false,
        },
        error: null,
      }),
    })
    assert.equal(cfg.canaryEligible, false)
    assert.equal(cfg.mode, 'canary')
  }
  {
    // Spoof attempt: client cannot force true unless Edge returns true
    __resetAssistantRuntimeModeCacheForTests()
    const cfg = await fetchAssistantRuntimeConfig({
      invoke: async (_fn, opts) => {
        const body = opts.body as Record<string, unknown>
        assert.equal(
          'canaryEligible' in body,
          false,
          'client must not send canaryEligible',
        )
        return {
          data: {
            status: 'assistant_runtime_config',
            assistantMode: 'canary',
            canaryEligible: true,
          },
          error: null,
        }
      },
    })
    assert.equal(cfg.canaryEligible, true)
  }

  // Local canaryEligible spoof via process state alone is insufficient without mode
  resetEffectiveAssistantModeForTests()
  setEffectiveAssistantMode('canary')
  setCanaryEligibleFromRuntime(false)
  assert.equal(isV5OwnershipPathEnabled(), false)
  setCanaryEligibleFromRuntime(true)
  assert.equal(isV5OwnershipPathEnabled(), true)
  assert.equal(getCanaryEligible(), true)
  setEffectiveAssistantMode('shadow')
  assert.equal(isV5OwnershipPathEnabled(), false, 'shadow kill-switch')

  // Runtime mode parse still works
  assert.equal(parseAssistantV5Mode('canary'), 'canary')
  assert.equal(
    minAssistantV5Mode(buildCapabilityMode(), 'canary') === 'off' ||
      minAssistantV5Mode(buildCapabilityMode(), 'canary') === 'canary',
    true,
  )
  assert.equal(
    resolveEffectiveAssistantMode({ runtimeMode: null }),
    'off',
  )

  __setAssistantRuntimeModeCacheForTests('shadow', true)
  __resetAssistantRuntimeModeCacheForTests()
  resetEffectiveAssistantModeForTests()

  console.log('IC1 canary authority: ALL PASSED')
})()