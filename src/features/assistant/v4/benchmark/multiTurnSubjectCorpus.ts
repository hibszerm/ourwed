/**
 * Phase 2.8 — focused multi-turn subject-binding suite.
 * Development cases may inform the principle; holdout cases are frozen before tuning.
 * Not pasted into production prompt.
 */

import type { AssistantBenchmarkCase } from './corpus'
import type { TaskSpecExpectation } from '../expect'
import type { TaskSpecSemanticContext } from '../taskSpec'

type Turn = {
  text: string
  ctx: TaskSpecSemanticContext
  exp: TaskSpecExpectation
}

function convo(
  id: string,
  turns: Turn[],
  split: 'development' | 'holdout',
): AssistantBenchmarkCase[] {
  return turns.map((t, i) => ({
    id: `${id}-t${i + 1}`,
    category: 'multi_turn_drift' as const,
    conversationId: id,
    turnIndex: i + 1,
    tags: [
      'phase28-mt-subject',
      split === 'holdout' ? 'holdout' : 'development',
      split === 'holdout' ? 'phase28-holdout' : 'phase28-dev',
    ],
    input: { userText: t.text, semanticContext: t.ctx },
    expected: { taskSpec: t.exp },
  }))
}

const empty: TaskSpecSemanticContext = {}

const COLL_SEPT: TaskSpecSemanticContext = {
  previousOp: 'count',
  previousSubject: 'wedding',
  lastTemporalPhrase: 'wrzesień',
  previousTask: {
    op: 'count',
    subject: 'wedding',
    temporalPhrase: 'wrzesień',
    resourceKind: 'active_collection',
  },
}

const PREP_JULIA: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Julia',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  hasSequenceContext: true,
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Julia',
    resourceKind: 'active_resource',
  },
}

const FIN_REMAINING: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'remaining',
  previousTask: {
    op: 'get_amount',
    subject: 'remaining',
    resourceKind: 'active_resource',
  },
}

const ASSIGN_TODAY: TaskSpecSemanticContext = {
  previousOp: 'get_location',
  previousSubject: 'assignment',
  lastTemporalPhrase: 'dzisiaj',
  hasSequenceContext: true,
  previousTask: {
    op: 'get_location',
    subject: 'assignment',
    temporalPhrase: 'dzisiaj',
    resourceKind: 'temporal_schedule',
  },
}

