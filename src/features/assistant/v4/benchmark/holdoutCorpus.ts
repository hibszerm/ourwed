/**
 * Phase 2.6 HOLDOUT corpus — never used for prompt/schema development.
 * Synthetic Polish only. Frozen before model A/B.
 *
 * Mix target: ≥20 correction, ≥15 ellipsis/override, ≥15 mixed semantic.
 */

import type { AssistantBenchmarkCase } from './corpus'
import type { TaskSpecExpectation } from '../expect'
import type { TaskSpecSemanticContext } from '../taskSpec'

const PREV_CONTRACT: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'contract_value',
  currentTopic: 'finance',
  previousTask: {
    op: 'get_amount',
    subject: 'contract_value',
    resourceKind: 'active_resource',
  },
}

const PREV_REMAINING: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_amount',
  previousSubject: 'remaining',
  currentTopic: 'finance',
  previousTask: {
    op: 'get_amount',
    subject: 'remaining',
    resourceKind: 'active_resource',
  },
}

const PREV_JULIA: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Julia',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Julia',
    resourceKind: 'active_resource',
  },
}

const PREV_BARTEK: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Bartek',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Bartek',
    resourceKind: 'active_resource',
  },
}

const PREV_AUGUST: TaskSpecSemanticContext = {
  previousOp: 'count',
  previousSubject: 'wedding',
  lastTemporalPhrase: 'sierpień',
  currentTopic: 'collection',
  previousTask: {
    op: 'count',
    subject: 'wedding',
    temporalPhrase: 'sierpień',
    resourceKind: 'active_collection',
  },
}

const PREV_TOMORROW: TaskSpecSemanticContext = {
  previousOp: 'get_location',
  previousSubject: 'assignment',
  lastTemporalPhrase: 'jutro',
  previousTask: {
    op: 'get_location',
    subject: 'assignment',
    temporalPhrase: 'jutro',
  },
}

const PREV_CEREMONY: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_location',
  previousSubject: 'ceremony',
  hasSequenceContext: true,
  previousTask: {
    op: 'get_location',
    subject: 'ceremony',
    resourceKind: 'active_resource',
  },
}

const PREV_PREP_SEQ: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Maks',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  currentTopic: 'preparations',
  hasSequenceContext: true,
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Maks',
    resourceKind: 'active_resource',
  },
}

function h(
  id: string,
  category: AssistantBenchmarkCase['category'],
  userText: string,
  ctx: TaskSpecSemanticContext | undefined,
  taskSpec: TaskSpecExpectation,
  tags: string[] = [],
): AssistantBenchmarkCase {
  return {
    id,
    category,
    input: { userText, semanticContext: ctx },
    expected: { taskSpec },
    tags: ['holdout', 'phase26', ...tags],
    notes: 'HOLDOUT — not for prompt tuning',
  }
}

