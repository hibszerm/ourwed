/**
 * Assistant aggregate date range + unit labels acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantAggregateAcceptance.test.ts
 */

import { resolveAggregateDateRange } from './dates'
import { polishCountUnit } from './tools/aggregateRange'
import { validateAssistantSemanticRequest } from './api/validateSemantic'
import { ASSISTANT_TOOL_NAMES } from './types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('Assistant aggregate acceptance')

const today = '2026-09-11'

const aug = resolveAggregateDateRange('sierpień', today)
assert(!!aug, 'sierpień resolves')
assert(aug!.from === '2026-08-01', 'aug from')
assert(aug!.to === '2026-08-31', 'aug to')
assert(aug!.titleLabel === 'SIERPIEŃ 2026', 'aug title')

const wrz = resolveAggregateDateRange('we wrześniu', today)
assert(wrz?.from === '2026-09-01' && wrz.to === '2026-09-30', 'wrzesień')

const paz = resolveAggregateDateRange('październik', today)
assert(paz?.from === '2026-10-01' && paz.to === '2026-10-31', 'październik')

const thisMonth = resolveAggregateDateRange('ten miesiąc', today)
assert(
  thisMonth?.from === '2026-09-01' && thisMonth.to === '2026-09-30',
  'ten miesiąc',
)

const nextMonth = resolveAggregateDateRange('przyszły miesiąc', today)
assert(
  nextMonth?.from === '2026-10-01' && nextMonth.to === '2026-10-31',
  'przyszły miesiąc',
)

const withYear = resolveAggregateDateRange('sierpień 2025', today)
assert(withYear?.year === 2025 && withYear.from === '2025-08-01', 'year override')

// Calendar-year relatives — closed bounds (Phase 3E.1)
const thisYear = resolveAggregateDateRange('w tym roku', today)
assert(
  thisYear?.from === '2026-01-01' && thisYear.to === '2026-12-31',
  'this year closed',
)
const nextYear = resolveAggregateDateRange('w przyszłym roku', today)
assert(
  nextYear?.from === '2027-01-01' && nextYear.to === '2027-12-31',
  'next year closed (not open-ended)',
)
const prevYear = resolveAggregateDateRange('poprzedni rok', today)
assert(
  prevYear?.from === '2025-01-01' && prevYear.to === '2025-12-31',
  'previous year',
)
assert(
  resolveAggregateDateRange('2027', today)?.to === '2027-12-31',
  'bare year',
)
// Absolute calendar year with conversational wrappers (typed temporal.expression)
for (const [expr, from, to] of [
  ['a w 2028?', '2028-01-01', '2028-12-31'],
  ['w 2028', '2028-01-01', '2028-12-31'],
  ['w 2028 roku', '2028-01-01', '2028-12-31'],
  ['2028?', '2028-01-01', '2028-12-31'],
  ['rok 2028', '2028-01-01', '2028-12-31'],
] as const) {
  const r = resolveAggregateDateRange(expr, today)
  assert(r?.from === from && r?.to === to, `absolute year form: ${expr}`)
}
assert(
  resolveAggregateDateRange('a w przyszłym roku?', today)?.from === '2027-01-01',
  'relative year with wrapper still works',
)

assert(polishCountUnit('weddings', 1) === 'wesele', '1 wesele')
assert(polishCountUnit('weddings', 2) === 'wesela', '2 wesela')
assert(polishCountUnit('weddings', 5) === 'wesel', '5 wesel')
assert(polishCountUnit('sessions', 1) === 'sesja', '1 sesja')
assert(polishCountUnit('assignments', 8) === 'zleceń', '8 zleceń')

const countReq = validateAssistantSemanticRequest({
  kind: 'aggregate',
  metric: 'count',
  scope: 'weddings',
  datePhrase: 'sierpień',
})
assert(countReq?.kind === 'aggregate', 'validate count')
assert(
  countReq?.kind === 'aggregate' && countReq.scope === 'weddings',
  'scope weddings',
)

const valueReq = validateAssistantSemanticRequest({
  kind: 'aggregate',
  metric: 'contract_value',
  scope: 'weddings',
  datePhrase: 'wrzesień',
})
assert(valueReq?.kind === 'aggregate', 'validate value')

const badValue = validateAssistantSemanticRequest({
  kind: 'aggregate',
  metric: 'contract_value',
  scope: 'sessions',
  datePhrase: 'wrzesień',
})
assert(badValue === null, 'reject CV on sessions')

const combined = validateAssistantSemanticRequest({
  kind: 'aggregate',
  metric: 'count_and_value',
  scope: 'weddings',
  datePhrase: 'sierpień',
})
assert(combined?.kind === 'aggregate', 'combined')

for (const name of [
  'get_wedding_count_for_range',
  'get_session_count_for_range',
  'get_assignment_count_for_range',
  'get_wedding_contract_value_sum_for_range',
] as const) {
  assert(
    (ASSISTANT_TOOL_NAMES as readonly string[]).includes(name),
    `tool ${name}`,
  )
}

const edgeSchema = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-assistant/schema.ts'),
  'utf8',
)
assert(edgeSchema.includes("'aggregate'"), 'edge schema aggregate')
assert(edgeSchema.includes('aggregateMetric'), 'edge metric field')
assert(edgeSchema.includes('domainKind'), 'edge domainKind')
assert(edgeSchema.includes('qpResource'), 'edge qpResource')

const edgePrompt = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-assistant/prompt.ts'),
  'utf8',
)
assert(
  edgePrompt.includes('zlecenia') && edgePrompt.includes('assignments'),
  'zlecenia rule',
)
assert(edgePrompt.includes('query_plan'), 'prompt query_plan')
assert(!/\bAI\b/.test(edgePrompt.replace(/OpenAI/g, '')), 'no AI marketing')

const css = readFileSync(
  resolve(process.cwd(), 'src/features/assistant/components/Assistant.module.css'),
  'utf8',
)
assert(css.includes('prefers-reduced-motion'), 'reduced motion')
assert(css.includes('assistantPanelIn'), 'open motion')
assert(css.includes('heroCount'), 'aggregate hero')

const surface = readFileSync(
  resolve(
    process.cwd(),
    'src/features/assistant/components/AssistantSurface.tsx',
  ),
  'utf8',
)
assert(surface.includes("data-motion"), 'motion state')
assert(surface.includes('ASSISTANT_EXAMPLE_GROUPS'), 'grouped empty')

console.log('OK assistant aggregate acceptance')
