/**
 * Assistant V2.1 — participant resolution + place scope acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/assistantV21NaturalConversationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  matchParticipantByNameQuery,
  participantsFromCouple,
  placeRoleForParticipant,
  resolveParticipantReference,
} from './api/participants'
import {
  buildModelWorkingContext,
  emptyWorkingContext,
} from './api/workingContext'
import { validateAssistantSemanticRequest } from './api/validateSemantic'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

console.log('Assistant V2.1 natural conversation acceptance')

const candidates = participantsFromCouple({
  partner1: 'Julia Kanicka',
  partner2: 'Maksymilian Ruth',
})
assert(candidates.length === 2, 'two participants')
assert(candidates[0]!.key === 'p1' && candidates[0]!.role === 'bride', 'p1 bride')
assert(candidates[1]!.key === 'p2' && candidates[1]!.role === 'groom', 'p2 groom')

// Name match — NO nickname dictionary
assert(
  matchParticipantByNameQuery(candidates, 'Julia') === 'p1',
  'Julia → p1',
)
assert(
  matchParticipantByNameQuery(candidates, 'Maksymilian') === 'p2',
  'Maksymilian → p2',
)
assert(
  matchParticipantByNameQuery(candidates, 'Maks') === null,
  'Maks is NOT hard-matched (model responsibility)',
)
assert(
  matchParticipantByNameQuery(candidates, 'Bartek') === null,
  'Bartek unknown',
)
assert(
  matchParticipantByNameQuery(candidates, 'panna młoda') === 'p1',
  'role language bride',
)
assert(
  matchParticipantByNameQuery(candidates, 'pan młody') === 'p2',
  'role language groom',
)

assert(
  resolveParticipantReference({
    candidates,
    participantKey: 'p2',
    personQuery: 'Maks',
  }).status === 'resolved' &&
    (
      resolveParticipantReference({
        candidates,
        participantKey: 'p2',
      }) as { key: string }
    ).key === 'p2',
  'model key wins for Maks',
)

assert(
  resolveParticipantReference({
    candidates,
    personQuery: 'Maks',
  }).status === 'not_found',
  'Maks without key fails closed',
)

assert(
  resolveParticipantReference({
    candidates,
    personQuery: 'Bartek',
  }).status === 'not_found',
  'Bartek fails closed',
)

assert(placeRoleForParticipant('p1') === 'bride_preparation', 'p1 prep role')
assert(placeRoleForParticipant('p2') === 'groom_preparation', 'p2 prep role')

const placesSem = validateAssistantSemanticRequest({
  kind: 'wedding_places',
  resolver: { personQuery: null, dateHint: null, weddingId: 'w1' },
  requestedRole: 'preparations',
  participantKey: 'p2',
})
assert(
  placesSem?.kind === 'wedding_places' &&
    placesSem.participantKey === 'p2' &&
    placesSem.requestedRole === 'preparations',
  'places semantic with participant',
)

const scoped = validateAssistantSemanticRequest({
  kind: 'wedding_places',
  resolver: { personQuery: 'Julia', dateHint: null },
  requestedRole: 'reception',
  participantKey: null,
})
assert(
  scoped?.kind === 'wedding_places' && scoped.requestedRole === 'reception',
  'reception scope',
)

assert(
  validateAssistantSemanticRequest({
    kind: 'wedding_places',
    resolver: { personQuery: null, dateHint: null },
    requestedRole: 'preparations',
    participantKey: 'p9',
  })?.kind === 'wedding_places' &&
    (validateAssistantSemanticRequest({
      kind: 'wedding_places',
      resolver: { personQuery: null, dateHint: null },
      requestedRole: 'preparations',
      participantKey: 'p9',
    }) as { participantKey?: unknown }).participantKey === undefined,
  'invalid participantKey ignored',
)

const ctx = emptyWorkingContext()
assert(ctx.activeParticipant === null, 'empty activeParticipant')
assert(ctx.lastDirectContext === null, 'empty lastDirect')

const model = buildModelWorkingContext({
  ...emptyWorkingContext(),
  activeResource: {
    kind: 'wedding',
    id: 'w1',
    displayLabel: 'Julia Kanicka i Maksymilian Ruth',
    participants: candidates,
  },
  activeParticipant: {
    weddingId: 'w1',
    participantKey: 'p2',
    displayLabel: 'Maksymilian Ruth',
  },
  lastDirectContext: {
    intent: 'wedding_places',
    placeScope: 'preparations',
    participantKey: 'p2',
  },
})
const blob = JSON.stringify(model)
assert(blob.includes('Maksymilian'), 'model gets name')
assert(blob.includes('"p2"'), 'model gets key')
assert(!blob.includes('address'), 'no address')
assert(!blob.includes('phone'), 'no phone')
assert(!blob.includes('Villa'), 'no venue leak')

const tool = read('src/features/assistant/tools/executeTool.ts')
assert(tool.includes('bride_preparation'), 'tool emits bride prep')
assert(tool.includes('groom_preparation'), 'tool emits groom prep')
assert(
  !tool.includes('Prefer bride prep as "preparations" display'),
  'bride preference collapse removed',
)

const exec = read('src/features/assistant/api/executeSemantic.ts')
assert(exec.includes('ASSISTANT_PARTICIPANT_NOT_FOUND'), 'fail closed copy')
assert(exec.includes('resolveParticipantReference'), 'participant resolve')
assert(
  !exec.includes('filtered.length > 0 ? filtered : (d.places ?? [])'),
  'no expand scoped → all places',
)

const prompt = read('supabase/functions/ai-assistant/prompt.ts')
assert(prompt.includes('participantKey'), 'prompt participantKey')
assert(prompt.includes('ENTITY vs PARTICIPANT'), 'entity vs participant')
assert(prompt.includes('Maks'), 'few-shot Maks')
assert(!/Maks\s*=\s*Maksymilian/.test(prompt), 'no hard alias dict')

const schema = read('supabase/functions/ai-assistant/schema.ts')
assert(schema.includes('participantKey'), 'schema participantKey')
assert(schema.includes('bride_preparation'), 'schema prep roles')

const renderer = read(
  'src/features/assistant/components/AssistantResponseRenderer.tsx',
)
assert(
  renderer.includes('response.places.length === 1'),
  'renderer single-scope hero',
)

console.log('OK assistant V2.1 natural conversation acceptance')
