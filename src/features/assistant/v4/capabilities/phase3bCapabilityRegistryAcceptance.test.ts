/**
 * Phase 3B — Capability Registry foundation + finance migration acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/capabilities/phase3bCapabilityRegistryAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeTaskSpec } from '../expect'
import type { ResolvedTask, ResolvedTaskResult } from '../resolver/types'
import {
  isAssistantV4FinanceExecutionEnabled,
  isAssistantV4ShadowEnabled,
} from '../flag'
import { selectPhase3AFinanceTask } from '../execution/financeEligibility'
import { capabilityResultToFinanceExecution } from './adaptFinanceResult'
import { isV4CapabilityEnabled } from './availability'
import { executePhase3AFinanceIfEligible } from './dispatchFinance'
import {
  assertUniqueCapabilityIds,
  getV4Capability,
  V4_CAPABILITY_REGISTRY,
} from './registry'
import { runV4CapabilityExecution } from './runtime'
import {
  selectCapabilityFromRegistry,
  selectV4Capability,
} from './selector'
import type { CapabilityDefinition } from './types'
import { V4_CAPABILITY_IDS } from './types'
import { weddingFinanceGetCapability } from './finance/weddingFinanceCapability'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function resolvedFinance(input: {
  subject: 'contract_value' | 'paid' | 'remaining'
  weddingId: string
  op?: 'get_amount' | 'get' | 'inherit'
  collection?: boolean
}): ResolvedTask {
  const op = input.op ?? 'get_amount'
  const merged = makeTaskSpec({
    op,
    subject: input.subject,
    resource: { kind: 'active_resource' },
  })
  return {
    status: 'resolved',
    op,
    subject: input.subject,
    resource: {
      kind: 'wedding',
      id: input.weddingId,
      label: 'Test Wedding',
    },
    participant: null,
    temporal: null,
    qualifiers: merged.qualifiers,
    sequence: null,
    collection: input.collection
      ? { resource: 'weddings', label: 'sep' }
      : null,
    sourceTaskSpec: merged,
    mergedTaskSpec: merged,
  }
}

function placeTask(): ResolvedTask {
  const place = makeTaskSpec({
    op: 'get_location',
    subject: 'preparations',
    resource: { kind: 'active_resource' },
  })
  return {
    status: 'resolved',
    op: 'get_location',
    subject: 'preparations',
    resource: { kind: 'wedding', id: 'w1' },
    participant: null,
    temporal: null,
    qualifiers: place.qualifiers,
    sequence: null,
    collection: null,
    sourceTaskSpec: place,
    mergedTaskSpec: place,
  }
}

function rankTask(): ResolvedTask {
  const rank = makeTaskSpec({
    op: 'rank',
    subject: 'contract_value',
    resource: { kind: 'active_collection' },
  })
  return {
    status: 'resolved',
    op: 'rank',
    subject: 'contract_value',
    resource: null,
    participant: null,
    temporal: null,
    qualifiers: rank.qualifiers,
    sequence: null,
    collection: { resource: 'weddings' },
    sourceTaskSpec: rank,
    mergedTaskSpec: rank,
  }
}

function sumCollectionTask(): ResolvedTask {
  const sum = makeTaskSpec({
    op: 'sum',
    subject: 'remaining',
    resource: { kind: 'active_collection' },
  })
  return {
    status: 'resolved',
    op: 'sum',
    subject: 'remaining',
    resource: null,
    participant: null,
    temporal: null,
    qualifiers: sum.qualifiers,
    sequence: null,
    collection: { resource: 'weddings' },
    sourceTaskSpec: sum,
    mergedTaskSpec: sum,
  }
}

function writeTask(): ResolvedTask {
  const prep = makeTaskSpec({
    op: 'prepare_create',
    subject: 'task',
  })
  return {
    status: 'resolved',
    op: 'prepare_create',
    subject: 'task',
    resource: { kind: 'wedding', id: 'w1' },
    participant: null,
    temporal: null,
    qualifiers: prep.qualifiers,
    sequence: null,
    collection: null,
    sourceTaskSpec: prep,
    mergedTaskSpec: prep,
  }
}

console.log('Phase 3B capability registry acceptance')

async function main() {
  // --- Flags default OFF ---
  assert(isAssistantV4ShadowEnabled() === false, 'shadow default off')
  assert(
    isAssistantV4FinanceExecutionEnabled() === false,
    'finance execution default off',
  )
  assert(
    isV4CapabilityEnabled('wedding.finance.get') === false,
    'capability disabled by default',
  )

  // --- Registry ---
assertUniqueCapabilityIds()
assert(V4_CAPABILITY_REGISTRY.length === 4, 'exactly four capabilities')
assert(
  V4_CAPABILITY_REGISTRY.map((c) => c.id).join(',') ===
    'wedding.finance.get,wedding.places.get,wedding.day_plan.get,collection.query',
  'registry order/ids',
)
assert(getV4Capability('wedding.finance.get') != null, 'get by id')
assert(getV4Capability('collection.query') != null, 'get collection.query')
assert(
  V4_CAPABILITY_IDS.includes('wedding.finance.get'),
  'id in closed set',
)
assert(
  V4_CAPABILITY_IDS.includes('collection.query'),
  'collection.query in closed set',
)
  assert(
    weddingFinanceGetCapability.kind === 'read' &&
      weddingFinanceGetCapability.riskLevel === 'low' &&
      weddingFinanceGetCapability.requiresConfirmation === false,
    'finance metadata',
  )

  // --- Selector uniqueness ---
  {
    const sel = selectV4Capability(
      resolvedFinance({ subject: 'remaining', weddingId: 'w1' }),
    )
    assert(sel.status === 'selected', 'finance matches exactly one')
    if (sel.status === 'selected') {
      assert(sel.capability.id === 'wedding.finance.get', 'id finance')
      assert(sel.enabled === false, 'selected but disabled without flag')
    }
  }
  {
    const sel = selectV4Capability(placeTask())
    assert(sel.status === 'selected', 'place matches places capability')
    if (sel.status === 'selected') {
      assert(sel.capability.id === 'wedding.places.get', '→ places')
    }
  }
  {
    const distance = makeTaskSpec({
      op: 'get_distance',
      subject: 'route',
      resource: { kind: 'active_resource' },
    })
    const sel = selectV4Capability({
      status: 'resolved',
      op: 'get_distance',
      subject: 'route',
      resource: { kind: 'wedding', id: 'w1' },
      participant: null,
      temporal: null,
      qualifiers: distance.qualifiers,
      sequence: null,
      collection: null,
      sourceTaskSpec: distance,
      mergedTaskSpec: distance,
    })
    assert(sel.status === 'no_match', 'distance matches zero')
  }
  {
    const sel = selectV4Capability(rankTask())
    assert(sel.status === 'selected', 'rank matches collection.query')
    if (sel.status === 'selected') {
      assert(sel.capability.id === 'collection.query', '→ collection.query')
    }
  }
  {
    const sel = selectV4Capability(sumCollectionTask())
    assert(sel.status === 'selected', 'collection sum matches collection.query')
    if (sel.status === 'selected') {
      assert(sel.capability.id === 'collection.query', '→ collection.query')
    }
  }
  {
    const sel = selectV4Capability(writeTask())
    assert(sel.status === 'no_match', 'write matches zero')
  }
  {
    const duplicate: CapabilityDefinition = {
      ...weddingFinanceGetCapability,
      id: 'wedding.finance.get',
      canHandle: () => true,
    }
    const conflict = selectCapabilityFromRegistry(
      resolvedFinance({ subject: 'paid', weddingId: 'w1' }),
      [weddingFinanceGetCapability, duplicate],
      { isCapabilityEnabled: () => true },
    )
    assert(conflict.status === 'conflict', '>1 match fails closed')
    if (conflict.status === 'conflict') {
      assert(conflict.matchedIds.length === 2, 'two matched ids')
    }
  }

  // --- Runtime: disabled does not execute ---
  {
    const dispatched = await runV4CapabilityExecution(
      resolvedFinance({ subject: 'remaining', weddingId: 'w1' }),
      {
        context: { isCapabilityEnabled: () => false },
      },
    )
    assert(dispatched.handled === true, 'disabled still handled selected')
    if (dispatched.handled) {
      assert(dispatched.result.status === 'disabled', 'status disabled')
    }
    const viaLegacy = await executePhase3AFinanceIfEligible(
      resolvedFinance({ subject: 'remaining', weddingId: 'w1' }),
    )
    assert(viaLegacy === null, 'legacy entry returns null when disabled')
  }

  // --- Runtime: conflict fails closed ---
  {
    const duplicate: CapabilityDefinition = {
      ...weddingFinanceGetCapability,
      canHandle: () => true,
    }
    const dispatched = await runV4CapabilityExecution(
      resolvedFinance({ subject: 'remaining', weddingId: 'w1' }),
      {
        capabilities: [weddingFinanceGetCapability, duplicate],
        context: { isCapabilityEnabled: () => true },
      },
    )
    assert(dispatched.handled === true, 'conflict handled')
    if (dispatched.handled) {
      assert(dispatched.result.status === 'conflict', 'conflict status')
    }
  }

  // --- Observation adapter ---
  {
    const adapted = capabilityResultToFinanceExecution({
      status: 'success',
      capabilityId: 'wedding.finance.get',
      observation: {
        kind: 'money',
        resource: { kind: 'wedding', id: 'w1' },
        metric: 'remaining',
        amount: 4200,
        currency: 'PLN',
        displayName: 'Julia',
      },
      selectionMs: 0,
      executionMs: 1,
    })
    assert(adapted.status === 'success', 'adapt success')
    if (adapted.status === 'success') {
      assert(adapted.weddingId === 'w1', 'wedding id')
      assert(adapted.metric === 'remaining', 'metric')
      assert(adapted.amount === 4200, 'amount')
      assert(adapted.currency === 'PLN', 'currency')
      assert(adapted.displayName === 'Julia', 'displayName')
    }
  }

  // --- Missing wedding id → clarification (not silent skip) ---
  {
    const missing = resolvedFinance({ subject: 'remaining', weddingId: '' })
    const elig = selectPhase3AFinanceTask(missing)
    assert(elig.eligible === false, 'not fully eligible')
    const sel = selectV4Capability(missing)
    assert(sel.status === 'selected', 'finance-shaped still selected')
    const dispatched = await runV4CapabilityExecution(missing, {
      context: { isCapabilityEnabled: () => true },
    })
    assert(dispatched.handled === true, 'missing id handled')
    if (dispatched.handled) {
      assert(
        dispatched.result.status === 'needs_clarification',
        'missing id clarifies',
      )
    }
  }

  // --- Collection ops handled by collection.query; writes still skip ---
  {
    for (const task of [rankTask(), sumCollectionTask()]) {
      const dispatched = await runV4CapabilityExecution(task, {
        context: { isCapabilityEnabled: () => true },
      })
      assert(dispatched.handled === true, `collection handled ${task.op}`)
      if (dispatched.handled) {
        // May need clarification (no metric filters) or attempt execute —
        // must not be silent skip.
        assert(
          dispatched.result.status !== undefined,
          `result present for ${task.op}`,
        )
      }
    }
    const write = await runV4CapabilityExecution(writeTask(), {
      context: { isCapabilityEnabled: () => true },
    })
    assert(write.handled === false, 'skip prepare_create')
  }

  // --- Security: capability types must not accept identity args ---
  {
    const typesSrc = read('src/features/assistant/v4/capabilities/types.ts')
    assert(!typesSrc.includes('ownerId'), 'no ownerId in capability types')
    assert(!typesSrc.includes('userId'), 'no userId in capability types')
    assert(!typesSrc.includes('tenantId'), 'no tenantId in capability types')
    assert(!typesSrc.includes('service_role'), 'no service_role')
    assert(!typesSrc.includes('from('), 'no supabase from()')
    const runtimeSrc = read('src/features/assistant/v4/capabilities/runtime.ts')
    assert(!runtimeSrc.includes('service_role'), 'runtime no service_role')
    assert(
      runtimeSrc.includes('Does NOT interpret language'),
      'runtime non-authority documented',
    )
    const finCap = read(
      'src/features/assistant/v4/capabilities/finance/weddingFinanceCapability.ts',
    )
    assert(finCap.includes('loadWeddingFinanceMetric'), 'uses SoT loader')
    assert(!finCap.includes('service_role'), 'finance cap no service_role')
  }

  // --- Architecture wiring ---
  {
    const shadowSrc = read('src/features/assistant/v4/shadow.ts')
    assert(
      shadowSrc.includes('runV4CapabilityExecution'),
      'shadow uses registry runtime',
    )
    const dispatchSrc = read(
      'src/features/assistant/v4/capabilities/dispatchFinance.ts',
    )
    assert(
      dispatchSrc.includes('runV4CapabilityExecution'),
      'dispatch uses registry runtime',
    )
    const execIdx = read('src/features/assistant/v4/execution/index.ts')
    assert(
      execIdx.includes('executePhase3AFinanceIfEligible'),
      'execution barrel re-exports dispatch',
    )
    assert(
      getV4Capability('wedding.finance.get') != null,
      'finance registered',
    )
    assert(
      getV4Capability('wedding.places.get') != null,
      'places registered',
    )
    assert(
      getV4Capability('wedding.day_plan.get') != null,
      'day_plan registered',
    )
    assert(
      getV4Capability('collection.query') != null,
      'collection.query registered',
    )
    const registrySrc = read(
      'src/features/assistant/v4/capabilities/registry.ts',
    )
    assert(
      registrySrc.includes('collectionQueryCapability'),
      'collection capability registered',
    )
    assert(
      !registrySrc.includes('route.calculate'),
      'no route capability registered',
    )
  }

  // --- Clarification resolution still handled (Phase 3A compat) ---
  {
    const clarification: ResolvedTaskResult = {
      status: 'needs_clarification',
      missingSlot: 'resource',
      candidates: [],
      resumeTask: makeTaskSpec({ op: 'get_amount', subject: 'remaining' }),
    }
    const via = await executePhase3AFinanceIfEligible(clarification)
    assert(via?.status === 'needs_clarification', 'clarification preserved')
  }

  console.log('Phase 3B capability registry acceptance — ALL PASS')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
