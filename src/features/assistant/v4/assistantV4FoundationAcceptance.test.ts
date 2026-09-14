/**
 * Assistant V4 Phase 0–2 — TaskSpec schema + golden contract + shadow safety.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/v4/assistantV4FoundationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  compareCoarse,
  taskSpecToCoarse,
  v3DomainToCoarse,
} from './compare'
import { matchTaskSpecExpectation, makeTaskSpec } from './expect'
import { isAssistantV4ShadowEnabled, isAssistantV4FinanceExecutionEnabled } from './flag'
import {
  parseFlatTaskSpecPayload,
  validateAssistantTaskSpec,
} from './taskSpecSchema'
import { ASSISTANT_V4_BENCHMARK_CORPUS } from './benchmark/corpus'
import { corpusStats } from './benchmark/runner'
import { UNSEEN_PARAPHRASE_CASES } from './benchmark/fixtures'
import { runResolutionBenchmark } from './benchmark/resolutionCorpus'
import { ASSISTANT_V4_HOLDOUT_CORPUS } from './benchmark/holdoutCorpus'
import { ASSISTANT_V4_MULTITURN_AB_CORPUS } from './benchmark/multiTurnAbCorpus'
import { CORRECTION_PROTOCOL_REVIEW } from './benchmark/protocolReview'
import { ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS } from './benchmark/subjectDistanceCorpus'
import { ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT } from './benchmark/holdoutSubjectDistance'
import { SUBJECT_DISTANCE_CONTRACT_V27 } from './benchmark/subjectDistanceContract'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

console.log('Assistant V4 foundation acceptance')

// --- A. Schema ---
const good = validateAssistantTaskSpec({
  version: 1,
  op: 'get_time',
  subject: 'ceremony',
  resource: { kind: 'inherit' },
  participant: null,
  temporal: null,
  qualifiers: {
    aspect: null,
    rank: null,
    destination: null,
    titleHint: null,
    unsupportedReason: null,
  },
  correction: null,
  fieldSource: {
    op: 'explicit',
    subject: 'explicit',
    resource: 'inherit',
    participant: 'omitted',
    temporal: 'omitted',
  },
})
assert(good?.op === 'get_time' && good.subject === 'ceremony', 'valid get_time ceremony')

assert(
  validateAssistantTaskSpec({
    version: 1,
    op: 'get_wedding_places',
    subject: 'ceremony',
    resource: null,
    participant: null,
    temporal: null,
    qualifiers: {},
    correction: null,
    fieldSource: {},
  }) === null,
  'reject capability-like op',
)

assert(
  validateAssistantTaskSpec({
    version: 1,
    op: 'get_location',
    subject: 'preparations',
    resource: null,
    participant: {
      kind: 'explicit',
      value: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    },
    temporal: null,
    qualifiers: {
      aspect: null,
      rank: null,
      destination: null,
      titleHint: null,
      unsupportedReason: null,
    },
    correction: null,
    fieldSource: {
      op: 'explicit',
      subject: 'explicit',
      resource: 'omitted',
      participant: 'explicit',
      temporal: 'omitted',
    },
  }) === null,
  'reject UUID participant',
)

const flat = parseFlatTaskSpecPayload({
  version: 1,
  op: 'get_next',
  subject: null,
  resourceKind: 'sequence_cursor',
  resourceValue: null,
  participantKind: null,
  participantValue: null,
  temporalPhrase: null,
  temporalKind: null,
  aspect: null,
  rank: null,
  destination: null,
  titleHint: null,
  unsupportedReason: null,
  correctionTargetSlot: null,
  fieldSourceOp: 'explicit',
  fieldSourceSubject: 'omitted',
  fieldSourceResource: 'inherit',
  fieldSourceParticipant: 'omitted',
  fieldSourceTemporal: 'omitted',
})
assert(flat?.op === 'get_next', 'flat get_next')

// --- B. Golden expected contracts (deterministic TaskSpecs) ---
const ceremony = makeTaskSpec({
  op: 'get_time',
  subject: 'ceremony',
  resource: { kind: 'inherit' },
  fieldSource: {
    op: 'explicit',
    subject: 'explicit',
    resource: 'inherit',
    participant: 'omitted',
    temporal: 'omitted',
  },
})
assert(
  matchTaskSpecExpectation(ceremony, {
    op: 'get_time',
    subject: 'ceremony',
    requireExplicitSubject: true,
  }).ok,
  'golden ceremony expectation',
)

const potem = makeTaskSpec({
  op: 'get_next',
  resource: { kind: 'sequence_cursor' },
})
assert(matchTaskSpecExpectation(potem, { op: 'get_next' }).ok, 'golden potem')

const today = makeTaskSpec({
  op: 'get_location',
  subject: 'assignment',
  temporal: { phrase: 'dzisiaj', kind: 'day' },
})
assert(
  matchTaskSpecExpectation(today, {
    op: 'get_location',
    subject: 'assignment',
    temporalPhraseIncludes: ['dziś', 'dzisiaj'],
  }).ok,
  'golden today',
)

const corr = makeTaskSpec({
  op: 'correction',
  correction: {
    targetSlot: 'participant',
    patch: { participant: { kind: 'explicit', value: 'Maks' } },
  },
  fieldSource: {
    op: 'correction',
    subject: 'omitted',
    resource: 'omitted',
    participant: 'correction',
    temporal: 'omitted',
  },
})
assert(
  matchTaskSpecExpectation(corr, {
    op: 'correction',
    participantValue: 'Maks',
    requireCorrection: true,
  }).ok,
  'golden bartek correction',
)

const julka = makeTaskSpec({
  op: 'inherit',
  participant: { kind: 'explicit', value: 'Julka' },
  fieldSource: {
    op: 'inherit',
    subject: 'inherit',
    resource: 'inherit',
    participant: 'explicit',
    temporal: 'omitted',
  },
})
assert(
  matchTaskSpecExpectation(julka, {
    op: 'inherit',
    participantValue: 'Julka',
    requireInheritSignal: true,
  }).ok,
  'golden julka',
)

// --- C. Corpus size ---
const stats = corpusStats()
assert(stats.total >= 200, `corpus >=200 (got ${stats.total})`)
assert(stats.multiTurnTurns >= 50, `multi-turn turns >=50 (got ${stats.multiTurnTurns})`)
assert(stats.conversations >= 10, `conversations >=10 (got ${stats.conversations})`)
assert(UNSEEN_PARAPHRASE_CASES.length >= 40, 'unseen >=40')
assert(
  ASSISTANT_V4_BENCHMARK_CORPUS.some((c) => c.id === 'golden-ceremony-override'),
  'ceremony golden present',
)

// Phase 2.6 holdout / multi-turn A/B corpus contracts (no prompt tuning)
assert(ASSISTANT_V4_HOLDOUT_CORPUS.length >= 50, 'holdout >=50')
assert(
  ASSISTANT_V4_HOLDOUT_CORPUS.every((c) => c.tags?.includes('holdout')),
  'holdout tagged',
)
{
  const corrH = ASSISTANT_V4_HOLDOUT_CORPUS.filter((c) =>
    c.tags?.includes('holdout-correction'),
  ).length
  assert(corrH >= 20, `holdout corrections >=20 (got ${corrH})`)
  const mtBy = new Map<string, number>()
  for (const c of ASSISTANT_V4_MULTITURN_AB_CORPUS) {
    if (!c.conversationId) continue
    mtBy.set(c.conversationId, (mtBy.get(c.conversationId) ?? 0) + 1)
  }
  assert(mtBy.size >= 20, `multiturn convos >=20 (got ${mtBy.size})`)
  assert(
    [...mtBy.values()].filter((n) => n >= 6).length >= 10,
    'multiturn 6+ turns >=10',
  )
  assert(
    CORRECTION_PROTOCOL_REVIEW.summary.everyCorrectionRequiresOpCorrection ===
      false,
    'protocol review documents dual semantics',
  )
  assert(
    ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS.length >= 60,
    `subject suite >=60 (got ${ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS.length})`,
  )
  assert(
    ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT.length >= 25,
    `subject holdout >=25 (got ${ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT.length})`,
  )
  assert(
    SUBJECT_DISTANCE_CONTRACT_V27.distance.oneEndpoint.destinationQualifier.includes(
      'NOT required',
    ),
    'one-endpoint destination optional',
  )
}


// --- D. Shadow flag default ---
assert(isAssistantV4ShadowEnabled() === false, 'shadow default off in test env')
assert(
  isAssistantV4FinanceExecutionEnabled() === false,
  'finance execution default off in test env',
)

// --- E. Comparison coarse ---
const v3Wrong = v3DomainToCoarse({
  kind: 'plan',
  goal: 'next',
  steps: [
    {
      id: '1',
      capability: 'get_next_day_plan_stage',
      input: {},
    },
  ],
})
const v4Right = taskSpecToCoarse(ceremony)
assert(v3Wrong?.isPlanNextStage === true, 'v3 next stage')
assert(v4Right.opFamily === 'time', 'v4 time')
assert(
  compareCoarse(v4Right, v3Wrong!).overallAgree === false,
  'disagree on ceremony vs next',
)

// --- F. Edge protocol isolation ---
const edgeIndex = read('supabase/functions/ai-assistant/index.ts')
assert(edgeIndex.includes("mode === 'v4_interpret'"), 'v4 mode branch')
assert(edgeIndex.includes('V4_INTERPRETER_SYSTEM_PROMPT'), 'v4 prompt import')
assert(edgeIndex.includes('ASSISTANT_V4_TASKSPEC_JSON_SCHEMA'), 'v4 schema import')
assert(edgeIndex.includes('SYSTEM_PROMPT'), 'v3 prompt still present')
assert(edgeIndex.includes('ASSISTANT_SEMANTIC_JSON_SCHEMA'), 'v3 schema still present')
assert(edgeIndex.includes('resolveV4InterpreterModel'), 'v4 model resolver used')
assert(edgeIndex.includes('resolveAssistantModel'), 'v3 model resolver present')

const edgePrompt = read('supabase/functions/ai-assistant/prompt.ts')
assert(
  edgePrompt.includes("export function resolveAssistantModel"),
  'v3 resolveAssistantModel exported',
)
assert(
  edgePrompt.includes("export function resolveV4InterpreterModel"),
  'v4 resolveV4InterpreterModel exported',
)
assert(
  /resolveAssistantModel[\s\S]*?'gpt-4\.1-mini'/.test(edgePrompt),
  'v3 default remains gpt-4.1-mini',
)
assert(
  /resolveV4InterpreterModel[\s\S]*?'gpt-4\.1'/.test(edgePrompt) &&
    !/resolveV4InterpreterModel[\s\S]*?'gpt-4\.1-mini'/.test(edgePrompt),
  'v4 shadow default is gpt-4.1',
)
assert(edgeIndex.includes('V4_EVAL_MODEL_ALLOWLIST'), 'eval allowlist retained')
assert(edgeIndex.includes('eval_auth_rejected'), 'eval auth rejection retained')

const v4Prompt = read('supabase/functions/ai-assistant/v4Prompt.ts')
assert(v4Prompt.includes('Context MUST NOT override'), 'override rule')
assert(v4Prompt.includes('CORRECTION VS NEW FOLLOW-UP'), 'correction policy')
assert(v4Prompt.includes('get_next'), 'get_next taught')
assert(!v4Prompt.includes('OPENAI_API_KEY'), 'no secrets in prompt file')

const host = read('src/features/assistant/AssistantHost.tsx')
assert(host.includes('runAssistantV4Shadow'), 'host wires shadow')
assert(
  host.includes('clearAssistantV4ShadowSessionAndPending'),
  'shadow+pending cleared on close',
)
assert(
  host.includes('pageContext') &&
    read('src/features/assistant/v4/shadow.ts').includes(
      'applyPageContextToV4ShadowContext',
    ),
  'fresh open seeds page context into V4 shadow',
)
assert(host.includes('runAssistantQuery'), 'v3 path intact')

const shadow = read('src/features/assistant/v4/shadow.ts')
assert(shadow.includes('isAssistantV4ShadowEnabled'), 'flag gated')
assert(
  shadow.includes('isAssistantV4FinanceExecutionEnabled'),
  'finance execution gated separately',
)
assert(shadow.includes('resolveTaskSpec'), 'shadow runs resolver')
assert(
  shadow.includes('runV4CapabilityExecution'),
  'registry runtime shadow executor wired',
)
assert(
  shadow.includes('executePhase3AFinanceIfEligible') ||
    shadow.includes('runV4CapabilityExecution'),
  'phase3 finance/registry shadow path present',
)

const res = runResolutionBenchmark()
assert(res.total >= 120, `resolution corpus >=120 (got ${res.total})`)
assert(
  res.pass === res.total,
  `resolution 100% (pass=${res.pass}/${res.total} fail=${res.failures
    .slice(0, 8)
    .map((f) => `${f.id}:${f.detail}`)
    .join('; ')})`,
)

console.log(
  `PASS corpus=${stats.total} single=${stats.singleTurn} multiTurns=${stats.multiTurnTurns} convos=${stats.conversations} resolution=${res.pass}/${res.total}`,
)
console.log('Assistant V4 foundation acceptance — ALL PASS')
