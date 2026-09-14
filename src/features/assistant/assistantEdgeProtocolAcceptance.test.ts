/**
 * Edge semantic protocol acceptance (client-side validation + transport).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantEdgeProtocolAcceptance.test.ts
 */

import {
  buildEdgeInterpretationPayload,
  validateAssistantSemanticRequest,
} from './api/validateSemantic'
import { runAssistantQuery } from './api/assistantApi'
import { ASSISTANT_API_FAILURE } from './copy'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('Assistant Edge protocol acceptance')

// Valid finance semantic
const fin = validateAssistantSemanticRequest({
  kind: 'wedding_finances',
  resolver: { personQuery: 'Julia', dateHint: null, weddingId: null },
  financeAspect: 'remaining',
})
assert(fin?.kind === 'wedding_finances', 'finance ok')

// Malformed — missing kind
assert(validateAssistantSemanticRequest({ resolver: {} }) === null, 'no kind')

// Identity fields rejected
assert(
  validateAssistantSemanticRequest({
    kind: 'wedding_finances',
    ownerId: 'x',
    resolver: { personQuery: 'A', dateHint: null },
  }) === null,
  'ownerId rejected',
)

assert(
  validateAssistantSemanticRequest({
    kind: 'wedding_finances',
    resolver: { personQuery: 'A', dateHint: null, userId: 'u' },
  }) === null,
  'userId in resolver rejected',
)

// Places role
const places = validateAssistantSemanticRequest({
  kind: 'wedding_places',
  resolver: { personQuery: null, dateHint: null, weddingId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
  requestedRole: 'preparations',
})
assert(
  places?.kind === 'wedding_places' &&
    places.requestedRole === 'preparations',
  'places role',
)

// Prepare create requires fields
assert(
  validateAssistantSemanticRequest({
    kind: 'prepare_create_wedding',
    partner1: 'A',
    partner2: null,
    date: '20.09',
  }) === null,
  'create wedding incomplete',
)

assert(
  validateAssistantSemanticRequest({
    kind: 'prepare_create_wedding',
    partner1: 'Adrian',
    partner2: 'Kamil',
    date: '20.09',
  })?.kind === 'prepare_create_wedding',
  'create wedding ok',
)

// Privacy: payload has no CRM blobs
const payload = buildEdgeInterpretationPayload({
  utterance: 'a ile zostało?',
  pageContext: {
    resourceType: 'wedding',
    resourceId: '129c11c2-4a47-428e-9604-2dbfec17618e',
  },
  sessionContext: { weddingId: '129c11c2-4a47-428e-9604-2dbfec17618e' },
  recentUtterances: ['ile julia ma do zaplaty', 'wybrane'],
})
assert(payload.utterance === 'a ile zostało?', 'utterance')
assert(payload.recentUtterances.length <= 4, 'bounded recent')
assert(!('finance' in payload), 'no finance')
assert(!('places' in payload), 'no places')
assert(
  JSON.stringify(payload).includes('phone') === false &&
    JSON.stringify(payload).includes('email') === false,
  'no contact fields',
)

// Edge transport: malformed → error, never local heuristic success path
let invokes = 0
const badInvoke = async () => {
  invokes += 1
  return {
    data: { status: 'semantic', request: { kind: 'not_a_real_kind' } },
    error: null,
  }
}
const bad = await runAssistantQuery({
  userText: 'ile julia ma do zaplaty',
  transport: 'edge',
  invoke: badInvoke,
})
assert(invokes === 1, 'edge invoked')
assert(
  bad.response.kind === 'error' &&
    bad.response.message === ASSISTANT_API_FAILURE,
  'malformed → error',
)

// Edge error: no local fallback
invokes = 0
const errInvoke = async () => {
  invokes += 1
  return { data: null, error: { message: 'fail' } }
}
const err = await runAssistantQuery({
  userText: 'co mam jutro',
  transport: 'edge',
  invoke: errInvoke,
})
assert(invokes === 1, 'edge error invoke')
assert(err.response.kind === 'error', 'no heuristic fallback')

// Semantic continuation skips Edge
invokes = 0
const cont = await runAssistantQuery({
  userText: 'Julia Kanicka',
  transport: 'edge',
  invoke: badInvoke,
  semanticRequest: {
    kind: 'wedding_finances',
    resolver: {
      personQuery: 'Julia',
      dateHint: null,
      weddingId: '129c11c2-4a47-428e-9604-2dbfec17618e',
    },
  },
})
assert(invokes === 0, 'continuation skips edge')
// May be error/no-match without live auth — but must not be heuristic schedule
assert(cont.response.kind !== 'schedule', 'not schedule')

console.log('OK assistant Edge protocol acceptance')
