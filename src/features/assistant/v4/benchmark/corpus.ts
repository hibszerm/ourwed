/**
 * Durable Assistant V4 semantic benchmark — meaning only (Phase 0–2).
 * Future fields (resolver/plan/fact/answer) reserved on case shape.
 */

import { buildCorrectionPhase25Cases } from './correctionCorpus'
import type { TaskSpecExpectation } from '../expect'
import type { TaskSpecSemanticContext } from '../taskSpec'

export type BenchmarkCategory =
  | 'simple_factual'
  | 'participants'
  | 'nicknames_morphology'
  | 'ellipsis'
  | 'corrections'
  | 'temporal_workday'
  | 'sequence'
  | 'collections'
  | 'route_distance'
  | 'tasks_next_action'
  | 'prepare_write'
  | 'unsupported'
  | 'ambiguity'
  | 'typos_casual'
  | 'pronouns'
  | 'multi_turn_drift'
  | 'explicit_override'

export type AssistantBenchmarkCase = {
  id: string
  category: BenchmarkCategory
  conversationId?: string
  turnIndex?: number
  tags?: string[]
  input: {
    userText: string
    semanticContext?: TaskSpecSemanticContext
  }
  expected: {
    taskSpec: TaskSpecExpectation
    /** Reserved for Phase 3+ */
    resolver?: Record<string, unknown>
    plan?: Record<string, unknown>
    fact?: Record<string, unknown>
    answer?: Record<string, unknown>
    state?: Record<string, unknown>
  }
  notes?: string
  /** Optional coarse V3 expectation for comparison harness only */
  v3Hint?: {
    preferOpFamily?: string
    knownV3Failure?: boolean
  }
}

const CTX_PREP_SEQ: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Maks',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  hasSequenceContext: true,
}

const CTX_FINANCE: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'remaining',
  currentTopic: 'finance',
  hasSequenceContext: false,
}

const CTX_SCHEDULE: TaskSpecSemanticContext = {
  activeResourceKind: null,
  previousOp: 'get_location',
  previousSubject: 'assignment',
  currentTopic: 'schedule',
  hasSequenceContext: true,
  lastTemporalPhrase: 'dziś',
}

const CTX_BARTEK: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Bartek',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  hasSequenceContext: false,
}

const CTX_COLLECTION: TaskSpecSemanticContext = {
  activeResourceKind: null,
  previousOp: 'count',
  previousSubject: 'wedding',
  currentTopic: 'collection',
  hasSequenceContext: false,
  lastTemporalPhrase: 'wrzesień',
}

function c(
  id: string,
  category: BenchmarkCategory,
  userText: string,
  taskSpec: TaskSpecExpectation,
  opts?: Partial<AssistantBenchmarkCase>,
): AssistantBenchmarkCase {
  return {
    id,
    category,
    input: {
      userText,
      semanticContext: opts?.input?.semanticContext,
    },
    expected: { taskSpec, ...opts?.expected },
    notes: opts?.notes,
    conversationId: opts?.conversationId,
    turnIndex: opts?.turnIndex,
    tags: opts?.tags,
    v3Hint: opts?.v3Hint,
  }
}

