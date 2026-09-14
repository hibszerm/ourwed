/**
 * Phase 2.6 synthetic multi-turn conversations for model A/B.
 * Same semantic context shape supplied to each model. Not for prompt tuning.
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
): AssistantBenchmarkCase[] {
  return turns.map((t, i) => ({
    id: `${id}-t${i + 1}`,
    category: 'multi_turn_drift' as const,
    conversationId: id,
    turnIndex: i + 1,
    tags: ['phase26-multiturn', 'development'],
    input: { userText: t.text, semanticContext: t.ctx },
    expected: { taskSpec: t.exp },
  }))
}

const empty: TaskSpecSemanticContext = {}

export function buildMultiTurnAbCorpus(): AssistantBenchmarkCase[] {
  const out: AssistantBenchmarkCase[] = []

  // 10× 6+ turns
  out.push(
    ...convo('ab-mt-maks-julia-ceremony-potem', [
      {
        text: 'gdzie szykuje się Maks?',
        ctx: empty,
        exp: { op: 'get_location', subject: 'preparations', participantValue: 'Maks' },
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
        text: 'a ślub o której będzie?',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Julia',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_time', subject: 'ceremony', requireExplicitSubject: true },
      },
      {
        text: 'a co potem?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
      {
        text: 'daleko mam na salę?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_next',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_distance', subject: 'reception' },
      },
      {
        text: 'ile jeszcze brakuje?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_distance',
          previousSubject: 'reception',
        },
        exp: { op: 'get_amount', subject: 'remaining' },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-bartek-corr-maks', [
      {
        text: 'gdzie szykuje się Bartek?',
        ctx: empty,
        exp: { op: 'get_location', subject: 'preparations', participantValue: 'Bartek' },
      },
      {
        text: 'miałem na myśli Maksa',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Bartek',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          previousTask: {
            op: 'get_location',
            subject: 'preparations',
            participantValue: 'Bartek',
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
        text: 'a o której?',
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
        exp: { op: ['get_time', 'inherit'], subject: 'preparations' },
      },
      {
        text: 'a Julka?',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Maks',
          previousOp: 'get_time',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: ['inherit', 'get_location', 'get_time'], participantValue: 'Jul' },
      },
      {
        text: 'a ceremonia gdzie?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_location', subject: 'ceremony', forbidCorrection: true },
      },
      {
        text: 'a co potem?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-value-corr-paid', [
      {
        text: 'jaka wartość umowy?',
        ctx: empty,
        exp: { op: 'get_amount', subject: 'contract_value' },
      },
      {
        text: 'nie wartość, tylko ile wpłacili',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'contract_value',
          previousTask: {
            op: 'get_amount',
            subject: 'contract_value',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          correctionSlot: 'metric',
          patchSubject: ['paid', 'payment'],
          subject: ['paid', 'payment'],
        },
      },
      {
        text: 'a ile zostało?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'paid',
          previousTask: {
            op: 'get_amount',
            subject: 'paid',
            resourceKind: 'active_resource',
          },
        },
        exp: { op: 'get_amount', subject: 'remaining', forbidCorrection: true },
      },
      {
        text: 'do kiedy?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'remaining',
          previousTask: {
            op: 'get_amount',
            subject: 'remaining',
            resourceKind: 'active_resource',
          },
        },
        exp: { op: 'get_time', subject: ['payment', 'remaining'], forbidCorrection: true },
      },
      {
        text: 'a zaliczka?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'payment',
        },
        exp: { op: 'get_amount', subject: ['deposit', 'paid'], forbidCorrection: true },
      },
      {
        text: 'nie zaliczka, cała wartość',
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
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'contract_value',
          subject: 'contract_value',
          correctionSlot: 'metric',
        },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-today-where-ceremony-finance', [
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
        text: 'a gdzie dokładnie ceremonia?',
        ctx: {
          previousOp: 'get_location',
          previousSubject: 'assignment',
          lastTemporalPhrase: 'dzisiaj',
          hasSequenceContext: true,
        },
        exp: { op: 'get_location', subject: 'ceremony', forbidCorrection: true },
      },
      {
        text: 'a o której?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: ['get_time', 'inherit'], subject: 'ceremony' },
      },
      {
        text: 'ile oni jeszcze wiszą?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'ceremony',
        },
        exp: { op: 'get_amount', subject: 'remaining' },
      },
      {
        text: 'a wpłaty?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'remaining',
        },
        exp: { op: 'get_amount', subject: ['paid', 'payment'], forbidCorrection: true },
      },
      {
        text: 'do kiedy termin?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'paid',
        },
        exp: { op: 'get_time', subject: ['payment', 'remaining'] },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-august-corr-september', [
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
        text: 'nie sierpień, wrzesień',
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
        exp: {
          op: 'correction',
          requireCorrection: true,
          temporalPhraseIncludes: ['wrześ', 'wrzes'],
          correctionSlot: 'temporal',
        },
      },
      {
        text: 'jaka ich łączna wartość?',
        ctx: {
          previousOp: 'count',
          previousSubject: 'wedding',
          lastTemporalPhrase: 'wrzesień',
          previousTask: {
            op: 'count',
            subject: 'wedding',
            temporalPhrase: 'wrzesień',
            resourceKind: 'active_collection',
          },
        },
        exp: { op: ['sum', 'get_amount'], subject: 'contract_value' },
      },
      {
        text: 'a ile już wpłacili?',
        ctx: {
          previousOp: 'sum',
          previousSubject: 'contract_value',
          lastTemporalPhrase: 'wrzesień',
        },
        exp: { op: 'get_amount', subject: 'paid', forbidCorrection: true },
      },
      {
        text: 'które najdroższe?',
        ctx: {
          previousOp: 'get_amount',
          previousSubject: 'paid',
          lastTemporalPhrase: 'wrzesień',
        },
        exp: { op: 'rank', subject: 'contract_value', rank: 'max' },
      },
      {
        text: 'nie najdroższe, z największą dopłatą',
        ctx: {
          previousOp: 'rank',
          previousSubject: 'contract_value',
          previousTask: { op: 'rank', subject: 'contract_value', rank: 'max' },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'remaining',
          subject: 'remaining',
          correctionSlot: 'metric',
        },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-remaining-due', [
      {
        text: 'ile jeszcze brakuje?',
        ctx: { activeResourceKind: 'wedding' },
        exp: { op: 'get_amount', subject: 'remaining' },
      },
      {
        text: 'do kiedy?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'remaining',
          previousTask: {
            op: 'get_amount',
            subject: 'remaining',
            resourceKind: 'active_resource',
          },
        },
        exp: { op: 'get_time', subject: ['payment', 'remaining'], forbidCorrection: true },
      },
      {
        text: 'a ile już dali?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'payment',
        },
        exp: { op: 'get_amount', subject: ['paid', 'payment'], forbidCorrection: true },
      },
      {
        text: 'nie wpłaty, wartość umowy',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'paid',
          previousTask: {
            op: 'get_amount',
            subject: 'paid',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'contract_value',
          subject: 'contract_value',
          correctionSlot: 'metric',
        },
      },
      {
        text: 'a zaliczka była?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'contract_value',
        },
        exp: { op: 'get_amount', subject: ['deposit', 'paid'], forbidCorrection: true },
      },
      {
        text: 'ok, a termin jeszcze raz',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'deposit',
        },
        exp: { op: 'get_time', subject: ['payment', 'remaining'] },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-place-distance', [
      {
        text: 'gdzie jest sala?',
        ctx: { activeResourceKind: 'wedding' },
        exp: { op: 'get_location', subject: 'reception' },
      },
      {
        text: 'daleko stąd?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'reception',
          previousTask: {
            op: 'get_location',
            subject: 'reception',
            resourceKind: 'active_resource',
          },
        },
        exp: { op: 'get_distance', subject: 'reception' },
      },
      {
        text: 'a kościół?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_distance',
          previousSubject: 'reception',
        },
        exp: {
          op: ['get_location', 'inherit'],
          forbidCorrection: true,
        },
      },
      {
        text: 'ile km?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'ceremony',
        },
        exp: { op: 'get_distance', subject: 'ceremony' },
      },
      {
        text: 'a przygotowania Julii?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_distance',
          previousSubject: 'ceremony',
        },
        exp: {
          op: ['get_location', 'inherit'],
          subject: 'preparations',
          participantValue: 'Juli',
          forbidCorrection: true,
        },
      },
      {
        text: 'daleko mam na przygotowania Julii?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          activeParticipantHint: 'Julia',
        },
        exp: {
          op: 'get_distance',
          subject: 'preparations',
          participantValue: 'Juli',
        },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-seq-override-next', [
      {
        text: 'gdzie szykuje się Maks?',
        ctx: empty,
        exp: { op: 'get_location', subject: 'preparations', participantValue: 'Maks' },
      },
      {
        text: 'a co potem?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
      {
        text: 'a ślub o której będzie?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_next',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_time', subject: 'ceremony', requireExplicitSubject: true },
      },
      {
        text: 'a co potem?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
      {
        text: 'gdzie sala?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_next',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_location', subject: 'reception', forbidCorrection: true },
      },
      {
        text: 'co dalej?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'reception',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
      {
        text: 'ile jeszcze brakuje?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_next',
          previousSubject: 'reception',
        },
        exp: { op: 'get_amount', subject: 'remaining' },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-soft-repair-hard', [
      {
        text: 'jaka wartość?',
        ctx: { activeResourceKind: 'wedding' },
        exp: { op: 'get_amount', subject: 'contract_value' },
      },
      {
        text: 'nie to miałem na myśli, chodzi mi o wpłaty',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'contract_value',
          previousTask: {
            op: 'get_amount',
            subject: 'contract_value',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          correctionSlot: 'metric',
          patchSubject: ['paid', 'payment'],
          subject: ['paid', 'payment'],
        },
      },
      {
        text: 'bardziej chodziło mi o zaliczkę',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'paid',
          previousTask: {
            op: 'get_amount',
            subject: 'paid',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: ['deposit', 'paid'],
          subject: ['deposit', 'paid'],
          correctionSlot: 'metric',
        },
      },
      {
        text: 'wróć, miałem na myśli dopłatę',
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
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'remaining',
          subject: 'remaining',
          correctionSlot: 'metric',
        },
      },
      {
        text: 'a termin?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'remaining',
        },
        exp: { op: 'get_time', subject: ['payment', 'remaining'], forbidCorrection: true },
      },
      {
        text: 'źle powiedziałem, wartość umowy',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'payment',
          previousTask: {
            op: 'get_time',
            subject: 'payment',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'contract_value',
          subject: ['contract_value', 'payment'],
        },
      },
    ]),
  )

  out.push(
    ...convo('ab-mt-participant-soft', [
      {
        text: 'gdzie szykuje się Julia?',
        ctx: empty,
        exp: { op: 'get_location', subject: 'preparations', participantValue: 'Juli' },
      },
      {
        text: 'nie o Julkę mi chodzi',
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
        exp: { op: 'correction', requireCorrection: true, correctionSlot: 'participant' },
      },
      {
        text: 'w sensie Maks',
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
        text: 'a o której u niego?',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Maks',
          previousOp: 'get_location',
          previousSubject: 'preparations',
        },
        exp: { op: ['get_time', 'inherit'], subject: 'preparations' },
      },
      {
        text: 'nie sala, kościół',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'preparations',
          previousTask: {
            op: 'get_location',
            subject: 'reception',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'ceremony',
          subject: 'ceremony',
          correctionSlot: 'subject',
        },
      },
      {
        text: 'a co potem?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
    ]),
  )

  // 10 shorter / 4–5 turn conversations to reach ≥20 total
  const shortIds = [
    'ab-mt-s01-open-finance',
    'ab-mt-s02-session-wedding',
    'ab-mt-s03-rank-swap',
    'ab-mt-s04-typo-recover',
    'ab-mt-s05-pronoun',
    'ab-mt-s06-weekend',
    'ab-mt-s07-task-write',
    'ab-mt-s08-collection-sum',
    'ab-mt-s09-schedule-override',
    'ab-mt-s10-distance-prep',
  ]

  const shorts: Turn[][] = [
    [
      { text: 'otwórz wesele Nowaków', ctx: empty, exp: { op: 'open', subject: 'wedding' } },
      {
        text: 'ile brakuje?',
        ctx: { activeResourceKind: 'wedding', previousOp: 'open', previousSubject: 'wedding' },
        exp: { op: 'get_amount', subject: 'remaining' },
      },
      {
        text: 'a wpłacili ile?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'remaining',
        },
        exp: { op: 'get_amount', subject: 'paid', forbidCorrection: true },
      },
      {
        text: 'do kiedy?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_amount',
          previousSubject: 'paid',
          previousTask: {
            op: 'get_amount',
            subject: 'remaining',
            resourceKind: 'active_resource',
          },
        },
        exp: { op: 'get_time', subject: ['payment', 'remaining'] },
      },
    ],
    [
      { text: 'otwórz sesję Ani', ctx: empty, exp: { op: 'open', subject: 'session' } },
      {
        text: 'nie sesję, ten ślub',
        ctx: {
          previousOp: 'open',
          previousSubject: 'session',
          previousTask: { op: 'open', subject: 'session' },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'wedding',
          subject: 'wedding',
          correctionSlot: 'subject',
        },
      },
      {
        text: 'gdzie ceremonia?',
        ctx: { activeResourceKind: 'wedding', previousOp: 'open', previousSubject: 'wedding' },
        exp: { op: 'get_location', subject: 'ceremony' },
      },
      {
        text: 'o której?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'ceremony',
        },
        exp: { op: ['get_time', 'inherit'], subject: 'ceremony' },
      },
    ],
    [
      {
        text: 'które najdroższe we wrześniu?',
        ctx: empty,
        exp: {
          op: 'rank',
          subject: 'contract_value',
          rank: 'max',
          temporalPhraseIncludes: ['wrześ', 'wrzes'],
        },
      },
      {
        text: 'nie najdroższe, największa dopłata',
        ctx: {
          previousOp: 'rank',
          previousSubject: 'contract_value',
          previousTask: { op: 'rank', subject: 'contract_value', rank: 'max' },
        },
        exp: {
          op: 'correction',
          requireCorrection: true,
          patchSubject: 'remaining',
          subject: 'remaining',
          correctionSlot: 'metric',
        },
      },
      {
        text: 'a najtańsze?',
        ctx: {
          previousOp: 'rank',
          previousSubject: 'remaining',
          previousTask: { op: 'rank', subject: 'remaining', rank: 'max' },
        },
        exp: { op: 'rank', subject: ['contract_value', 'remaining'], rank: 'min' },
      },
      {
        text: 'otwórz to',
        ctx: { previousOp: 'rank', previousSubject: 'contract_value' },
        exp: { op: 'open', subject: ['wedding', 'assignment'] },
      },
    ],
    [
      {
        text: 'gdzie szykuje sie Maksymilian?',
        ctx: empty,
        exp: {
          op: 'get_location',
          subject: 'preparations',
          participantValue: 'Maksymilian',
        },
      },
      {
        text: 'a Julja?',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Maksymilian',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: ['inherit', 'get_location'], participantValue: 'Jul' },
      },
      {
        text: 'a slub o ktorej?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_time', subject: 'ceremony' },
      },
      {
        text: 'co potem',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
    ],
    [
      {
        text: 'gdzie szykuje się Maks?',
        ctx: empty,
        exp: { op: 'get_location', subject: 'preparations', participantValue: 'Maks' },
      },
      {
        text: 'a ona?',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Maks',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: ['inherit', 'get_location'] },
      },
      {
        text: 'a on o której?',
        ctx: {
          activeResourceKind: 'wedding',
          activeParticipantHint: 'Julia',
          previousOp: 'get_location',
          previousSubject: 'preparations',
        },
        exp: { op: ['get_time', 'inherit'] },
      },
      {
        text: 'a u nich sala?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'preparations',
        },
        exp: { op: 'get_location', subject: 'reception' },
      },
    ],
    [
      {
        text: 'gdzie w sobotę jadę?',
        ctx: empty,
        exp: {
          op: 'get_location',
          subject: 'assignment',
          temporalPhraseIncludes: ['sobot'],
        },
      },
      {
        text: 'a w niedzielę?',
        ctx: {
          previousOp: 'get_location',
          previousSubject: 'assignment',
          lastTemporalPhrase: 'sobota',
        },
        exp: {
          op: ['get_location', 'inherit'],
          temporalPhraseIncludes: ['niedziel'],
          forbidCorrection: true,
        },
      },
      {
        text: 'o której start?',
        ctx: {
          previousOp: 'get_location',
          previousSubject: 'assignment',
          lastTemporalPhrase: 'niedziela',
        },
        exp: { op: 'get_time', subject: ['assignment', 'schedule', 'preparations'] },
      },
      {
        text: 'gdzie kończę?',
        ctx: {
          previousOp: 'get_time',
          previousSubject: 'assignment',
          lastTemporalPhrase: 'niedziela',
        },
        exp: { op: ['get_location', 'get_next'], subject: ['assignment', 'reception', 'day_plan'] },
      },
    ],
    [
      {
        text: 'dodaj task: wysłać galerię',
        ctx: { activeResourceKind: 'wedding' },
        exp: { op: 'prepare_create', subject: 'task' },
      },
      {
        text: 'jakie mam zadania?',
        ctx: { activeResourceKind: 'wedding', previousOp: 'prepare_create', previousSubject: 'task' },
        exp: { op: ['list', 'get'], subject: 'task' },
      },
      {
        text: 'co dalej przy tym ślubie?',
        ctx: { activeResourceKind: 'wedding', previousOp: 'list', previousSubject: 'task' },
        exp: { op: ['get_next', 'get'], subject: ['next_action', 'task', 'day_plan'] },
      },
      {
        text: 'gdzie ceremonia?',
        ctx: { activeResourceKind: 'wedding', previousOp: 'get_next', previousSubject: 'task' },
        exp: { op: 'get_location', subject: 'ceremony' },
      },
    ],
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
        text: 'a ile wpłacili łącznie?',
        ctx: {
          previousOp: 'sum',
          previousSubject: 'contract_value',
          lastTemporalPhrase: 'październik',
        },
        exp: { op: ['sum', 'get_amount'], subject: ['paid', 'payment'], forbidCorrection: true },
      },
      {
        text: 'wylistuj je',
        ctx: {
          previousOp: 'sum',
          previousSubject: 'paid',
          lastTemporalPhrase: 'październik',
        },
        exp: { op: 'list', subject: ['wedding', 'assignment'] },
      },
    ],
    [
      {
        text: 'gdzie szykuje się Maks?',
        ctx: empty,
        exp: { op: 'get_location', subject: 'preparations', participantValue: 'Maks' },
      },
      {
        text: 'a co potem?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_location',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_next' },
      },
      {
        text: 'a ślub o której będzie?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_next',
          previousSubject: 'preparations',
          hasSequenceContext: true,
        },
        exp: { op: 'get_time', subject: 'ceremony', requireExplicitSubject: true },
      },
      {
        text: 'get_next nie — gdzie sala?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_time',
          previousSubject: 'ceremony',
          hasSequenceContext: true,
        },
        exp: { op: 'get_location', subject: 'reception', requireExplicitSubject: true },
      },
    ],
    [
      {
        text: 'daleko mam na przygotowania Julii?',
        ctx: empty,
        exp: {
          op: 'get_distance',
          subject: 'preparations',
          participantValue: 'Juli',
        },
      },
      {
        text: 'a do Maksa?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_distance',
          previousSubject: 'preparations',
          activeParticipantHint: 'Julia',
        },
        exp: {
          op: ['get_distance', 'inherit'],
          participantValue: 'Maks',
          forbidCorrection: true,
        },
      },
      {
        text: 'a do sali?',
        // Phase 2.8: elliptical distance may be one-endpoint TO=reception
        // OR two-endpoint FROM=prior preparations + destination=reception.
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_distance',
          previousSubject: 'preparations',
          previousTask: {
            op: 'get_distance',
            subject: 'preparations',
            participantValue: 'Julia',
            resourceKind: 'active_resource',
          },
        },
        exp: {
          op: 'get_distance',
          subject: ['preparations', 'reception'],
          destination: 'reception',
          forbidCorrection: true,
        },
      },
      {
        text: 'gdzie w ogóle sala jest?',
        ctx: {
          activeResourceKind: 'wedding',
          previousOp: 'get_distance',
          previousSubject: 'reception',
        },
        exp: { op: 'get_location', subject: 'reception' },
      },
    ],
  ]

  shortIds.forEach((id, i) => {
    out.push(...convo(id, shorts[i]!))
  })

  return out
}

export const ASSISTANT_V4_MULTITURN_AB_CORPUS = buildMultiTurnAbCorpus()
