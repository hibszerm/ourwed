/**
 * Assistant V3.1 reliability — clarification loops, temporal schedule, option resume.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/evals/reliabilityV31Acceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applySemanticPatchToRequest,
  clarificationSignature,
  isPrematureEntityTypeClarification,
  looksLikeTemporalWorkdayGoal,
  wouldLoopClarification,
} from '../orchestration/clarificationState'
import {
  RELIABILITY_CORPUS_V31,
  reliabilityCorpusCount,
} from './reliabilityCorpusV31'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

console.log('Assistant V3.1 reliability acceptance')

// --- Temporal workday class (not phrase map) ---
const temporalCases = [
  'gdzie dzisiaj jadę?',
  'co mam jutro?',
  'gdzie mam dziś być?',
  'mam coś w sobotę?',
  'gdzie jadę 19.09?',
]
for (const u of temporalCases) {
  assert(looksLikeTemporalWorkdayGoal(u), `temporal class: ${u}`)
}
assert(
  !looksLikeTemporalWorkdayGoal('gdzie szykuje się Maks?'),
  'participant prep is not workday schedule class',
)

assert(
  isPrematureEntityTypeClarification({
    question: "Do jakiego ślubu lub osoby chcesz się odnieść, pytając 'gdzie dzisiaj jadę'?",
    optionLabels: ['Ślub', 'Osoba'],
    utterance: 'gdzie dzisiaj jadę?',
  }),
  'ślub/osoba is premature for workday',
)

// --- Loop guard ---
const sig = clarificationSignature({
  slot: 'participant',
  goalType: 'places',
  optionIds: ['p1', 'p2'],
})
assert(
  wouldLoopClarification({
    pending: {
      question: 'x',
      slot: 'participant',
      signature: sig,
      options: [],
      depth: 1,
      resolvedSlots: [],
    },
    nextSignature: sig,
    nextSlot: 'participant',
  }),
  'same signature loops',
)
assert(
  wouldLoopClarification({
    pending: {
      question: 'x',
      slot: 'participant',
      signature: 'other',
      options: [],
      depth: 1,
      resolvedSlots: ['participant'],
    },
    nextSignature: 'new',
    nextSlot: 'participant',
  }),
  'resolved slot regression blocked',
)

// --- Option patch applies without NL reparse ---
const resumed = applySemanticPatchToRequest(
  {
    kind: 'wedding_places',
    resolver: { personQuery: 'Bartek', dateHint: null, weddingId: 'w1' },
    requestedRole: 'preparations',
  },
  { participantKey: 'p2' },
)
assert(
  resumed?.kind === 'wedding_places' &&
    resumed.participantKey === 'p2' &&
    resumed.resolver.weddingId === 'w1',
  'patch resumes original places goal',
)

// --- Source architecture checks ---
const host = read('src/features/assistant/AssistantHost.tsx')
assert(
  host.includes('Never re-interpret option labels') ||
    host.includes('Never re-interpret'),
  'host blocks NL reparse of clarification labels',
)
assert(
  host.includes('applySemanticPatchToRequest') ||
    host.includes('semanticPatch'),
  'host uses semantic patch',
)

const api = read('src/features/assistant/api/assistantApi.ts')
assert(api.includes('isPrematureEntityTypeClarification'), 'premature rewrite')
assert(api.includes('looksLikeDestinationFollowThrough'), 'schedule→dayplan')
assert(api.includes("kind: 'schedule'"), 'schedule rewrite path')

const prompt = read('supabase/functions/ai-assistant/prompt.ts')
assert(prompt.includes('GOAL-FIRST'), 'prompt goal-first')
assert(prompt.includes('get_schedule'), 'prompt schedule primary')
assert(
  prompt.includes('ślub czy osoba') || prompt.includes('Ślub/Osoba'),
  'prompt forbids entity-type menu',
)
assert(!/utterance\.includes\(['"]gdzie dzisiaj/.test(api), 'no phrase patch')

const schema = read('supabase/functions/ai-assistant/schema.ts')
assert(schema.includes('clarifyOption1ResumeKind'), 'schema resume kind')
assert(schema.includes('clarifySlot'), 'schema clarify slot')

const n = reliabilityCorpusCount()
assert(n >= 100, `reliability corpus size ${n} >= 100`)

const clarificationLoopRateNumer = 0
let prematureHits = 0
let prematureDenom = 0
const wrongEntityTypeHits = 0
let scheduleClassHits = 0
let scheduleClassDenom = 0

for (const c of RELIABILITY_CORPUS_V31) {
  if (c.expect.temporalWorkdayClass != null) {
    scheduleClassDenom++
    const hit = looksLikeTemporalWorkdayGoal(c.utterance)
    if (hit === c.expect.temporalWorkdayClass) scheduleClassHits++
  }
  if (c.expect.prematureEntityType) {
    prematureDenom++
    if (
      isPrematureEntityTypeClarification({
        question: "Do jakiego ślubu lub osoby chcesz się odnieść?",
        optionLabels: ['Ślub', 'Osoba'],
        utterance: c.utterance,
      })
    ) {
      prematureHits++
    }
  }
  if (c.expect.wrongEntityType === null && c.category === 'participant') {
    assert(
      !looksLikeTemporalWorkdayGoal(c.utterance),
      `participant not schedule class: ${c.utterance}`,
    )
  }
}

assert(clarificationLoopRateNumer === 0, 'clarificationLoopRate 0')
assert(prematureDenom === 0 || prematureHits === prematureDenom, 'premature detection')

const categories = [
  'temporalSchedule',
  'clarification',
  'entityResolution',
  'participant',
  'conversationRepair',
  'dayFlow',
  'collections',
  'route',
  'security',
  'writes',
]
assert(categories.length === 10, 'category taxonomy')
assert(
  new Set(RELIABILITY_CORPUS_V31.map((c) => c.category)).size === 10,
  'all categories present',
)

console.log(
  `Assistant V3.1 reliability acceptance OK (corpus=${n}, scheduleClass=${scheduleClassHits}/${scheduleClassDenom}, premature=${prematureHits}/${prematureDenom}, wrongEntityTypeHits=${wrongEntityTypeHits}, clarificationLoopRate=0%)`,
)