function buildDev(): AssistantBenchmarkCase[] {
  const out: AssistantBenchmarkCase[] = []

  // A — collection → sum → rank → paid → where
  out.push(
    ...convo(
      'p28-dev-rank-chain',
      [
        {
          text: 'ile mam wesel w sierpniu?',
          ctx: empty,
          exp: {
            op: 'count',
            subject: ['wedding', 'assignment'],
            temporalPhraseIncludes: ['sierp'],
          },
        },
        {
          text: 'jaka jest ich łączna wartość?',
          ctx: {
            previousOp: 'count',
            previousSubject: 'wedding',
            lastTemporalPhrase: 'sierpień',
            previousTask: {
              op: 'count',
              subject: 'wedding',
              temporalPhrase: 'sierpień',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: ['sum', 'get_amount'], subject: 'contract_value' },
        },
        {
          text: 'które jest najdroższe?',
          ctx: {
            previousOp: 'sum',
            previousSubject: 'contract_value',
            lastTemporalPhrase: 'sierpień',
            previousTask: {
              op: 'sum',
              subject: 'contract_value',
              temporalPhrase: 'sierpień',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'rank', subject: 'contract_value', rank: 'max' },
        },
        {
          text: 'a ile już wpłacili?',
          ctx: {
            previousOp: 'rank',
            previousSubject: 'contract_value',
            previousTask: {
              op: 'rank',
              subject: 'contract_value',
              rank: 'max',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'get_amount', subject: 'paid', forbidCorrection: true },
        },
        {
          text: 'a gdzie ono jest?',
          ctx: {
            activeResourceKind: 'wedding',
            previousOp: 'get_amount',
            previousSubject: 'paid',
          },
          exp: {
            op: 'get_location',
            subject: ['reception', 'wedding', 'assignment'],
          },
        },
      ],
      'development',
    ),
  )

  // Rank metric variants
  out.push(
    ...convo(
      'p28-dev-rank-metrics',
      [
        {
          text: 'które najdroższe?',
          ctx: COLL_SEPT,
          exp: { op: 'rank', subject: 'contract_value', rank: 'max' },
        },
        {
          text: 'które ma najmniej wpłacone?',
          ctx: {
            ...COLL_SEPT,
            previousOp: 'rank',
            previousSubject: 'contract_value',
            previousTask: {
              op: 'rank',
              subject: 'contract_value',
              rank: 'max',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'rank', subject: 'paid', rank: 'min' },
        },
        {
          text: 'któremu zostało najwięcej?',
          ctx: {
            previousOp: 'rank',
            previousSubject: 'paid',
            previousTask: {
              op: 'rank',
              subject: 'paid',
              rank: 'min',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'rank', subject: 'remaining', rank: 'max' },
        },
        {
          text: 'a najtańsze?',
          ctx: {
            previousOp: 'rank',
            previousSubject: 'remaining',
            previousTask: {
              op: 'rank',
              subject: 'remaining',
              rank: 'max',
              resourceKind: 'active_collection',
            },
          },
          exp: {
            op: 'rank',
            subject: ['contract_value', 'remaining'],
            rank: 'min',
            forbidCorrection: true,
          },
        },
        {
          text: 'otwórz to',
          ctx: {
            previousOp: 'rank',
            previousSubject: 'contract_value',
            previousTask: {
              op: 'rank',
              subject: 'contract_value',
              rank: 'min',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'open', subject: ['wedding', 'assignment'] },
        },
      ],
      'development',
    ),
  )

  // B — distance discourse
  out.push(
    ...convo(
      'p28-dev-distance-chain',
      [
        {
          text: 'gdzie Julia ma przygotowania?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Juli',
          },
        },
        {
          text: 'a ile stamtąd na salę?',
          ctx: PREP_JULIA,
          exp: {
            op: 'get_distance',
            subject: 'preparations',
            destination: 'reception',
            participantValue: 'Juli',
          },
        },
        {
          text: 'a o której ceremonia?',
          ctx: {
            ...PREP_JULIA,
            previousOp: 'get_distance',
            previousSubject: 'preparations',
          },
          exp: { op: 'get_time', subject: 'ceremony' },
        },
        {
          text: 'a potem?',
          ctx: {
            activeResourceKind: 'wedding',
            previousOp: 'get_time',
            previousSubject: 'ceremony',
            hasSequenceContext: true,
          },
          exp: { op: 'get_next' },
        },
      ],
      'development',
    ),
  )

  out.push(
    ...convo(
      'p28-dev-distance-deictic',
      [
        {
          text: 'daleko stamtąd do przyjęcia?',
          ctx: PREP_JULIA,
          exp: {
            op: 'get_distance',
            subject: 'preparations',
            destination: 'reception',
          },
        },
        {
          text: 'a do sali?',
          ctx: {
            ...PREP_JULIA,
            previousOp: 'get_distance',
            previousSubject: 'preparations',
            previousTask: {
              op: 'get_distance',
              subject: 'preparations',
              participantValue: 'Julia',
              destination: 'reception',
            },
          },
          exp: {
            op: 'get_distance',
            subject: ['preparations', 'reception'],
            destination: 'reception',
          },
        },
        {
          text: 'ile km z kościoła na salę?',
          ctx: empty,
          exp: {
            op: 'get_distance',
            subject: 'ceremony',
            destination: 'reception',
          },
        },
        {
          text: 'a daleko?',
          ctx: {
            previousOp: 'get_location',
            previousSubject: 'preparations',
            previousTask: {
              op: 'get_location',
              subject: 'preparations',
              participantValue: 'Maks',
            },
          },
          exp: {
            op: ['get_distance', 'inherit'],
            subject: 'preparations',
            requireInheritSignal: true,
          },
        },
      ],
      'development',
    ),
  )

  // C — payment deadline
  out.push(
    ...convo(
      'p28-dev-payment-termin',
      [
        {
          text: 'ile jeszcze zostało?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'a termin?',
          ctx: FIN_REMAINING,
          exp: {
            op: 'get_time',
            subject: ['payment', 'remaining'],
            forbidCorrection: true,
          },
        },
        {
          text: 'do kiedy?',
          ctx: FIN_REMAINING,
          exp: {
            op: 'get_time',
            subject: ['payment', 'remaining'],
            aspect: 'final_due',
          },
        },
        {
          text: 'ok, a termin jeszcze raz',
          ctx: {
            activeResourceKind: 'wedding',
            previousOp: 'get_amount',
            previousSubject: 'deposit',
            previousTask: {
              op: 'get_amount',
              subject: 'deposit',
              resourceKind: 'active_resource',
            },
          },
          exp: { op: 'get_time', subject: ['payment', 'remaining'] },
        },
      ],
      'development',
    ),
  )

  // D — where-next / when-next / distance-next
  out.push(
    ...convo(
      'p28-dev-where-next',
      [
        {
          text: 'gdzie dzisiaj jadę?',
          ctx: empty,
          exp: {
            op: 'get_location',
            subject: 'assignment',
            temporalPhraseIncludes: ['dziś', 'dzisiaj'],
          },
        },
        {
          text: 'a potem?',
          ctx: ASSIGN_TODAY,
          exp: { op: 'get_next' },
        },
        {
          text: 'a gdzie?',
          ctx: {
            ...ASSIGN_TODAY,
            previousOp: 'get_next',
            hasSequenceContext: true,
          },
          exp: { op: ['get_location', 'inherit'], requireInheritSignal: true },
        },
        {
          text: 'a daleko?',
          ctx: {
            previousOp: 'get_location',
            previousSubject: 'assignment',
            hasSequenceContext: true,
            previousTask: {
              op: 'get_location',
              subject: 'assignment',
            },
          },
          exp: {
            op: ['get_distance', 'inherit'],
            requireInheritSignal: true,
          },
        },
        {
          text: 'gdzie potem jadę?',
          ctx: ASSIGN_TODAY,
          exp: {
            op: 'get_location',
            subject: ['assignment', 'day_plan'],
          },
        },
      ],
      'development',
    ),
  )

  // list / open / participant follow-ups
  out.push(
    ...convo(
      'p28-dev-list-open',
      [
        {
          text: 'ile mam wesel w październiku?',
          ctx: empty,
          exp: {
            op: 'count',
            subject: ['wedding', 'assignment'],
            temporalPhraseIncludes: ['paździer', 'pazdzier'],
          },
        },
        {
          text: 'jaka suma umów?',
          ctx: {
            previousOp: 'count',
            previousSubject: 'wedding',
            lastTemporalPhrase: 'październik',
            previousTask: {
              op: 'count',
              subject: 'wedding',
              temporalPhrase: 'październik',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: ['sum', 'get_amount'], subject: 'contract_value' },
        },
        {
          text: 'wylistuj je',
          ctx: {
            previousOp: 'sum',
            previousSubject: 'contract_value',
            lastTemporalPhrase: 'październik',
            previousTask: {
              op: 'sum',
              subject: 'contract_value',
              temporalPhrase: 'październik',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'list', subject: ['wedding', 'assignment'] },
        },
        {
          text: 'otwórz pierwsze',
          ctx: {
            previousOp: 'list',
            previousSubject: 'wedding',
            previousTask: {
              op: 'list',
              subject: 'wedding',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'open', subject: ['wedding', 'assignment'] },
        },
      ],
      'development',
    ),
  )

  out.push(
    ...convo(
      'p28-dev-participant-place',
      [
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
          ctx: {
            activeResourceKind: 'wedding',
            activeParticipantHint: 'Maks',
            previousOp: 'get_location',
            previousSubject: 'preparations',
            hasSequenceContext: true,
            previousTask: {
              op: 'get_location',
              subject: 'preparations',
              participantValue: 'Maks',
            },
          },
          exp: { op: ['inherit', 'get_location'], participantValue: 'Jul' },
        },
        {
          text: 'a ślub o której?',
          ctx: {
            activeResourceKind: 'wedding',
            previousOp: 'get_location',
            previousSubject: 'preparations',
            hasSequenceContext: true,
          },
          exp: { op: 'get_time', subject: 'ceremony' },
        },
        {
          text: 'miałem na myśli Maksa',
          ctx: {
            activeResourceKind: 'wedding',
            activeParticipantHint: 'Julia',
            previousOp: 'get_location',
            previousSubject: 'preparations',
            previousTask: {
              op: 'get_location',
              subject: 'preparations',
              participantValue: 'Julia',
            },
          },
          exp: {
            op: 'correction',
            requireCorrection: true,
            participantValue: 'Maks',
            correctionSlot: 'participant',
          },
        },
        {
          text: 'a daleko stamtąd do kościoła?',
          ctx: {
            activeResourceKind: 'wedding',
            activeParticipantHint: 'Maks',
            previousOp: 'get_location',
            previousSubject: 'preparations',
            previousTask: {
              op: 'get_location',
              subject: 'preparations',
              participantValue: 'Maks',
            },
          },
          exp: {
            op: 'get_distance',
            subject: 'preparations',
            destination: 'ceremony',
            participantValue: 'Maks',
          },
        },
      ],
      'development',
    ),
  )

  return out
}

function buildHoldout(): AssistantBenchmarkCase[] {
  const out: AssistantBenchmarkCase[] = []

  out.push(
    ...convo(
      'p28-ho-rank',
      [
        {
          text: 'ile mam ślubów w maju?',
          ctx: empty,
          exp: {
            op: 'count',
            subject: ['wedding', 'assignment'],
            temporalPhraseIncludes: ['maj'],
          },
        },
        {
          text: 'które najdroższe?',
          ctx: {
            previousOp: 'count',
            previousSubject: 'wedding',
            lastTemporalPhrase: 'maj',
            previousTask: {
              op: 'count',
              subject: 'wedding',
              temporalPhrase: 'maj',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'rank', subject: 'contract_value', rank: 'max' },
        },
        {
          text: 'a z największą dopłatą?',
          ctx: {
            previousOp: 'rank',
            previousSubject: 'contract_value',
            previousTask: {
              op: 'rank',
              subject: 'contract_value',
              rank: 'max',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'rank', subject: 'remaining', rank: 'max' },
        },
        {
          text: 'wylistuj je',
          ctx: {
            previousOp: 'rank',
            previousSubject: 'remaining',
            previousTask: {
              op: 'rank',
              subject: 'remaining',
              rank: 'max',
              resourceKind: 'active_collection',
            },
          },
          exp: { op: 'list', subject: ['wedding', 'assignment'] },
        },
      ],
      'holdout',
    ),
  )

  out.push(
    ...convo(
      'p28-ho-distance',
      [
        {
          text: 'gdzie szykuje się Ania?',
          ctx: { activeResourceKind: 'wedding' },
          exp: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Ani',
          },
        },
        {
          text: 'daleko stamtąd do sali?',
          ctx: {
            activeResourceKind: 'wedding',
            activeParticipantHint: 'Ania',
            previousOp: 'get_location',
            previousSubject: 'preparations',
            previousTask: {
              op: 'get_location',
              subject: 'preparations',
              participantValue: 'Ania',
            },
          },
          exp: {
            op: 'get_distance',
            subject: 'preparations',
            destination: 'reception',
          },
        },
        {
          text: 'a do ceremonii?',
          ctx: {
            activeResourceKind: 'wedding',
            previousOp: 'get_distance',
            previousSubject: 'preparations',
            previousTask: {
              op: 'get_distance',
              subject: 'preparations',
              destination: 'reception',
            },
          },
          exp: {
            op: 'get_distance',
            subject: ['preparations', 'ceremony'],
            destination: 'ceremony',
          },
        },
      ],
      'holdout',
    ),
  )

  out.push(
    ...convo(
      'p28-ho-termin',
      [
        {
          text: 'ile brakuje?',
          ctx: { activeResourceKind: 'wedding' },
          exp: { op: 'get_amount', subject: 'remaining' },
        },
        {
          text: 'a termin?',
          ctx: FIN_REMAINING,
          exp: { op: 'get_time', subject: ['payment', 'remaining'] },
        },
        {
          text: 'a wpłaty?',
          ctx: {
            activeResourceKind: 'wedding',
            previousOp: 'get_time',
            previousSubject: 'payment',
          },
          exp: {
            op: 'get_amount',
            subject: ['paid', 'payment'],
            forbidCorrection: true,
          },
        },
      ],
      'holdout',
    ),
  )

  out.push(
    ...convo(
      'p28-ho-where-next',
      [
        {
          text: 'gdzie jadę w sobotę?',
          ctx: empty,
          exp: {
            op: 'get_location',
            subject: 'assignment',
            temporalPhraseIncludes: ['sobot'],
          },
        },
        {
          text: 'a potem?',
          ctx: {
            previousOp: 'get_location',
            previousSubject: 'assignment',
            hasSequenceContext: true,
          },
          exp: { op: 'get_next' },
        },
        {
          text: 'gdzie potem?',
          ctx: {
            previousOp: 'get_location',
            previousSubject: 'assignment',
            hasSequenceContext: true,
          },
          exp: {
            op: 'get_location',
            subject: ['assignment', 'day_plan'],
          },
        },
        {
          text: 'a daleko?',
          ctx: {
            previousOp: 'get_next',
            hasSequenceContext: true,
            previousTask: { op: 'get_next', subject: null },
          },
          exp: { op: ['get_distance', 'inherit'] },
        },
        {
          text: 'a kiedy?',
          ctx: {
            previousOp: 'get_location',
            previousSubject: 'assignment',
            hasSequenceContext: true,
          },
          exp: { op: ['get_time', 'inherit'] },
        },
      ],
      'holdout',
    ),
  )

  return out
}

export const ASSISTANT_V4_MT_SUBJECT_DEV = buildDev()
export const ASSISTANT_V4_MT_SUBJECT_HOLDOUT = buildHoldout()

export const ASSISTANT_V4_MT_SUBJECT_ALL = [
  ...ASSISTANT_V4_MT_SUBJECT_DEV,
  ...ASSISTANT_V4_MT_SUBJECT_HOLDOUT,
]
