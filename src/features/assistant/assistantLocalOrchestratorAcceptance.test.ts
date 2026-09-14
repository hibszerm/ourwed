/**
 * Assistant transport + DEV/PROD policy acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantLocalOrchestratorAcceptance.test.ts
 */

import {
  ASSISTANT_API_FAILURE,
  ASSISTANT_NO_MATCH,
  ASSISTANT_UNRECOGNIZED,
} from './copy'
import {
  __resetAssistantDevEdgeCacheForTests,
  runAssistantQuery,
} from './api/assistantApi'
import { resolveAssistantTransport } from './api/transport'
import {
  extractPersonName,
  parseAssistantDevIntent,
  polishPersonSearchQueries,
  weddingMatchesDateHint,
} from './api/intentParse'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('Assistant local orchestrator acceptance')

assert(resolveAssistantTransport({ force: 'local' }) === 'local', 'force local')
assert(resolveAssistantTransport({ force: 'edge' }) === 'edge', 'force edge')

// --- person / date extraction ---
assert(
  extractPersonName('Ile do zapłaty ma Aleksandra z 12.09') === 'Aleksandra',
  'finance ma NAME + date',
)
assert(
  extractPersonName('Ile zostało do zapłaty u Aleksandry?') === 'Aleksandry',
  'finance u NAME genitive',
)
assert(
  extractPersonName('Gdzie przygotowania ma Aleksandra?') === 'Aleksandra',
  'places ma NAME',
)
assert(
  extractPersonName('Otwórz zlecenie Aleksandry') === 'Aleksandry',
  'open genitive',
)
assert(
  extractPersonName('Otwórz sesję Aleksandry') === 'Aleksandry',
  'session genitive',
)

const variants = polishPersonSearchQueries('Aleksandry')
assert(variants.some((v) => /aleksandra/i.test(v)), 'genitive → nominative')

assert(weddingMatchesDateHint('2026-09-12', '12.09') === true, 'date hint')

assert(parseAssistantDevIntent('Co mam jutro?').kind === 'schedule', 'schedule')
assert(
  parseAssistantDevIntent('Ile do zapłaty ma Aleksandra z 12.09').kind ===
    'finance',
  'finance intent',
)
assert(
  parseAssistantDevIntent('Gdzie przygotowania ma Aleksandra?').kind ===
    'places',
  'places intent',
)
assert(
  parseAssistantDevIntent('Otwórz zlecenie Aleksandry').kind === 'open_wedding',
  'open wedding',
)
assert(
  parseAssistantDevIntent('Otwórz sesję Aleksandry').kind === 'open_session',
  'open session',
)
assert(
  parseAssistantDevIntent('Otwórz Aleksandrę').kind === 'open_resource',
  'generic open resource',
)
assert(
  parseAssistantDevIntent('co dalej z Julią').kind === 'next_action',
  'next action',
)
assert(
  parseAssistantDevIntent('jakie mam zadania przy Julii').kind === 'tasks',
  'tasks',
)
assert(parseAssistantDevIntent('xyzzy plugh 12345').kind === 'unrecognized', 'unrecognized')
assert(ASSISTANT_UNRECOGNIZED !== ASSISTANT_NO_MATCH, 'distinct copies')

// --- LOCAL transport never invokes Edge ---
__resetAssistantDevEdgeCacheForTests()
let edgeInvokes = 0
const countingInvoke = async () => {
  edgeInvokes += 1
  return { data: null, error: { message: '404' } }
}

const local = await runAssistantQuery({
  userText: 'xyzzy plugh 12345',
  invoke: countingInvoke,
  transport: 'local',
})
assert(edgeInvokes === 0, 'local transport: zero Edge invokes')
assert(
  local.response.kind === 'error' &&
    local.response.message === ASSISTANT_UNRECOGNIZED,
  'local orchestrator',
)

// --- EDGE transport: failure never uses local heuristic ---
edgeInvokes = 0
const edgeFail = await runAssistantQuery({
  userText: 'xyzzy plugh 12345',
  invoke: countingInvoke,
  transport: 'edge',
})
assert(edgeInvokes === 1, 'edge transport invokes once')
assert(
  edgeFail.response.kind === 'error' &&
    edgeFail.response.message === ASSISTANT_API_FAILURE,
  'edge fail = API failure, not unrecognized',
)

console.log('OK assistant local orchestrator acceptance')
