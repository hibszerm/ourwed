/**
 * Phase 2.7 dedicated subject / distance / route corpus (≥60).
 * Tagged subject-suite. Natural Polish. Not pasted into production prompt.
 */

import type { AssistantBenchmarkCase } from './corpus'
import type { TaskSpecExpectation } from '../expect'
import type { TaskSpecSemanticContext } from '../taskSpec'

const PREV_JULIA_PREP: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Julia',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Julia',
    resourceKind: 'active_resource',
  },
}

const PREV_CEREMONY: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  previousOp: 'get_location',
  previousSubject: 'ceremony',
  previousTask: {
    op: 'get_location',
    subject: 'ceremony',
    resourceKind: 'active_resource',
  },
}

const PREV_PREP_SEQ: TaskSpecSemanticContext = {
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

function s(
  id: string,
  userText: string,
  taskSpec: TaskSpecExpectation,
  ctx?: TaskSpecSemanticContext,
  category: AssistantBenchmarkCase['category'] = 'route_distance',
): AssistantBenchmarkCase {
  return {
    id,
    category,
    input: { userText, semanticContext: ctx },
    expected: { taskSpec },
    tags: ['subject-suite', 'phase27', 'development'],
  }
}

export function buildSubjectDistanceCorpus(): AssistantBenchmarkCase[] {
  return [
    // --- simple location / time ---
    s('sd-loc-ceremony', 'gdzie ceremonia?', { op: 'get_location', subject: 'ceremony' }, undefined, 'simple_factual'),
    s('sd-time-ceremony', 'o której ceremonia?', { op: 'get_time', subject: 'ceremony' }, undefined, 'simple_factual'),
    s('sd-loc-reception', 'gdzie sala?', { op: 'get_location', subject: 'reception' }, undefined, 'simple_factual'),
    s('sd-loc-prep-maks', 'gdzie Maks się szykuje?', {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'Maks',
    }, undefined, 'participants'),
    s('sd-loc-prep-julia', 'gdzie są przygotowania Julii?', {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'Juli',
    }, undefined, 'participants'),
    s('sd-loc-assignment-today', 'gdzie dzisiaj jadę?', {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['dziś', 'dzisiaj'],
    }, undefined, 'temporal_workday'),
    s('sd-loc-assignment-weekend', 'gdzie jem w weekend?', {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['weekend'],
    }, undefined, 'temporal_workday'),
    s('sd-open-wedding', 'otwórz wesele Kowalskich', {
      op: 'open',
      subject: 'wedding',
    }, undefined, 'simple_factual'),
    s('sd-open-slub', 'otwórz ślub Ani i Tomka', {
      op: 'open',
      subject: 'wedding',
    }, undefined, 'simple_factual'),

    // --- one-endpoint distance ---
    s('sd-dist-prep-julia', 'daleko mam na przygotowania Julii?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
    }),
    s('sd-dist-prep-km-julia', 'ile km na przygotowania Julii?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
    }),
    s('sd-dist-maks-prep', 'jak daleko mam do Maksa na przygotowania?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Maks',
    }),
    s('sd-dist-maks-person', 'ile km tam mam do Maksa?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Maks',
    }),
    s('sd-dist-julka-soft', 'daleko do Julki?', {
      op: 'get_distance',
      subject: ['preparations', 'assignment'],
      participantValue: 'Jul',
    }),
    s('sd-dist-ceremony', 'ile km na ceremonię?', {
      op: 'get_distance',
      subject: 'ceremony',
    }),
    s('sd-dist-ceremony-2', 'daleko jest do ceremonii?', {
      op: 'get_distance',
      subject: 'ceremony',
    }),
    s('sd-dist-kosciol', 'ile mam stąd do kościoła?', {
      op: 'get_distance',
      subject: 'ceremony',
    }),
    s('sd-dist-sala', 'ile km na salę?', {
      op: 'get_distance',
      subject: 'reception',
    }),
    s('sd-dist-sala-2', 'ile jest do sali?', {
      op: 'get_distance',
      subject: 'reception',
    }),
    s('sd-dist-prep-maks-override', 'ile km mam do przygotowań Maksa?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Maks',
    }, {
      activeResourceKind: 'wedding',
      previousOp: 'get_amount',
      previousSubject: 'remaining',
      currentTopic: 'finance',
    }, 'explicit_override'),

    // --- two-endpoint ---
    s('sd-2ep-prep-ceremony', 'ile jest z przygotowań Julii na ceremonię?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
      destination: 'ceremony',
    }),
    s('sd-2ep-kosciol-sala', 'jak daleko z kościoła na salę?', {
      op: 'get_distance',
      subject: 'ceremony',
      destination: 'reception',
    }),
    s('sd-2ep-prep-ceremony-2', 'jak daleko od Julki do ślubu?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Jul',
      destination: 'ceremony',
    }),
    s('sd-2ep-between', 'jaki kawałek jest między przygotowaniami a ceremonią?', {
      op: 'get_distance',
      subject: 'preparations',
      destination: 'ceremony',
    }),
    s('sd-2ep-much', 'dużo jest z kościoła na salę?', {
      op: 'get_distance',
      subject: 'ceremony',
      destination: 'reception',
    }),

    // --- contextual distance ellipsis ---
    s('sd-ell-daleko-prep', 'a daleko?', {
      op: ['get_distance', 'inherit'],
      requireInheritSignal: true,
    }, PREV_JULIA_PREP, 'ellipsis'),
    s('sd-ell-daleko-ceremony', 'a daleko?', {
      op: ['get_distance', 'inherit'],
      requireInheritSignal: true,
    }, PREV_CEREMONY, 'ellipsis'),
    s('sd-ell-daleko-potem', 'daleko potem?', {
      op: ['get_distance', 'get_next', 'inherit'],
    }, PREV_PREP_SEQ, 'sequence'),

    // --- explicit route ---
    s('sd-route-show', 'pokaż trasę', {
      op: ['get', 'get_distance'],
      subject: 'route',
    }),
    s('sd-route-how', 'jak mam tam jechać?', {
      op: ['get', 'get_distance', 'unsupported'],
      subject: ['route', 'assignment', 'unknown'],
    }),
    s('sd-route-what', 'jaka jest trasa?', {
      op: ['get', 'get_distance'],
      subject: 'route',
    }),
    s('sd-route-prep-sala', 'pokaż trasę z przygotowań na salę', {
      op: ['get_distance', 'get'],
      subject: ['route', 'preparations'],
      destination: 'reception',
    }),
    s('sd-route-to-prep', 'trasa do przygotowań Julii', {
      op: ['get_distance', 'get'],
      subject: ['route', 'preparations'],
      participantValue: 'Juli',
    }),

    // --- finance / task subjects ---
    s('sd-fin-remaining', 'ile jeszcze wiszą?', {
      op: 'get_amount',
      subject: 'remaining',
    }, undefined, 'simple_factual'),
    s('sd-fin-paid', 'ile już wpłacili?', {
      op: 'get_amount',
      subject: ['paid', 'payment'],
    }, undefined, 'simple_factual'),
    s('sd-fin-value', 'jaka wartość umowy?', {
      op: 'get_amount',
      subject: 'contract_value',
    }, undefined, 'simple_factual'),
    s('sd-task-next', 'jaka jest następna akcja?', {
      op: ['get', 'list', 'get_next'],
      subject: ['next_action', 'task'],
    }, undefined, 'tasks_next_action'),
    s('sd-seq-potem', 'a co potem?', {
      op: 'get_next',
    }, PREV_PREP_SEQ, 'sequence'),
    s('sd-ov-ceremony-time', 'a ślub o której będzie?', {
      op: 'get_time',
      subject: 'ceremony',
      requireExplicitSubject: true,
    }, PREV_PREP_SEQ, 'explicit_override'),

    // --- more natural variants ---
    s('sd-dist-szykuje-maks', 'jak daleko szykuje się Maks?', {
      op: ['get_distance', 'get_location'],
      subject: 'preparations',
      participantValue: 'Maks',
    }),
    s('sd-dist-gdzie-potem', 'gdzie potem jadę?', {
      // Phase 2.8: location of next stop — not bare get_next
      op: 'get_location',
      subject: ['assignment', 'day_plan'],
    }, PREV_PREP_SEQ, 'sequence'),
    s('sd-loc-prep-mam', 'gdzie mam przygotowania Maksa?', {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'Maks',
    }, undefined, 'participants'),
    s('sd-dist-prep-jej', 'daleko mam do niej na przygotowania?', {
      op: 'get_distance',
      subject: 'preparations',
    }, PREV_JULIA_PREP),
    // Phase 2.8 truth: deictic FROM (prior preparations) + explicit TO (reception)
    s('sd-dist-reception-stamtad', 'daleko stamtąd do przyjęcia?', {
      op: 'get_distance',
      subject: 'preparations',
      destination: 'reception',
      participantValue: 'Juli',
    }, PREV_PREP_SEQ),
    s('sd-time-prep', 'o której wychodzi pan młody?', {
      op: ['get_time', 'get_location'],
      subject: ['preparations', 'ceremony'],
      participantValue: 'pan młody',
    }, undefined, 'participants'),
    s('sd-schedule', 'co mam 11.09?', {
      op: ['get', 'get_location', 'list'],
      subject: ['assignment', 'schedule'],
      temporalPhraseIncludes: ['11.09', '11'],
    }, undefined, 'temporal_workday'),
    s('sd-session', 'otwórz sesję Ani', {
      op: 'open',
      subject: 'session',
    }, undefined, 'simple_factual'),
    s('sd-day-plan', 'pokaż plan dnia', {
      op: ['get', 'list'],
      subject: 'day_plan',
    }, undefined, 'simple_factual'),
    s('sd-rank-value', 'które najdroższe?', {
      op: 'rank',
      subject: ['contract_value', 'wedding'],
      rank: 'max',
    }, undefined, 'collections'),
    s('sd-payment-due', 'do kiedy?', {
      op: 'get_time',
      subject: ['payment', 'remaining'],
      aspect: 'final_due',
      requireInheritSignal: true,
    }, {
      previousOp: 'get_amount',
      previousSubject: 'remaining',
      previousTask: {
        op: 'get_amount',
        subject: 'remaining',
        resourceKind: 'active_resource',
      },
    }, 'ellipsis'),
    s('sd-2ep-prep-reception', 'ile km z Julii na salę?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
      destination: 'reception',
    }),
    s('sd-dist-assignment', 'daleko mam dzisiaj?', {
      op: 'get_distance',
      subject: ['assignment', 'schedule'],
      temporalPhraseIncludes: ['dziś', 'dzisiaj'],
    }),
    s('sd-ov-finance-to-place', 'a gdzie sala?', {
      op: 'get_location',
      subject: 'reception',
      forbidCorrection: true,
    }, {
      previousOp: 'get_amount',
      previousSubject: 'remaining',
      currentTopic: 'finance',
    }, 'explicit_override'),
    s('sd-ell-gdzie', 'a gdzie?', {
      op: ['get_location', 'inherit'],
      requireInheritSignal: true,
    }, PREV_JULIA_PREP, 'ellipsis'),
    s('sd-corr-prep-maks', 'miałem na myśli Maksa', {
      op: 'correction',
      requireCorrection: true,
      participantValue: 'Maks',
      correctionSlot: 'participant',
    }, {
      activeParticipantHint: 'Bartek',
      previousOp: 'get_location',
      previousSubject: 'preparations',
      previousTask: {
        op: 'get_location',
        subject: 'preparations',
        participantValue: 'Bartek',
      },
    }, 'corrections'),
    s('sd-julka-ell', 'a Julka?', {
      op: ['inherit', 'get_location'],
      participantValue: 'Jul',
    }, PREV_PREP_SEQ, 'ellipsis'),
    s('sd-dist-church-soft', 'daleko do ślubu?', {
      op: 'get_distance',
      subject: ['ceremony', 'wedding'],
    }),
    s('sd-loc-reception-przyjecie', 'gdzie przyjęcie?', {
      op: 'get_location',
      subject: 'reception',
    }, undefined, 'simple_factual'),
    s('sd-2ep-reverse', 'ile z sali do kościoła?', {
      op: 'get_distance',
      subject: 'reception',
      destination: 'ceremony',
    }),
    s('sd-loc-prep-unknown', 'gdzie się szykuje pan młody?', {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'pan młody',
    }, undefined, 'participants'),
  ]
}

export const ASSISTANT_V4_SUBJECT_DISTANCE_CORPUS = buildSubjectDistanceCorpus()