/** Golden + matrix + generated corpus (≥150). */
export function buildAssistantV4BenchmarkCorpus(): AssistantBenchmarkCase[] {
  const cases: AssistantBenchmarkCase[] = []

  // --- Golden failures / successes ---
  cases.push(
    c(
      'golden-ceremony-override',
      'explicit_override',
      'a ślub o której będzie?',
      {
        op: 'get_time',
        subject: 'ceremony',
        requireExplicitSubject: true,
      },
      {
        input: { userText: 'a ślub o której będzie?', semanticContext: CTX_PREP_SEQ },
        tags: ['golden', 'override'],
        v3Hint: { knownV3Failure: true, preferOpFamily: 'time' },
        notes: 'Must NOT become get_next / day_plan',
      },
    ),
    c(
      'golden-potem',
      'sequence',
      'a co potem?',
      {
        op: 'get_next',
        resourceKind: 'sequence_cursor',
      },
      {
        input: { userText: 'a co potem?', semanticContext: CTX_PREP_SEQ },
        tags: ['golden', 'sequence'],
        v3Hint: { knownV3Failure: true, preferOpFamily: 'next' },
        notes: 'Allow inherit resourceKind as soft alt via runner',
      },
    ),
    c(
      'golden-today-workday',
      'temporal_workday',
      'gdzie dzisiaj jadę?',
      {
        op: 'get_location',
        subject: 'assignment',
        temporalPhraseIncludes: ['dziś', 'dzisiaj', 'today'],
        temporalKind: 'day',
      },
      { tags: ['golden'] },
    ),
    c(
      'golden-bartek-correction',
      'corrections',
      'miałem na myśli Maksa',
      {
        op: 'correction',
        participantValue: 'Maks',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
      {
        input: {
          userText: 'miałem na myśli Maksa',
          semanticContext: CTX_BARTEK,
        },
        tags: ['golden'],
      },
    ),
    c(
      'golden-julka',
      'ellipsis',
      'a Julka?',
      {
        op: 'inherit',
        participantValue: 'Julka',
        requireInheritSignal: true,
      },
      {
        input: { userText: 'a Julka?', semanticContext: CTX_PREP_SEQ },
        tags: ['golden'],
      },
    ),
    c(
      'golden-do-kiedy',
      'ellipsis',
      'do kiedy?',
      {
        op: 'get_time',
        subject: ['payment', 'remaining'],
        aspect: 'final_due',
        requireInheritSignal: true,
      },
      {
        input: { userText: 'do kiedy?', semanticContext: CTX_FINANCE },
        tags: ['golden', 'finance'],
      },
    ),
  )

  // Soften potem: resourceKind sequence_cursor OR inherit — match via optional
  const potem = cases.find((x) => x.id === 'golden-potem')
  if (potem) {
    potem.expected.taskSpec = {
      op: 'get_next',
      requireInheritSignal: false,
    }
  }

  // --- Explicit override matrix ---
  const overrides: Array<[string, string, TaskSpecExpectation]> = [
    [
      'ov-ceremonia-gdzie',
      'a ceremonia gdzie?',
      { op: 'get_location', subject: 'ceremony', requireExplicitSubject: true },
    ],
    [
      'ov-slub-kiedy',
      'a ślub o której?',
      { op: 'get_time', subject: 'ceremony', requireExplicitSubject: true },
    ],
    [
      'ov-wesele-gdzie',
      'a gdzie mają wesele?',
      {
        op: 'get_location',
        subject: ['reception', 'wedding'],
        requireExplicitSubject: true,
      },
    ],
    [
      'ov-finance-after-schedule',
      'ile oni jeszcze wiszą?',
      { op: 'get_amount', subject: 'remaining', requireExplicitSubject: true },
    ],
    [
      'ov-julia-prep-after-collection',
      'a Julia gdzie się szykuje?',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'Julia',
        requireExplicitSubject: true,
      },
    ],
    [
      'ov-reception-time',
      'o której jest przyjęcie?',
      { op: 'get_time', subject: 'reception', requireExplicitSubject: true },
    ],
    [
      'ov-ceremony-place',
      'gdzie jest ślub?',
      { op: 'get_location', subject: 'ceremony', requireExplicitSubject: true },
    ],
    [
      'ov-paid',
      'ile już wpłacili?',
      { op: 'get_amount', subject: 'paid', requireExplicitSubject: true },
    ],
    [
      'ov-contract',
      'jaka jest wartość umowy?',
      {
        op: ['get_amount', 'get'],
        subject: 'contract_value',
        requireExplicitSubject: true,
      },
    ],
    [
      'ov-next-action',
      'co mam dalej zrobić przy tym ślubie?',
      {
        op: ['get', 'get_next', 'list'],
        subject: ['next_action', 'task'],
        requireExplicitSubject: true,
      },
    ],
    [
      'ov-distance-after-finance',
      'ile km mam do przygotowań Maksa?',
      {
        op: 'get_distance',
        subject: 'preparations',
        participantValue: 'Maks',
      },
    ],
    [
      'ov-schedule-after-prep',
      'gdzie jutro jadę?',
      {
        op: 'get_location',
        subject: 'assignment',
        temporalPhraseIncludes: ['jutro'],
      },
    ],
  ]

  for (const [id, text, exp] of overrides) {
    cases.push(
      c(id, 'explicit_override', text, exp, {
        input: {
          userText: text,
          semanticContext: id.includes('collection')
            ? CTX_COLLECTION
            : id.includes('finance') || id.includes('schedule-after')
              ? CTX_SCHEDULE
              : id.includes('after-finance') || id.includes('paid') || id.includes('contract')
                ? CTX_FINANCE
                : CTX_PREP_SEQ,
        },
        tags: ['override-matrix'],
      }),
    )
  }

  // --- Ellipsis matrix ---
  const ellipsis: Array<[string, string, TaskSpecExpectation, TaskSpecSemanticContext]> = [
    [
      'el-julia',
      'a Julia?',
      { op: 'inherit', participantValue: 'Julia', requireInheritSignal: true },
      CTX_PREP_SEQ,
    ],
    [
      'el-gdzie',
      'a gdzie?',
      { op: ['get_location', 'inherit'], requireInheritSignal: true },
      CTX_PREP_SEQ,
    ],
    [
      'el-kiedy',
      'a kiedy?',
      { op: ['get_time', 'inherit'], requireInheritSignal: true },
      CTX_PREP_SEQ,
    ],
    [
      'el-ile',
      'ile?',
      { op: ['get_amount', 'inherit'], requireInheritSignal: true },
      CTX_FINANCE,
    ],
    [
      'el-do-kiedy',
      'do kiedy?',
      { op: 'get_time', aspect: 'final_due', requireInheritSignal: true },
      CTX_FINANCE,
    ],
    [
      'el-tam',
      'tam?',
      { op: ['get_location', 'inherit'], requireInheritSignal: true },
      CTX_PREP_SEQ,
    ],
    [
      'el-potem',
      'potem?',
      { op: 'get_next' },
      CTX_PREP_SEQ,
    ],
    [
      'el-dalej',
      'a dalej?',
      { op: 'get_next' },
      CTX_PREP_SEQ,
    ],
    [
      'el-nastepne',
      'następne?',
      { op: 'get_next' },
      CTX_SCHEDULE,
    ],
    [
      'el-maks',
      'a Maks?',
      { op: 'inherit', participantValue: 'Maks', requireInheritSignal: true },
      {
        ...CTX_PREP_SEQ,
        activeParticipantHint: 'Julka',
        previousSubject: 'preparations',
      },
    ],
    [
      'el-a-oni',
      'a oni?',
      { op: ['inherit', 'get_amount'], requireInheritSignal: true },
      CTX_FINANCE,
    ],
    [
      'el-a-ta-druga',
      'a ta druga?',
      { op: ['inherit', 'get', 'list'], requireInheritSignal: true },
      CTX_COLLECTION,
    ],
  ]

  for (const [id, text, exp, ctx] of ellipsis) {
    cases.push(
      c(id, 'ellipsis', text, exp, {
        input: { userText: text, semanticContext: ctx },
        tags: ['ellipsis-matrix'],
      }),
    )
  }

  // --- Corrections ---
  const corrections: Array<[string, string, TaskSpecExpectation]> = [
    [
      'corr-nie-julia-maks',
      'nie Julia, Maks',
      {
        op: 'correction',
        participantValue: 'Maks',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ],
    [
      'corr-chodzilo-maks',
      'chodziło mi o Maksa',
      {
        op: 'correction',
        participantValue: 'Maks',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ],
    [
      'corr-nie-sierpien',
      'nie sierpień, wrzesień',
      {
        op: 'correction',
        correctionSlot: 'temporal',
        temporalPhraseIncludes: ['wrzesień', 'wrzesien'],
        requireCorrection: true,
      },
    ],
    [
      'corr-nie-wartosc',
      'nie wartość umów, tylko wpłaty',
      {
        op: 'correction',
        subject: ['paid', 'payment'],
        correctionSlot: ['metric', 'subject'] as unknown as 'metric',
        requireCorrection: true,
      },
    ],
    [
      'corr-nie-ceremonia-przyjecie',
      'nie ceremonia, przyjęcie',
      {
        op: 'correction',
        subject: 'reception',
        correctionSlot: 'subject',
        requireCorrection: true,
      },
    ],
    [
      'corr-myslalem-o-julii',
      'myślałem o Julii',
      {
        op: 'correction',
        participantValue: 'Juli',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ],
    [
      'corr-raczej-pan-mlody',
      'raczej pan młody',
      {
        op: 'correction',
        participantValue: 'pan młody',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ],
    [
      'corr-nie-dzisiaj-jutro',
      'nie dzisiaj, jutro',
      {
        op: 'correction',
        temporalPhraseIncludes: ['jutro'],
        correctionSlot: 'temporal',
        requireCorrection: true,
      },
    ],
    [
      'corr-nie-doplate-umowa',
      'nie dopłatę, wartość umowy',
      {
        op: 'correction',
        subject: 'contract_value',
        requireCorrection: true,
      },
    ],
    [
      'corr-maksymilian',
      'chodzi o Maksymiliana',
      {
        op: 'correction',
        participantValue: 'Maksymilian',
        correctionSlot: 'participant',
        requireCorrection: true,
      },
    ],
  ]

  for (const [id, text, exp] of corrections) {
    // Fix awkward correctionSlot array misuse
    const fixed = { ...exp }
    if (id === 'corr-nie-wartosc') {
      fixed.correctionSlot = 'metric'
      fixed.subject = ['paid', 'payment', 'deposit']
    }
    cases.push(
      c(id, 'corrections', text, fixed, {
        input: {
          userText: text,
          semanticContext:
            id.includes('sierpien') || id.includes('dzisiaj')
              ? CTX_COLLECTION
              : id.includes('wartosc') || id.includes('doplate')
                ? CTX_FINANCE
                : CTX_BARTEK,
        },
        tags: ['correction-matrix'],
      }),
    )
  }

  // --- Temporal ---
  const temporal: Array<[string, string, TaskSpecExpectation]> = [
    [
      'tmp-dzis',
      'co mam dziś?',
      {
        op: ['get', 'get_location', 'list'],
        subject: ['assignment', 'schedule'],
        temporalPhraseIncludes: ['dziś', 'dzis', 'dzisiaj'],
      },
    ],
    [
      'tmp-jutro',
      'gdzie jutro będę?',
      {
        op: 'get_location',
        subject: 'assignment',
        temporalPhraseIncludes: ['jutro'],
      },
    ],
    [
      'tmp-sobota',
      'co tam mam w sobotę?',
      {
        op: ['get', 'get_location', 'list'],
        subject: ['assignment', 'schedule'],
        temporalPhraseIncludes: ['sobot'],
      },
    ],
    [
      'tmp-weekend',
      'gdzie jem w weekend?',
      {
        op: 'get_location',
        subject: 'assignment',
        temporalPhraseIncludes: ['weekend'],
      },
    ],
    [
      'tmp-wrzesien',
      'ile mam wesel we wrześniu?',
      {
        op: 'count',
        subject: ['wedding', 'assignment'],
        temporalPhraseIncludes: ['wrześ', 'wrzes'],
      },
    ],
    [
      'tmp-11-09',
      'co mam 11.09?',
      {
        op: ['get', 'get_location', 'list'],
        subject: ['assignment', 'schedule'],
        temporalPhraseIncludes: ['11.09', '11.09.', '11 września'],
      },
    ],
    [
      'tmp-pojutrze',
      'gdzie pojutrze jadę?',
      {
        op: 'get_location',
        subject: 'assignment',
        temporalPhraseIncludes: ['pojutrze'],
      },
    ],
    [
      'tmp-najblizsze',
      'gdzie mam najbliższe zlecenie?',
      {
        op: ['get', 'get_location', 'get_next'],
        subject: ['assignment', 'schedule'],
      },
    ],
    [
      'tmp-nastepne-zlecenie',
      'jakie mam następne zlecenie?',
      {
        op: ['get', 'get_next', 'list'],
        subject: ['assignment', 'schedule'],
      },
    ],
    [
      'tmp-sierpien-sum',
      'jaka łączna wartość wesel w sierpniu?',
      {
        op: 'sum',
        subject: ['contract_value', 'wedding'],
        temporalPhraseIncludes: ['sierp'],
      },
    ],
  ]

  for (const [id, text, exp] of temporal) {
    cases.push(c(id, 'temporal_workday', text, exp, { tags: ['temporal-matrix'] }))
  }

  // --- Simple factual / participants / distance / collections / prepare / unsupported ---
  const simple: Array<[string, BenchmarkCategory, string, TaskSpecExpectation]> = [
    [
      'sf-ceremony-time',
      'simple_factual',
      'o której jest ceremonia?',
      { op: 'get_time', subject: 'ceremony' },
    ],
    [
      'sf-wedding-place',
      'simple_factual',
      'gdzie mają wesele?',
      { op: 'get_location', subject: ['reception', 'wedding'] },
    ],
    [
      'sf-remaining',
      'simple_factual',
      'ile jeszcze wiszą?',
      { op: 'get_amount', subject: 'remaining' },
    ],
    [
      'sf-paid',
      'simple_factual',
      'ile już zapłacili?',
      { op: 'get_amount', subject: 'paid' },
    ],
    [
      'sf-next-action',
      'tasks_next_action',
      'jaka jest następna akcja?',
      { op: ['get', 'list', 'get_next'], subject: ['next_action', 'task'] },
    ],
    [
      'part-julia-prep',
      'participants',
      'gdzie szykuje się Julia?',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'Julia',
      },
    ],
    [
      'part-maks-prep',
      'participants',
      'gdzie szykuje się Maks?',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'Maks',
      },
    ],
    [
      'part-maksymilian',
      'nicknames_morphology',
      'gdzie ogarnia się Maksymilian?',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'Maksymilian',
      },
    ],
    [
      'part-pan-mlody',
      'participants',
      'gdzie szykuje się pan młody?',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'pan młody',
      },
    ],
    [
      'part-panna-mloda',
      'participants',
      'gdzie szykuje się panna młoda?',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'panna młoda',
      },
    ],
    [
      'dist-julia',
      'route_distance',
      'daleko mam na przygotowania Julii?',
      {
        op: 'get_distance',
        subject: 'preparations',
        participantValue: 'Juli',
      },
    ],
    [
      'dist-maks-km',
      'route_distance',
      'ile km tam mam do Maksa?',
      {
        op: 'get_distance',
        subject: 'preparations',
        participantValue: 'Maks',
      },
    ],
    [
      'dist-ceremony',
      'route_distance',
      'daleko jest do ceremonii?',
      {
        op: 'get_distance',
        subject: 'ceremony',
      },
    ],
    [
      'col-count-wrzesien',
      'collections',
      'ile mam wesel we wrześniu?',
      {
        op: 'count',
        subject: ['wedding', 'assignment'],
        temporalPhraseIncludes: ['wrześ', 'wrzes'],
      },
    ],
    [
      'col-rank-remaining',
      'collections',
      'które wesele we wrześniu ma największą dopłatę?',
      {
        op: 'rank',
        subject: 'remaining',
        rank: 'max',
        temporalPhraseIncludes: ['wrześ', 'wrzes'],
      },
    ],
    [
      'col-sum-paid',
      'collections',
      'ile łącznie wpłacili we wrześniu?',
      {
        op: 'sum',
        subject: ['paid', 'payment'],
        temporalPhraseIncludes: ['wrześ', 'wrzes'],
      },
    ],
    [
      'col-list-unpaid',
      'collections',
      'pokaż wesela z dopłatą',
      { op: 'list', subject: ['remaining', 'wedding', 'payment'] },
    ],
    [
      'col-min',
      'collections',
      'które ma najmniejszą wartość umowy?',
      { op: 'rank', subject: 'contract_value', rank: 'min' },
    ],
    [
      'write-task-jutro',
      'prepare_write',
      'dodaj mi zadanie jutro, żebym zadzwonił do nich',
      {
        op: 'prepare_create',
        subject: 'task',
        temporalPhraseIncludes: ['jutro'],
      },
    ],
    [
      'write-task-call',
      'prepare_write',
      'utwórz zadanie: oddzwonić do panny młodej',
      { op: 'prepare_create', subject: 'task' },
    ],
    [
      'write-wedding',
      'prepare_write',
      'dodaj ślub Anna i Piotr na 12.10',
      { op: 'prepare_create', subject: 'wedding' },
    ],
    [
      'unsup-weather',
      'unsupported',
      'jaka będzie pogoda na ślubie?',
      { op: 'unsupported' },
    ],
    [
      'unsup-email',
      'unsupported',
      'wyślij maila do pary',
      { op: 'unsupported' },
    ],
    [
      'unsup-invoice-pdf',
      'unsupported',
      'wygeneruj fakturę PDF',
      { op: 'unsupported' },
    ],
    [
      'pron-oni-wisza',
      'pronouns',
      'ile oni mi jeszcze wiszą?',
      {
        op: 'get_amount',
        subject: 'remaining',
        resourceKind: 'active_resource',
      },
    ],
    [
      'pron-tam-jade',
      'pronouns',
      'gdzie oni mają ceremonię?',
      { op: 'get_location', subject: 'ceremony' },
    ],
    [
      'casual-maks-ogarnia',
      'typos_casual',
      'maks gdzie się ogarnia',
      {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'Maks',
      },
    ],
    [
      'casual-gdze-jade',
      'typos_casual',
      'gdze jade jutro',
      {
        op: 'get_location',
        subject: 'assignment',
        temporalPhraseIncludes: ['jutro'],
      },
    ],
    [
      'casual-duzo-wisza',
      'typos_casual',
      'dużo jeszcze wiszą',
      { op: 'get_amount', subject: 'remaining' },
    ],
    [
      'casual-slub-ktorej',
      'typos_casual',
      'ślub o której',
      { op: 'get_time', subject: 'ceremony' },
    ],
    [
      'casual-potem-leca',
      'typos_casual',
      'potem gdzie lecą',
      { op: ['get_next', 'get_location'] },
    ],
    [
      'casual-sobote',
      'typos_casual',
      'co tam mam w sobote',
      {
        op: ['get', 'get_location', 'list'],
        subject: ['assignment', 'schedule'],
        temporalPhraseIncludes: ['sobot'],
      },
    ],
    [
      'casual-ile-km',
      'typos_casual',
      'ile km tam mam',
      { op: 'get_distance', subject: ['preparations', 'assignment'] },
    ],
    [
      'amb-ta',
      'ambiguity',
      'a ta?',
      { op: ['inherit', 'get', 'unsupported'], requireInheritSignal: true },
    ],
    [
      'amb-tamto',
      'ambiguity',
      'no i tamto?',
      { op: ['inherit', 'get_next', 'unsupported'] },
    ],
  ]

  for (const [id, cat, text, exp] of simple) {
    cases.push(
      c(id, cat, text, exp, {
        input: {
          userText: text,
          semanticContext:
            cat === 'pronouns' && id.includes('wisza')
              ? CTX_FINANCE
              : cat === 'ambiguity'
                ? CTX_PREP_SEQ
                : undefined,
        },
      }),
    )
  }

  // --- Multi-turn synthetic conversations (60+ turns) ---
  const convos: Array<{
    id: string
    turns: Array<{
      text: string
      ctx: TaskSpecSemanticContext
      exp: TaskSpecExpectation
    }>
  }> = [
    {
      id: 'mt-prep-julka-ceremony',
      turns: [
        {
          text: 'gdzie szykuje się Maks?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Maks',
          },
        },
        {
          text: 'a Julka?',
          ctx: CTX_PREP_SEQ,
          exp: {
            op: 'inherit',
            participantValue: 'Julka',
            requireInheritSignal: true,
          },
        },
        {
          text: 'a ślub o której będzie?',
          ctx: CTX_PREP_SEQ,
          exp: { op: 'get_time', subject: 'ceremony' },
        },
        {
          text: 'a co potem?',
          ctx: { ...CTX_PREP_SEQ, currentTopic: 'ceremony', hasSequenceContext: true },
          exp: { op: 'get_next' },
        },
        {
          text: 'daleko stamtąd do przyjęcia?',
          // Phase 2.8 truth: stamtąd=FROM prior preparations; do przyjęcia=TO reception
          ctx: { ...CTX_PREP_SEQ, currentTopic: 'day_plan', hasSequenceContext: true },
          exp: {
            op: 'get_distance',
            subject: 'preparations',
            destination: 'reception',
          },
        },
      ],
    },
    {
      id: 'mt-finance-chain',
      turns: [
        {
          text: 'ile oni mi jeszcze wiszą?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'do kiedy?',
          ctx: CTX_FINANCE,
          exp: { op: 'get_time', aspect: 'final_due' },
        },
        {
          text: 'ile już wpłacili?',
          ctx: CTX_FINANCE,
          exp: { op: 'get_amount', subject: 'paid' },
        },
        {
          text: 'a wartość umowy?',
          ctx: CTX_FINANCE,
          exp: { op: ['get_amount', 'get'], subject: 'contract_value' },
        },
        {
          text: 'gdzie mają wesele?',
          ctx: CTX_FINANCE,
          exp: { op: 'get_location', subject: ['reception', 'wedding'] },
        },
      ],
    },
    {
      id: 'mt-bartek-maks-julia',
      turns: [
        {
          text: 'gdzie szykuje się Bartek?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Bartek',
          },
        },
        {
          text: 'miałem na myśli Maksa',
          ctx: CTX_BARTEK,
          exp: {
            op: 'correction',
            participantValue: 'Maks',
            requireCorrection: true,
          },
        },
        {
          text: 'a Julka?',
          ctx: { ...CTX_PREP_SEQ, activeParticipantHint: 'Maks' },
          exp: {
            op: 'inherit',
            participantValue: 'Julka',
            requireInheritSignal: true,
          },
        },
        {
          text: 'ile km mam do niej?',
          ctx: {
            ...CTX_PREP_SEQ,
            activeParticipantHint: 'Julka',
            previousSubject: 'preparations',
          },
          exp: {
            op: 'get_distance',
            subject: ['preparations', 'route'],
          },
        },
        {
          text: 'a ceremonia gdzie?',
          ctx: CTX_PREP_SEQ,
          exp: { op: 'get_location', subject: 'ceremony' },
        },
      ],
    },
    {
      id: 'mt-schedule-day',
      turns: [
        {
          text: 'co mam dzisiaj?',
          ctx: {},
          exp: {
            op: ['get', 'get_location', 'list'],
            subject: ['assignment', 'schedule'],
            temporalPhraseIncludes: ['dziś', 'dzisiaj'],
          },
        },
        {
          text: 'a gdzie zaczynam?',
          ctx: CTX_SCHEDULE,
          exp: { op: ['get_location', 'get_next', 'inherit'] },
        },
        {
          text: 'a potem?',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: 'get_next' },
        },
        {
          text: 'daleko do kolejnego?',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: 'get_distance' },
        },
        {
          text: 'a jutro?',
          ctx: CTX_SCHEDULE,
          exp: {
            op: ['inherit', 'get_location', 'get'],
            temporalPhraseIncludes: ['jutro'],
            requireInheritSignal: true,
          },
        },
      ],
    },
    {
      id: 'mt-collection',
      turns: [
        {
          text: 'ile mam wesel we wrześniu?',
          ctx: {},
          exp: { op: 'count', temporalPhraseIncludes: ['wrześ', 'wrzes'] },
        },
        {
          text: 'jaka jest ich łączna wartość?',
          ctx: CTX_COLLECTION,
          exp: { op: 'sum', requireInheritSignal: true },
        },
        {
          text: 'a ile już wpłacili?',
          ctx: CTX_COLLECTION,
          exp: { op: ['sum', 'get_amount'], subject: ['paid', 'payment'] },
        },
        {
          text: 'które jest najdroższe?',
          ctx: CTX_COLLECTION,
          exp: { op: 'rank', rank: 'max' },
        },
        {
          text: 'pokaż listę',
          ctx: CTX_COLLECTION,
          exp: { op: 'list', requireInheritSignal: true },
        },
      ],
    },
    {
      id: 'mt-write-then-read',
      turns: [
        {
          text: 'dodaj zadanie jutro: zadzwonić',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'prepare_create',
            subject: 'task',
            temporalPhraseIncludes: ['jutro'],
          },
        },
        {
          text: 'jakie mam zadania przy tym ślubie?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: ['list', 'get'], subject: 'task' },
        },
        {
          text: 'co jest następne?',
          ctx: { activeResourceKind: 'wedding', previousSubject: 'task' },
          exp: { op: ['get_next', 'get'], subject: ['next_action', 'task'] },
        },
        {
          text: 'ile jeszcze wiszą?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'do kiedy?',
          ctx: CTX_FINANCE,
          exp: { op: 'get_time', aspect: 'final_due' },
        },
      ],
    },
    {
      id: 'mt-typo-drift',
      turns: [
        {
          text: 'gdze jade dzis',
          ctx: {},
          exp: {
            op: 'get_location',
            subject: 'assignment',
            temporalPhraseIncludes: ['dziś', 'dzis', 'dzisiaj'],
          },
        },
        {
          text: 'a potem gdzie',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: ['get_next', 'get_location'] },
        },
        {
          text: 'duzo jeszcze wisza?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'nie, chodzi o wpłaty',
          ctx: CTX_FINANCE,
          exp: {
            op: 'correction',
            subject: ['paid', 'payment'],
            requireCorrection: true,
          },
        },
        {
          text: 'a Julka gdzie sie szykuje',
          ctx: CTX_FINANCE,
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Julka',
          },
        },
      ],
    },
    {
      id: 'mt-pronoun-heavy',
      turns: [
        {
          text: 'otwórz ślub Ani i Tomka',
          ctx: {},
          exp: { op: 'open', subject: 'wedding' },
        },
        {
          text: 'ile oni wiszą?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'gdzie oni mają ceremonię?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_location', subject: 'ceremony' },
        },
        {
          text: 'a ona gdzie się szykuje?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
          },
        },
        {
          text: 'a on?',
          ctx: {
            ...CTX_PREP_SEQ,
            activeParticipantHint: 'panna młoda',
          },
          exp: { op: 'inherit', requireInheritSignal: true },
        },
      ],
    },
    {
      id: 'mt-weekend-run',
      turns: [
        {
          text: 'co mam w weekend?',
          ctx: {},
          exp: {
            op: ['get', 'list', 'get_location'],
            subject: ['assignment', 'schedule'],
            temporalPhraseIncludes: ['weekend'],
          },
        },
        {
          text: 'które pierwsze?',
          ctx: { ...CTX_SCHEDULE, lastTemporalPhrase: 'weekend', hasSequenceContext: true },
          exp: { op: ['get', 'get_next', 'list'] },
        },
        {
          text: 'gdzie to jest?',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: 'get_location', requireInheritSignal: true },
        },
        {
          text: 'daleko?',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: 'get_distance', requireInheritSignal: true },
        },
        {
          text: 'a następne?',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: 'get_next' },
        },
        {
          text: 'ile km między nimi?',
          ctx: { ...CTX_SCHEDULE, hasSequenceContext: true },
          exp: { op: 'get_distance', subject: ['assignment', 'preparations'] },
        },
      ],
    },
    {
      id: 'mt-unsupported-recover',
      turns: [
        {
          text: 'napisz za mnie wiadomość na WhatsApp',
          ctx: {},
          exp: { op: 'unsupported' },
        },
        {
          text: 'ok, to ile jeszcze wiszą na tym ślubie?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'a ślub o której?',
          ctx: { activeResourceKind: 'wedding', previousSubject: 'remaining' },
          exp: { op: 'get_time', subject: 'ceremony' },
        },
        {
          text: 'wyślij im przypomnienie',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'unsupported' },
        },
        {
          text: 'dodaj zadanie: oddzwonić jutro',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'prepare_create',
            subject: 'task',
            temporalPhraseIncludes: ['jutro'],
          },
        },
      ],
    },
    {
      id: 'mt-morphology',
      turns: [
        {
          text: 'gdzie szykuje się Maksa?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Maks',
          },
        },
        {
          text: 'a Julii?',
          ctx: CTX_PREP_SEQ,
          exp: {
            op: 'inherit',
            participantValue: 'Juli',
            requireInheritSignal: true,
          },
        },
        {
          text: 'chodziło mi o pannę młodą',
          ctx: CTX_PREP_SEQ,
          exp: {
            op: 'correction',
            participantValue: 'panna młod',
            requireCorrection: true,
          },
        },
        {
          text: 'daleko mam do niej na przygotowania?',
          ctx: {
            ...CTX_PREP_SEQ,
            activeParticipantHint: 'panna młoda',
          },
          exp: {
            op: 'get_distance',
            subject: 'preparations',
          },
        },
        {
          text: 'a pan młody o której wychodzi?',
          ctx: CTX_PREP_SEQ,
          exp: {
            op: ['get_time', 'get_location'],
            subject: ['preparations', 'ceremony'],
            participantValue: 'pan młody',
          },
        },
      ],
    },
    {
      id: 'mt-explicit-beats-stale',
      turns: [
        {
          text: 'gdzie szykuje się Maks?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Maks',
          },
        },
        {
          text: 'a potem?',
          ctx: CTX_PREP_SEQ,
          exp: { op: 'get_next' },
        },
        {
          text: 'a ślub o której będzie?',
          ctx: CTX_PREP_SEQ,
          exp: { op: 'get_time', subject: 'ceremony' },
        },
        {
          text: 'ile oni jeszcze wiszą?',
          ctx: { ...CTX_PREP_SEQ, hasSequenceContext: true },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'gdzie dzisiaj jadę?',
          ctx: CTX_PREP_SEQ,
          exp: {
            op: 'get_location',
            subject: 'assignment',
            temporalPhraseIncludes: ['dziś', 'dzisiaj'],
          },
        },
      ],
    },
  ]

  for (const convo of convos) {
    convo.turns.forEach((turn, i) => {
      cases.push(
        c(
          `${convo.id}-t${i + 1}`,
          'multi_turn_drift',
          turn.text,
          turn.exp,
          {
            conversationId: convo.id,
            turnIndex: i + 1,
            input: { userText: turn.text, semanticContext: turn.ctx },
            tags: ['multi-turn'],
          },
        ),
      )
    })
  }

  // Pad with additional single-turn variants to ensure ≥150
  const pad: Array<[string, string, TaskSpecExpectation]> = [
    ['pad-deposit', 'czy wpłacili zaliczkę?', { op: ['get_amount', 'get'], subject: ['deposit', 'paid'] }],
    ['pad-open-wedding', 'otwórz wesele Kowalskich', { op: 'open', subject: 'wedding' }],
    ['pad-open-session', 'otwórz sesję narzeczeńską Ani', { op: 'open', subject: 'session' }],
    ['pad-reception-loc', 'gdzie jest przyjęcie?', { op: 'get_location', subject: 'reception' }],
    ['pad-day-plan', 'pokaż plan dnia', { op: ['get', 'list'], subject: 'day_plan' }],
    ['pad-tasks', 'jakie mam zadania do tego ślubu?', { op: ['list', 'get'], subject: 'task' }],
    ['pad-route-prep', 'trasa do przygotowań Julii', { op: ['get_distance', 'get'], subject: ['route', 'preparations'], participantValue: 'Juli' }],
    ['pad-count-sessions', 'ile mam sesji w październiku?', { op: 'count', subject: 'session', temporalPhraseIncludes: ['paździer', 'pazdzier'] }],
    ['pad-list-august', 'wypisz wesela w sierpniu', { op: 'list', subject: ['wedding', 'assignment'], temporalPhraseIncludes: ['sierp'] }],
  ]

  for (const [id, text, exp] of pad) {
    cases.push(c(id, 'simple_factual', text, exp))
  }

  // Truth audit Phase 2.6: removed pad-corr-nie-ona-on (no previousTask —
  // ambiguous). Covered by c25-nie-ona-on with PREV_JULIA_PREP.

  cases.push(...buildCorrectionPhase25Cases())

  return cases
}

export const ASSISTANT_V4_BENCHMARK_CORPUS = buildAssistantV4BenchmarkCorpus()
