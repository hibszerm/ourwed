/**
 * Assistant V2 Intelligence Core — working context + QueryPlan acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantV2IntelligenceAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyWorkingContextPatch,
  buildModelWorkingContext,
  emptyWorkingContext,
  setActiveCollection,
  setActiveResource,
} from './api/workingContext'
import {
  ASSISTANT_QUERY_LIST_LIMIT,
  validateAssistantQueryPlan,
} from './api/queryPlanSchema'
import {
  aggregateSemanticToQueryPlan,
  validateAssistantDomainRequest,
} from './api/validateDomain'
import { resolveAggregateDateRange } from './dates'
import { getContractValue } from '@/lib/utils/commercial'
import { getRemainingToPay, getTotalPaid } from '@/lib/utils/finance'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

console.log('Assistant V2 intelligence acceptance')

// --- Working context ephemeral helpers ---
let ctx = emptyWorkingContext()
assert(ctx.activeCollection === null, 'empty collection')
assert(ctx.activeResource === null, 'empty resource')

ctx = setActiveCollection(ctx, {
  resource: 'weddings',
  filters: { dateRange: { from: '2026-08-01', to: '2026-08-31' } },
  resultCount: 8,
  label: 'Sierpień 2026',
})
assert(ctx.activeCollection?.resultCount === 8, 'collection set')
assert(ctx.activeResource === null, 'new collection clears resource')

ctx = setActiveResource(ctx, {
  kind: 'wedding',
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  displayLabel: 'Julia Kanicka i Maksymilian Ruth',
})
assert(ctx.activeCollection?.resultCount === 8, 'resource keeps collection')
assert(ctx.activeResource?.displayLabel.includes('Julia'), 'resource set')

ctx = setActiveCollection(ctx, {
  resource: 'weddings',
  filters: { dateRange: { from: '2026-09-01', to: '2026-09-30' } },
  resultCount: 1,
  label: 'Wrzesień 2026',
})
assert(ctx.activeResource === null, 'replacement clears resource')
assert(ctx.activeCollection?.label === 'Wrzesień 2026', 'september')

ctx = applyWorkingContextPatch(emptyWorkingContext(), {
  activeCollection: {
    resource: 'weddings',
    filters: { dateRange: { from: '2026-08-01', to: '2026-08-31' } },
    resultCount: 8,
    label: 'Sierpień 2026',
  },
  lastOperation: { type: 'count' },
})
const modelCtx = buildModelWorkingContext(ctx)
assert(
  JSON.stringify(modelCtx).includes('payments') === false,
  'model ctx no payments',
)
assert(
  JSON.stringify(modelCtx).includes('phone') === false,
  'model ctx no phone',
)
assert(
  (modelCtx.activeCollection as { resultCount: number }).resultCount === 8,
  'model ctx count',
)

// Close clears — Host uses emptyWorkingContext
assert(emptyWorkingContext().activeCollection === null, 'close clears')

const host = read('src/features/assistant/AssistantHost.tsx')
assert(host.includes('emptyWorkingContext()'), 'host clears context')
assert(host.includes('clearSession'), 'clear on close')
assert(!host.includes('localStorage'), 'no localStorage')
assert(!host.includes('sessionStorage'), 'no sessionStorage')

// --- QueryPlan validation ---
const countPlan = validateAssistantQueryPlan({
  kind: 'query_plan',
  resource: 'weddings',
  operation: 'count',
  filters: { dateRange: { phrase: 'sierpień' } },
})
assert(countPlan?.operation === 'count', 'count plan')

const sumActive = validateAssistantQueryPlan({
  kind: 'query_plan',
  resource: 'weddings',
  operation: 'sum',
  field: 'contractValue',
  filters: { useActiveCollection: true },
  target: 'active_collection',
})
assert(sumActive?.field === 'contractValue', 'sum CV')

const paidActive = validateAssistantQueryPlan({
  kind: 'query_plan',
  resource: 'weddings',
  operation: 'sum',
  field: 'paidAmount',
  filters: { useActiveCollection: true },
})
assert(paidActive?.field === 'paidAmount', 'sum paid')

const maxPlan = validateAssistantQueryPlan({
  kind: 'query_plan',
  resource: 'weddings',
  operation: 'max',
  field: 'contractValue',
  filters: { useActiveCollection: true },
})
assert(maxPlan?.operation === 'max', 'max CV')

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'sum',
  }) === null,
  'sum without field rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'count',
    ownerId: 'evil',
  }) === null,
  'ownerId rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'count',
    userId: 'evil',
  }) === null,
  'userId rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'count',
    tenantId: 'evil',
  }) === null,
  'tenantId rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'count',
    sql: 'select * from weddings',
  }) === null,
  'sql key rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'delete',
  }) === null,
  'delete op rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'sum',
    field: 'profit',
  }) === null,
  'unknown field rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'fuel',
    operation: 'count',
  }) === null,
  'unknown resource rejected',
)

assert(
  validateAssistantQueryPlan({
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'list',
    filters: {
      remainingAmount: { operator: 'gt', value: 5000 },
    },
  })?.filters?.remainingAmount?.value === 5000,
  'remaining comparator',
)

const capped = validateAssistantQueryPlan({
  kind: 'query_plan',
  resource: 'weddings',
  operation: 'list',
  limit: 999,
})
assert(capped?.limit === ASSISTANT_QUERY_LIST_LIMIT, 'list hard-cap 20')

// --- Domain request ---
const domainQp = validateAssistantDomainRequest({
  kind: 'query_plan',
  plan: {
    kind: 'query_plan',
    resource: 'weddings',
    operation: 'count',
    filters: { dateRange: { phrase: 'sierpień' } },
  },
})
assert(domainQp?.kind === 'query_plan', 'domain query_plan')

const clarify = validateAssistantDomainRequest({
  kind: 'clarification',
  question: 'Masz na myśli wartość umów czy kwotę, którą już wpłacili klienci?',
  options: [
    {
      id: 'cv',
      label: 'Wartość umów',
      plan: {
        kind: 'query_plan',
        resource: 'weddings',
        operation: 'sum',
        field: 'contractValue',
        filters: { useActiveCollection: true },
      },
    },
    {
      id: 'paid',
      label: 'Wpłacone',
      plan: {
        kind: 'query_plan',
        resource: 'weddings',
        operation: 'sum',
        field: 'paidAmount',
        filters: { useActiveCollection: true },
      },
    },
  ],
})
assert(clarify?.kind === 'clarification', 'clarification')
assert(
  clarify?.kind === 'clarification' && clarify.options?.length === 2,
  'clarify options',
)

const unsupported = validateAssistantDomainRequest({
  kind: 'unsupported',
  reason: 'data_not_tracked',
  message: 'OurWed nie przechowuje obecnie danych o wydatkach na paliwo.',
})
assert(unsupported?.kind === 'unsupported', 'unsupported fuel')

assert(
  validateAssistantDomainRequest({
    kind: 'query_plan',
    ownerId: 'x',
    plan: { resource: 'weddings', operation: 'count' },
  }) === null,
  'domain identity rejected',
)

// --- Aggregate subsumed ---
const legacyAgg = aggregateSemanticToQueryPlan({
  kind: 'aggregate',
  metric: 'count',
  scope: 'weddings',
  datePhrase: 'sierpień',
})
assert(legacyAgg.operation === 'count', 'aggregate→count')
assert(legacyAgg.resource === 'weddings', 'aggregate weddings')

const aug = resolveAggregateDateRange('sierpień', '2026-09-11')
assert(aug?.from === '2026-08-01' && aug.to === '2026-08-31', 'aug range')

// --- Finance helpers reused (no duplicate formulas in executor) ---
const execSrc = read('src/features/assistant/api/executeQueryPlan.ts')
assert(execSrc.includes('getContractValue'), 'CV helper')
assert(execSrc.includes('getTotalPaid'), 'paid helper')
assert(execSrc.includes('getRemainingToPay'), 'remaining helper')
assert(execSrc.includes('weddingListLightService'), 'list light')
assert(execSrc.includes('sessionListLightService'), 'session light')
assert(!/weddingService\.getById\s*\(/.test(execSrc), 'no N× getById')
assert(!execSrc.includes('calendarLightService'), 'no calendar-light money path')
assert(!/for\s*\(.*of.*\)[\s\S]{0,80}getById\s*\(/.test(execSrc), 'no loop getById')

// Prove commercial helpers are the imported SoT (smoke)
assert(typeof getContractValue === 'function', 'getContractValue export')
assert(typeof getTotalPaid === 'function', 'getTotalPaid export')
assert(typeof getRemainingToPay === 'function', 'getRemainingToPay export')

// --- Edge protocol V2 ---
const edgeSchema = read('supabase/functions/ai-assistant/schema.ts')
assert(edgeSchema.includes('domainKind'), 'domainKind')
assert(edgeSchema.includes('qpUseActiveCollection'), 'qp use collection')
assert(edgeSchema.includes('query_plan'), 'query_plan')
assert(edgeSchema.includes('clarification'), 'clarification')

const edgePrompt = read('supabase/functions/ai-assistant/prompt.ts')
assert(edgePrompt.includes('query_plan'), 'prompt query_plan')
assert(edgePrompt.includes('useActiveCollection'), 'prompt active collection')
assert(
  edgePrompt.includes('Never return numeric') ||
    edgePrompt.includes('NEVER return numeric'),
  'no invented numbers',
)
assert(
  edgePrompt.includes('zlecenia') && edgePrompt.includes('assignments'),
  'zlecenia = assignments',
)
assert(edgePrompt.includes('ile mam wesel w sierpniu'), 'paraphrase count')
assert(edgePrompt.includes('jaka jest ich łączna wartość'), 'paraphrase value')
assert(edgePrompt.includes('ile już wpłacili'), 'paraphrase paid')
assert(edgePrompt.includes('najdroższe'), 'paraphrase max')

const edgeIndex = read('supabase/functions/ai-assistant/index.ts')
assert(edgeIndex.includes("status: 'domain'"), 'returns domain')
assert(edgeIndex.includes('workingContext'), 'passes workingContext')
assert(!edgeIndex.includes('SERVICE_ROLE'), 'no service role')

const api = read('src/features/assistant/api/assistantApi.ts')
assert(api.includes('executeAssistantQueryPlan'), 'api uses query plan')
assert(api.includes('aggregateSemanticToQueryPlan'), 'aggregate subsumed')
assert(api.includes("status: 'domain'"), 'handles domain')

console.log('OK assistant V2 intelligence acceptance')
