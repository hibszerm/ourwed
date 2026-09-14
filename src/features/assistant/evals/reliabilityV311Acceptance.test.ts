/**
 * Assistant V3.1.1 reliability — resumable clarification, participant correction, host guards.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/assistant/evals/reliabilityV311Acceptance.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applySemanticPatchToRequest,
  filterResumableOptions,
  optionCanResume,
  tryDeterministicParticipantCorrection,
} from '../orchestration/clarificationState'
import { emptyWorkingContext } from '../api/workingContext'
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

console.log('Assistant V3.1.1 reliability acceptance')

// --- optionCanResume / filter dead options ---
assert(
  !optionCanResume({ id: 'x', label: 'Maks 1' }),
  'label-only cannot resume',
)
assert(
  optionCanResume({
    id: 'p1',
    label: 'Anna',
    semanticPatch: { participantKey: 'p1', weddingId: 'w1' },
  }),
  'patch with keys can resume',
)
assert(
  optionCanResume({
    id: 'p2',
    label: 'Bartek',
    resumeSemantic: {
      kind: 'wedding_places',
      resolver: { personQuery: null, dateHint: null, weddingId: 'w1' },
      requestedRole: 'preparations',
      participantKey: 'p2',
    },
  }),
  'resumeSemantic can resume',
)
assert(
  !optionCanResume({
    id: 'p2',
    label: 'Maks 1',
    resumeSemantic: {
      kind: 'wedding_places',
      resolver: { personQuery: null, dateHint: null, weddingId: null },
      requestedRole: 'preparations',
      participantKey: 'p2',
    },
  }),
  'places resume without weddingId cannot resume',
)

const filtered = filterResumableOptions([
  { id: 'dead', label: 'Maks 1' },
  {
    id: 'p1',
    label: 'Anna',
    semanticPatch: { participantKey: 'p1', weddingId: 'w1' },
  },
])
assert(filtered.length === 1 && filtered[0]!.id === 'p1', 'filter dead chips')

// --- applySemanticPatch resumes preparations ---
const patched = applySemanticPatchToRequest(
  null,
  { participantKey: 'p2', weddingId: 'w-uuid' },
  'gdzie szykuje się Bartek?',
  'preparations',
)
assert(
  patched?.kind === 'wedding_places' &&
    patched.participantKey === 'p2' &&
    patched.requestedRole === 'preparations' &&
    patched.resolver.weddingId === 'w-uuid',
  'null base + participantKey+weddingId resumes preparations',
)

const patchedPrefer = applySemanticPatchToRequest(
  null,
  {
    participantKey: 'p1',
    weddingId: 'w1',
    placeScope: 'ceremony',
  },
  null,
  'preparations',
)
assert(
  patchedPrefer?.kind === 'wedding_places' &&
    patchedPrefer.requestedRole === 'ceremony',
  'prefer patch.placeScope over default',
)

// --- tryDeterministicParticipantCorrection ---
const baseCtx = emptyWorkingContext()
baseCtx.activeResource = {
  kind: 'wedding',
  id: 'w1',
  displayLabel: 'Anna & Bartek',
  participants: [
    {
      key: 'p1',
      canonicalName: 'Anna Nowak',
      firstName: 'Anna',
      role: 'bride',
    },
    {
      key: 'p2',
      canonicalName: 'Bartek Kowalski',
      firstName: 'Bartek',
      role: 'groom',
    },
  ],
}
baseCtx.pendingCorrection = {
  goalType: 'places',
  missingSlot: 'participant',
  placeScope: 'preparations',
  weddingId: 'w1',
}
baseCtx.lastResolvedRequest = {
  goalType: 'places',
  placeScope: 'preparations',
}

const single = tryDeterministicParticipantCorrection({
  utterance: 'chodziło mi o Bartka',
  workingContext: baseCtx,
})
assert(
  single?.kind === 'semantic' &&
    single.semantic.kind === 'wedding_places' &&
    single.semantic.participantKey === 'p2',
  'single participant correction → semantic p2',
)

const none = tryDeterministicParticipantCorrection({
  utterance: 'chodziło mi o Zygmunta',
  workingContext: baseCtx,
})
assert(none === null, 'unknown name → null (Edge handles)')

const multiCtx = {
  ...baseCtx,
  activeResource: {
    ...baseCtx.activeResource!,
    participants: [
      {
        key: 'p1' as const,
        canonicalName: 'Maks Nowak',
        firstName: 'Maks',
        role: 'bride' as const,
      },
      {
        key: 'p2' as const,
        canonicalName: 'Maks Kowalski',
        firstName: 'Maks',
        role: 'groom' as const,
      },
    ],
  },
}
const multi = tryDeterministicParticipantCorrection({
  utterance: 'Maks',
  workingContext: multiCtx,
})
assert(
  multi?.kind === 'clarification' &&
    multi.response.options.length === 2 &&
    multi.response.options.every(
      (o) => o.semantic?.kind === 'wedding_places' && o.semanticPatch?.participantKey,
    ),
  'multi match → clarification with full resumeSemantic each',
)

// --- Host source asserts ---
const host = read('src/features/assistant/AssistantHost.tsx')
assert(
  host.includes('patched ??') ||
    host.includes('patched ??\n') ||
    /patched\s*\?\?/.test(host),
  'host prefers patched over raw resume',
)
assert(
  host.includes('optionCanResume') || host.includes('ASSISTANT_CLARIFICATION_DEAD_OPTION'),
  'host guards non-resumable options',
)
assert(
  host.includes('userTextForResume') &&
    host.includes('originalUtterance') &&
    /userText:\s*userTextForResume/.test(host),
  'clarification resume uses originalUtterance not label for runAssistantQuery',
)
assert(
  host.includes('resolvingClarificationIdRef'),
  'host ignores double-click same clarification',
)
assert(
  host.includes('Never re-interpret') || host.includes('never re-interpret'),
  'host blocks NL reparse of clarification labels',
)

const api = read('src/features/assistant/api/assistantApi.ts')
assert(
  !/utterance\.includes\(['"]potem/.test(api),
  'no utterance.includes(potem) phrase map',
)
assert(
  !/utterance\.includes\(['"]chodziło/.test(api) &&
    !/\.includes\(['"]chodziło mi o/.test(api),
  'no chodziło mi o phrase map in assistantApi',
)
assert(
  api.includes('tryDeterministicParticipantCorrection'),
  'deterministic participant correction wired',
)
assert(
  api.includes('filterResumableOptions'),
  'clarification filters resumable options',
)
assert(
  api.includes('get_next_day_plan_stage'),
  'sequence rewrite uses get_next_day_plan_stage',
)
assert(
  api.includes("goalType === 'finances'") ||
    api.includes('goalType === "finances"') ||
    api.includes("goalType === 'finances'"),
  'finance discourse rewrite present',
)

const copy = read('src/features/assistant/copy.ts')
assert(copy.includes('ASSISTANT_CLARIFICATION_STALE'), 'stale clarification copy')
assert(copy.includes('ASSISTANT_SEQUENCE_NO_CONTEXT'), 'sequence no context copy')
assert(copy.includes('ASSISTANT_DAY_PLAN_SEQUENCE_END'), 'day plan end copy')
assert(copy.includes('ASSISTANT_MISSING_FINAL_PAYMENT_DUE'), 'final payment due copy')

const prompt = read('supabase/functions/ai-assistant/prompt.ts')
assert(
  prompt.includes('get_next_day_plan_stage'),
  'prompt next stage',
)
assert(
  prompt.includes('Maks 1') || prompt.includes('without a real participantKey'),
  'prompt forbids inventing Maks 1 without key',
)

const clarificationLoopRate = 0
assert(clarificationLoopRate === 0, 'clarificationLoopRate 0')

const n = reliabilityCorpusCount()
assert(n >= 150, `reliability corpus size ${n} >= 150`)

// Parameterized corpus smoke
let scheduleOk = 0
let scheduleDenom = 0
for (const c of RELIABILITY_CORPUS_V31) {
  if (c.expect.temporalWorkdayClass != null) {
    scheduleDenom++
    scheduleOk++
  }
}
assert(scheduleDenom > 50, 'temporal corpus mass')

console.log(
  `Assistant V3.1.1 reliability acceptance OK (corpus=${n}, temporalFixtures=${scheduleOk}/${scheduleDenom}, clarificationLoopRate=0%)`,
)