/** ≥50 holdout turns. */
export function buildHoldoutCorpus(): AssistantBenchmarkCase[] {
  const cases: AssistantBenchmarkCase[] = [
    // --- 20+ corrections (hard Polish relation) ---
    h('h-corr-01', 'corrections', 'nie to miałem na myśli, chodzi mi o wpłaty', PREV_CONTRACT, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'metric',
      patchSubject: ['paid', 'payment', 'deposit'],
      subject: ['paid', 'payment', 'deposit'],
    }, ['holdout-correction', 'metric']),
    h('h-corr-02', 'corrections', 'bardziej chodziło mi o to ile już dostałem', PREV_CONTRACT, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'metric',
      patchSubject: ['paid', 'payment'],
      subject: ['paid', 'payment'],
    }, ['holdout-correction', 'metric']),
    h('h-corr-03', 'corrections', 'nie o Julkę mi chodzi', PREV_JULIA, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-04', 'corrections', 'w sensie Maks', PREV_BARTEK, {
      op: 'correction',
      requireCorrection: true,
      participantValue: 'Maks',
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-05', 'corrections', 'wróć, miałem na myśli sobotę', PREV_TOMORROW, {
      op: 'correction',
      requireCorrection: true,
      temporalPhraseIncludes: ['sobot'],
      correctionSlot: 'temporal',
    }, ['holdout-correction', 'temporal']),
    h('h-corr-06', 'corrections', 'źle powiedziałem, wrzesień', PREV_AUGUST, {
      op: 'correction',
      requireCorrection: true,
      temporalPhraseIncludes: ['wrześ', 'wrzes'],
      correctionSlot: 'temporal',
    }, ['holdout-correction', 'temporal']),
    h('h-corr-07', 'corrections', 'nie sala, kościół', PREV_CEREMONY, {
      op: 'correction',
      requireCorrection: true,
      patchSubject: 'ceremony',
      subject: 'ceremony',
      correctionSlot: 'subject',
    }, ['holdout-correction', 'subject']),
    h('h-corr-08', 'corrections', 'nie tę parę, tę drugą', PREV_CONTRACT, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'resource',
    }, ['holdout-correction', 'resource']),
    h('h-corr-09', 'corrections', 'nie Julia, tylko Maks', PREV_JULIA, {
      op: 'correction',
      requireCorrection: true,
      participantValue: 'Maks',
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-10', 'corrections', 'nie wartość, tylko ile już wpłacili', PREV_CONTRACT, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'metric',
      patchSubject: ['paid', 'payment'],
      subject: ['paid', 'payment'],
    }, ['holdout-correction', 'metric']),
    h('h-corr-11', 'corrections', 'nie ile zostało, tylko ile już dali', PREV_REMAINING, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'metric',
      patchSubject: ['paid', 'payment'],
      subject: ['paid', 'payment'],
    }, ['holdout-correction', 'metric']),
    h('h-corr-12', 'corrections', 'nie jutro, tylko w sobotę', PREV_TOMORROW, {
      op: 'correction',
      requireCorrection: true,
      temporalPhraseIncludes: ['sobot'],
      correctionSlot: 'temporal',
    }, ['holdout-correction', 'temporal']),
    h('h-corr-13', 'corrections', 'nie ceremonię, salę', PREV_CEREMONY, {
      op: 'correction',
      requireCorrection: true,
      patchSubject: 'reception',
      subject: 'reception',
      correctionSlot: 'subject',
    }, ['holdout-correction', 'subject']),
    h('h-corr-14', 'corrections', 'nie Julię, Maksa', PREV_JULIA, {
      op: 'correction',
      requireCorrection: true,
      participantValue: 'Maks',
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-15', 'corrections', 'miałem na myśli Maksa', PREV_BARTEK, {
      op: 'correction',
      requireCorrection: true,
      participantValue: 'Maks',
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-16', 'corrections', 'nie sierpień, wrzesień', PREV_AUGUST, {
      op: 'correction',
      requireCorrection: true,
      temporalPhraseIncludes: ['wrześ', 'wrzes'],
      correctionSlot: 'temporal',
    }, ['holdout-correction', 'temporal']),
    h('h-corr-17', 'corrections', 'nie sesję, ten ślub', {
      previousOp: 'open',
      previousSubject: 'session',
      previousTask: { op: 'open', subject: 'session' },
    }, {
      op: 'correction',
      requireCorrection: true,
      patchSubject: 'wedding',
      subject: 'wedding',
      correctionSlot: 'subject',
    }, ['holdout-correction', 'resource']),
    h('h-corr-18', 'corrections', 'chodziło mi o dopłatę, nie o wartość', PREV_CONTRACT, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'metric',
      patchSubject: 'remaining',
      subject: 'remaining',
    }, ['holdout-correction', 'metric']),
    h('h-corr-19', 'corrections', 'poprawka: panna młoda, nie pan młody', PREV_JULIA, {
      op: 'correction',
      requireCorrection: true,
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-20', 'corrections', 'nie dzisiaj — jutro', {
      ...PREV_TOMORROW,
      lastTemporalPhrase: 'dzisiaj',
      previousTask: {
        op: 'get_location',
        subject: 'assignment',
        temporalPhrase: 'dzisiaj',
      },
    }, {
      op: 'correction',
      requireCorrection: true,
      temporalPhraseIncludes: ['jutro'],
      correctionSlot: 'temporal',
    }, ['holdout-correction', 'temporal']),
    h('h-corr-21', 'corrections', 'ej nie, Maksymilian', PREV_BARTEK, {
      op: 'correction',
      requireCorrection: true,
      participantValue: 'Maksymilian',
      correctionSlot: 'participant',
    }, ['holdout-correction', 'participant']),
    h('h-corr-22', 'corrections', 'w sumie chodzi o salę, nie kościół', PREV_CEREMONY, {
      op: 'correction',
      requireCorrection: true,
      patchSubject: 'reception',
      subject: 'reception',
      correctionSlot: 'subject',
    }, ['holdout-correction', 'subject']),

    // --- 15+ ellipsis / override / negative ---
    h('h-ov-01', 'explicit_override', 'a ile już wpłacili?', PREV_CONTRACT, {
      op: 'get_amount',
      subject: 'paid',
      forbidCorrection: true,
    }, ['holdout-override', 'negative-correction']),
    h('h-ov-02', 'explicit_override', 'a ceremonia gdzie?', PREV_JULIA, {
      op: 'get_location',
      subject: 'ceremony',
      forbidCorrection: true,
    }, ['holdout-override', 'negative-correction']),
    h('h-ov-03', 'explicit_override', 'a w sobotę?', PREV_TOMORROW, {
      op: ['get_location', 'inherit'],
      temporalPhraseIncludes: ['sobot'],
      forbidCorrection: true,
    }, ['holdout-override', 'negative-correction']),
    h('h-ov-04', 'explicit_override', 'a termin?', PREV_REMAINING, {
      op: 'get_time',
      subject: ['payment', 'remaining'],
      forbidCorrection: true,
    }, ['holdout-override', 'negative-correction']),
    h('h-ov-05', 'explicit_override', 'a ślub o której będzie?', PREV_PREP_SEQ, {
      op: 'get_time',
      subject: 'ceremony',
      requireExplicitSubject: true,
      forbidCorrection: true,
    }, ['holdout-override']),
    h('h-ov-06', 'sequence', 'a co potem?', PREV_PREP_SEQ, {
      op: 'get_next',
      forbidCorrection: true,
    }, ['holdout-override', 'sequence']),
    h('h-ell-01', 'ellipsis', 'a Julka?', PREV_PREP_SEQ, {
      op: ['inherit', 'get_location'],
      participantValue: 'Jul',
      requireInheritSignal: true,
      forbidCorrection: true,
    }, ['holdout-ellipsis']),
    h('h-ell-02', 'ellipsis', 'a on?', PREV_PREP_SEQ, {
      op: ['inherit', 'get_location'],
      forbidCorrection: true,
    }, ['holdout-ellipsis']),
    h('h-ell-03', 'ellipsis', 'a ta druga?', PREV_CONTRACT, {
      op: ['inherit', 'get_amount', 'open'],
      forbidCorrection: true,
    }, ['holdout-ellipsis']),
    h('h-ell-04', 'ellipsis', 'a u niej?', PREV_PREP_SEQ, {
      op: ['inherit', 'get_location'],
      forbidCorrection: true,
    }, ['holdout-ellipsis']),
    h('h-ell-05', 'ellipsis', 'no i u Maksa?', PREV_JULIA, {
      op: ['inherit', 'get_location'],
      participantValue: 'Maks',
      forbidCorrection: true,
    }, ['holdout-ellipsis']),
    h('h-ov-07', 'explicit_override', 'a ile zostało do zapłaty?', PREV_CONTRACT, {
      op: 'get_amount',
      subject: 'remaining',
      forbidCorrection: true,
    }, ['holdout-override']),
    h('h-ov-08', 'explicit_override', 'a gdzie przyjęcie?', PREV_CEREMONY, {
      op: 'get_location',
      subject: 'reception',
      forbidCorrection: true,
    }, ['holdout-override']),
    h('h-ov-09', 'explicit_override', 'do kiedy?', PREV_REMAINING, {
      op: 'get_time',
      subject: ['payment', 'remaining'],
      aspect: 'final_due',
      forbidCorrection: true,
    }, ['holdout-override']),
    h('h-ov-10', 'sequence', 'co dalej?', PREV_PREP_SEQ, {
      op: 'get_next',
      forbidCorrection: true,
    }, ['holdout-override', 'sequence']),

    // --- 15+ mixed semantic ---
    h('h-mix-01', 'temporal_workday', 'gdzie dzisiaj jadę?', undefined, {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['dziś', 'dzisiaj'],
    }, ['holdout-mixed', 'known-po']),
    h('h-mix-02', 'participants', 'gdzie szykuje się Maksymilian?', undefined, {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'Maksymilian',
    }, ['holdout-mixed', 'known-po']),
    h('h-mix-03', 'route_distance', 'daleko mam na przygotowania Julii?', undefined, {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
    }, ['holdout-mixed', 'known-po']),
    h('h-mix-04', 'simple_factual', 'ile już wpłacili?', undefined, {
      op: 'get_amount',
      subject: ['paid', 'payment', 'deposit'],
    }, ['holdout-mixed']),
    h('h-mix-05', 'collections', 'ile mam wesel we wrześniu?', undefined, {
      op: 'count',
      subject: ['wedding', 'assignment'],
      temporalPhraseIncludes: ['wrześ', 'wrzes'],
    }, ['holdout-mixed']),
    h('h-mix-06', 'simple_factual', 'o której ceremonia?', undefined, {
      op: 'get_time',
      subject: 'ceremony',
    }, ['holdout-mixed']),
    h('h-mix-07', 'simple_factual', 'gdzie sala?', undefined, {
      op: 'get_location',
      subject: 'reception',
    }, ['holdout-mixed']),
    h('h-mix-08', 'collections', 'które najdroższe?', undefined, {
      op: 'rank',
      subject: 'contract_value',
      rank: 'max',
    }, ['holdout-mixed']),
    h('h-mix-09', 'unsupported', 'wyślij im SMS że spóźnię się', undefined, {
      op: 'unsupported',
    }, ['holdout-mixed']),
    h('h-mix-10', 'prepare_write', 'dodaj task: potwierdzić florystę', undefined, {
      op: 'prepare_create',
      subject: 'task',
    }, ['holdout-mixed']),
    h('h-mix-11', 'simple_factual', 'jaka wartość umowy?', undefined, {
      op: 'get_amount',
      subject: 'contract_value',
    }, ['holdout-mixed']),
    h('h-mix-12', 'temporal_workday', 'gdzie jutro zaczynam?', undefined, {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['jutro'],
    }, ['holdout-mixed']),
    h('h-mix-13', 'participants', 'gdzie szykuje się Julia?', undefined, {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'Juli',
    }, ['holdout-mixed']),
    h('h-mix-14', 'route_distance', 'ile km do sali?', undefined, {
      op: 'get_distance',
      subject: 'reception',
    }, ['holdout-mixed']),
    h('h-mix-15', 'tasks_next_action', 'co mam teraz zrobić przy tym ślubie?', undefined, {
      op: ['get', 'list', 'get_next'],
      subject: ['task', 'next_action', 'day_plan'],
    }, ['holdout-mixed']),
    h('h-mix-16', 'ambiguity', 'a ten?', PREV_CONTRACT, {
      op: ['inherit', 'open', 'get_amount'],
    }, ['holdout-mixed']),
  ]

  return cases
}

export const ASSISTANT_V4_HOLDOUT_CORPUS = buildHoldoutCorpus()
