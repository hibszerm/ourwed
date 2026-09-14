/**
 * Phase 3A — single-resource wedding finance execution acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/execution/phase3aFinanceAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeTaskSpec } from '../expect'
import type { ResolvedTask } from '../resolver/types'
import {
  isPhase3AFinanceSubject,
  mapSubjectToFinanceMetric,
  selectPhase3AFinanceTask,
} from './financeEligibility'
import {
  compareV4FinanceWithV3Response,
  financeAmountsEqual,
} from './compareFinanceShadow'
import {
  isAssistantV4FinanceExecutionEnabled,
  isAssistantV4ShadowEnabled,
} from '../flag'

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

console.log('Phase 3A finance acceptance')

// --- Flags default OFF ---
assert(isAssistantV4ShadowEnabled() === false, 'shadow default off')
assert(
  isAssistantV4FinanceExecutionEnabled() === false,
  'finance execution default off',
)

// --- Metric mapping ---
assert(mapSubjectToFinanceMetric('contract_value') === 'contract_value', 'cv')
assert(mapSubjectToFinanceMetric('paid') === 'paid', 'paid')
assert(mapSubjectToFinanceMetric('remaining') === 'remaining', 'remaining')
assert(mapSubjectToFinanceMetric('deposit') === null, 'deposit out')
assert(mapSubjectToFinanceMetric('wedding') === null, 'wedding out')
assert(isPhase3AFinanceSubject('remaining'), 'remaining subject ok')
assert(!isPhase3AFinanceSubject('preparations'), 'prep not finance')

// --- Eligibility ---
{
  const ok = selectPhase3AFinanceTask(
    resolvedFinance({ subject: 'remaining', weddingId: 'w1' }),
  )
  assert(ok.eligible === true, 'remaining eligible')
  if (ok.eligible) assert(ok.metric === 'remaining', 'metric remaining')
}
{
  const ok = selectPhase3AFinanceTask(
    resolvedFinance({ subject: 'paid', weddingId: 'w1', op: 'get' }),
  )
  assert(ok.eligible === true, 'paid get eligible')
}
{
  const ok = selectPhase3AFinanceTask(
    resolvedFinance({ subject: 'contract_value', weddingId: 'w1' }),
  )
  assert(ok.eligible === true, 'cv eligible')
}
{
  const bad = selectPhase3AFinanceTask(
    resolvedFinance({
      subject: 'remaining',
      weddingId: 'w1',
      collection: true,
    }),
  )
  assert(bad.eligible === false, 'collection rejected')
}
{
  const place = makeTaskSpec({
    op: 'get_location',
    subject: 'preparations',
    resource: { kind: 'active_resource' },
  })
  const bad = selectPhase3AFinanceTask({
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
  })
  assert(bad.eligible === false, 'places rejected')
}
{
  const rank = makeTaskSpec({
    op: 'rank',
    subject: 'contract_value',
    resource: { kind: 'active_collection' },
  })
  const bad = selectPhase3AFinanceTask({
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
  })
  assert(bad.eligible === false, 'rank collection rejected')
}
{
  const amb = selectPhase3AFinanceTask({
    status: 'needs_clarification',
    missingSlot: 'resource',
    candidates: [],
    sourceTaskSpec: makeTaskSpec({ op: 'get_amount', subject: 'remaining' }),
  })
  assert(amb.eligible === false, 'ambiguous rejected')
}
{
  const noRes = selectPhase3AFinanceTask(
    resolvedFinance({ subject: 'remaining', weddingId: '' }),
  )
  // empty id → missing
  assert(noRes.eligible === false, 'empty wedding id rejected')
}

// --- Amount equality ---
assert(financeAmountsEqual(4200, 4200), 'exact match')
assert(financeAmountsEqual(4200.2, 4200.4), 'round match')
assert(!financeAmountsEqual(4200, 4201), 'mismatch')

// --- Comparison ---
{
  const cmp = compareV4FinanceWithV3Response({
    v4: {
      status: 'success',
      resourceType: 'wedding',
      weddingId: 'w1',
      metric: 'remaining',
      amount: 4200,
      currency: 'PLN',
    },
    v3: {
      kind: 'finance',
      finance: {
        weddingId: 'w1',
        displayName: 'Julia',
        contractValue: 10000,
        totalPaid: 5800,
        remainingToPay: 4200,
        agreedDeposit: 1000,
        currency: 'PLN',
      },
      financeAspect: 'remaining',
    },
  })
  assert(cmp.supported, 'cmp supported')
  assert(cmp.resolvedSameResource === true, 'same resource')
  assert(cmp.metricSame === true, 'same metric')
  assert(cmp.amountSame === true, 'same amount')
}
{
  const cmp = compareV4FinanceWithV3Response({
    v4: {
      status: 'success',
      resourceType: 'wedding',
      weddingId: 'w1',
      metric: 'paid',
      amount: 100,
      currency: 'PLN',
    },
    v3: {
      kind: 'finance',
      finance: {
        weddingId: 'w2',
        displayName: 'Other',
        contractValue: 1,
        totalPaid: 200,
        remainingToPay: 0,
        agreedDeposit: 0,
        currency: 'PLN',
      },
      financeAspect: 'paid',
    },
  })
  assert(cmp.resolvedSameResource === false, 'diff resource')
  assert(cmp.amountSame === false, 'diff amount')
}

// --- Source architecture guards (static) ---
const execSrc = read(
  'src/features/assistant/v4/execution/executeSingleWeddingFinance.ts',
)
assert(execSrc.includes('getWeddingCommercialSummary'), 'uses commercial SoT')
assert(execSrc.includes('weddingService.getById'), 'uses weddingService')
assert(!execSrc.includes('service_role'), 'no service_role')
assert(
  !execSrc.includes('args.ownerId') &&
    !execSrc.includes('args.userId') &&
    !execSrc.includes('args.tenantId'),
  'no identity args from model',
)
assert(
  execSrc.includes('Never accepts ownerId'),
  'documents identity forbid',
)

const flagSrc = read('src/features/assistant/v4/flag.ts')
assert(
  flagSrc.includes('VITE_ASSISTANT_V4_EXECUTION_FINANCE'),
  'finance flag name',
)
assert(flagSrc.includes('VITE_ASSISTANT_V4_SHADOW'), 'shadow flag preserved')

const shadowSrc = read('src/features/assistant/v4/shadow.ts')
assert(
  shadowSrc.includes('runV4CapabilityExecution') ||
    shadowSrc.includes('executePhase3AFinanceIfEligible'),
  'shadow wires capability execution',
)
assert(
  shadowSrc.includes('completeAssistantV4FinanceShadowComparison'),
  'v3 compare hook',
)
assert(
  read(
    'src/features/assistant/v4/capabilities/finance/weddingFinanceCapability.ts',
  ).includes("id: 'wedding.finance.get'"),
  'finance registered',
)
assert(
  shadowSrc.includes('isAnyV4CapabilityExecutionEnabled') ||
    shadowSrc.includes('isAssistantV4FinanceExecutionEnabled'),
  'finance gated',
)

const host = read('src/features/assistant/AssistantHost.tsx')
assert(
  host.includes('completeAssistantV4FinanceShadowComparison'),
  'host compares after V3',
)
assert(host.includes('runAssistantQuery'), 'V3 still authority')

const elig = read(
  'src/features/assistant/v4/execution/financeEligibility.ts',
)
assert(elig.includes('collection_rejected'), 'rejects collections')
assert(elig.includes('contract_value'), 'allowlist cv')
assert(elig.includes('paid'), 'allowlist paid')
assert(elig.includes('remaining'), 'allowlist remaining')

console.log('Phase 3A finance acceptance — ALL PASS')
