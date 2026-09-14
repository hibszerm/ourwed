/**
 * Semantic continuation + intent separation + follow-up context.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantSemanticContinuationAcceptance.test.ts
 */

import { parseAssistantSemanticRequest } from './api/intentParse'
import { withResolvedWedding } from './api/semantic'
import { weddingIdFromResponse } from './api/executeSemantic'
import type { AssistantResponse, AssistantSemanticRequest } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('Assistant semantic continuation acceptance')

// --- Intent separation ---
assert(
  parseAssistantSemanticRequest('ile julia ma do zaplaty').kind ===
    'wedding_finances',
  'finance',
)
assert(
  parseAssistantSemanticRequest('gdzie julia ma przygotowania').kind ===
    'wedding_places',
  'places',
)
assert(
  (
    parseAssistantSemanticRequest(
      'gdzie julia ma przygotowania',
    ) as Extract<AssistantSemanticRequest, { kind: 'wedding_places' }>
  ).requestedRole === 'preparations',
  'places role preparations',
)
assert(
  parseAssistantSemanticRequest('pokaż plan dnia Julii').kind ===
    'wedding_day_plan',
  'day plan',
)
assert(
  parseAssistantSemanticRequest('jakie mam zadania przy Julii').kind ===
    'wedding_tasks',
  'tasks',
)
assert(
  parseAssistantSemanticRequest('co dalej z Julią').kind ===
    'wedding_next_action',
  'next action',
)
assert(
  parseAssistantSemanticRequest('otwórz zlecenie Julii').kind ===
    'open_wedding',
  'open wedding',
)
assert(
  parseAssistantSemanticRequest('otwórz sesję Aleksandry').kind ===
    'open_session',
  'open session',
)
assert(
  parseAssistantSemanticRequest('co mam jutro').kind === 'schedule',
  'schedule',
)
assert(
  parseAssistantSemanticRequest('dodaj zadanie Julii na jutro: zadzwonić')
    .kind === 'prepare_create_task',
  'create task',
)

// Ceremony time focus vs full plan
const ceremonyQ = parseAssistantSemanticRequest('o której ceremonia Julii')
assert(ceremonyQ.kind === 'wedding_day_plan', 'ceremony time → day_plan')
if (ceremonyQ.kind === 'wedding_day_plan') {
  assert(ceremonyQ.focus === 'ceremony', 'ceremony focus')
}
const fullPlan = parseAssistantSemanticRequest('pokaż plan dnia Julii')
assert(
  fullPlan.kind === 'wedding_day_plan' &&
    (fullPlan.focus === 'full' || fullPlan.focus === undefined),
  'full plan focus',
)

// Date hint survives parse (not inside person)
const dated = parseAssistantSemanticRequest(
  'ile Julia z 11.09 ma do zapłaty',
)
assert(dated.kind === 'wedding_finances', 'dated finance')
if (dated.kind === 'wedding_finances') {
  assert(
    dated.resolver.personQuery?.toLowerCase().includes('julia') === true,
    'person julia',
  )
  assert(dated.resolver.dateHint === '11.09', 'date hint 11.09')
  assert(
    !dated.resolver.personQuery?.includes('11'),
    'date not in person query',
  )
}

// --- Choice continuation preserves intent ---
const financePending = parseAssistantSemanticRequest('ile julia ma do zaplaty')
assert(financePending.kind === 'wedding_finances', 'pending finance')
const continued = withResolvedWedding(
  financePending,
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
)
assert(continued.kind === 'wedding_finances', 'still finance after select')
if (continued.kind === 'wedding_finances') {
  assert(
    continued.resolver.weddingId ===
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'weddingId injected',
  )
  assert(
    continued.resolver.personQuery?.toLowerCase().includes('julia') === true,
    'person preserved',
  )
}

const intentsToSurvive: Array<{ q: string; kind: AssistantSemanticRequest['kind'] }> =
  [
    { q: 'gdzie julia ma przygotowania', kind: 'wedding_places' },
    { q: 'pokaż plan dnia Julii', kind: 'wedding_day_plan' },
    { q: 'jakie mam zadania przy Julii', kind: 'wedding_tasks' },
    { q: 'co dalej z Julią', kind: 'wedding_next_action' },
    { q: 'otwórz zlecenie Julii', kind: 'open_wedding' },
    {
      q: 'dodaj zadanie Julii na jutro: zadzwonić',
      kind: 'prepare_create_task',
    },
  ]

for (const row of intentsToSurvive) {
  const pending = parseAssistantSemanticRequest(row.q)
  assert(pending.kind === row.kind, `parse ${row.kind}`)
  const next = withResolvedWedding(pending, 'wid-1')
  assert(next.kind === row.kind, `survive ${row.kind}`)
  if (next.kind === 'prepare_create_task') {
    assert(next.weddingId === 'wid-1', 'task weddingId')
  } else if (
    next.kind === 'wedding_places' ||
    next.kind === 'wedding_day_plan' ||
    next.kind === 'wedding_tasks' ||
    next.kind === 'wedding_next_action' ||
    next.kind === 'open_wedding' ||
    next.kind === 'wedding_finances'
  ) {
    assert(next.resolver.weddingId === 'wid-1', `${row.kind} id`)
  }
}

// Follow-up short phrases (no name) — need session wedding
assert(
  parseAssistantSemanticRequest('a gdzie ma przygotowania?').kind ===
    'wedding_places',
  'follow-up places',
)
assert(
  parseAssistantSemanticRequest('a plan dnia?').kind === 'wedding_day_plan',
  'follow-up plan',
)
assert(
  parseAssistantSemanticRequest('a ile zostało do zapłaty?').kind ===
    'wedding_finances',
  'follow-up finance',
)
assert(
  parseAssistantSemanticRequest('otwórz').kind === 'open_wedding',
  'follow-up open',
)

// weddingIdFromResponse for session context
const financeResp: AssistantResponse = {
  kind: 'finance',
  finance: {
    weddingId: 'w-fin',
    displayName: 'A i B',
    contractValue: 1,
    totalPaid: 0,
    remainingToPay: 1,
    agreedDeposit: 0,
    currency: 'PLN',
  },
}
assert(weddingIdFromResponse(financeResp) === 'w-fin', 'session from finance')

const placesResp: AssistantResponse = {
  kind: 'places',
  wedding: {
    id: 'w-pl',
    displayName: 'A i B',
    date: null,
    locationLine: null,
  },
  places: [],
}
assert(weddingIdFromResponse(placesResp) === 'w-pl', 'session from places')

// Next action must not be confused with tasks
assert(
  parseAssistantSemanticRequest('co dalej z Julią Kanicką').kind ===
    'wedding_next_action',
  'next not tasks',
)
assert(
  parseAssistantSemanticRequest('jakie zadania przy Julii Kanickiej').kind ===
    'wedding_tasks',
  'tasks not next',
)

console.log('OK assistant semantic continuation')
