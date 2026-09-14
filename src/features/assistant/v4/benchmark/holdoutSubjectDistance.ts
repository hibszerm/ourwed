/**
 * Phase 2.7 HOLDOUT — subject/distance (≥25). Never used for prompt tuning.
 */

import type { AssistantBenchmarkCase } from './corpus'
import type { TaskSpecExpectation } from '../expect'
import type { TaskSpecSemanticContext } from '../taskSpec'

function h(
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
    tags: ['holdout', 'holdout-subject', 'phase27'],
    notes: 'HOLDOUT subject/distance — not for prompt tuning',
  }
}

const PREV_JULIA: TaskSpecSemanticContext = {
  activeResourceKind: 'wedding',
  activeParticipantHint: 'Julia',
  previousOp: 'get_location',
  previousSubject: 'preparations',
  previousTask: {
    op: 'get_location',
    subject: 'preparations',
    participantValue: 'Julia',
  },
}

export function buildSubjectDistanceHoldout(): AssistantBenchmarkCase[] {
  return [
    h('hsd-01', 'daleko mam do Julki?', {
      op: 'get_distance',
      subject: ['preparations', 'assignment'],
      participantValue: 'Jul',
    }),
    h('hsd-02', 'ile km na salę?', { op: 'get_distance', subject: 'reception' }),
    h('hsd-03', 'dużo jest z kościoła na salę?', {
      op: 'get_distance',
      subject: 'ceremony',
      destination: 'reception',
    }),
    h('hsd-04', 'jak daleko szykuje się Maks?', {
      op: ['get_distance', 'get_location'],
      subject: 'preparations',
      participantValue: 'Maks',
    }),
    h('hsd-05', 'gdzie potem jadę?', {
      op: 'get_location',
      subject: ['assignment', 'day_plan'],
    }, {
      hasSequenceContext: true,
      previousOp: 'get_location',
      previousSubject: 'preparations',
    }, 'sequence'),
    h('hsd-06', 'daleko potem?', {
      op: ['get_distance', 'get_next', 'inherit'],
    }, {
      hasSequenceContext: true,
      previousOp: 'get_location',
      previousSubject: 'preparations',
    }, 'sequence'),
    h('hsd-07', 'ile mam stąd do kościoła?', {
      op: 'get_distance',
      subject: 'ceremony',
    }),
    h('hsd-08', 'jak daleko od Julki do ślubu?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Jul',
      destination: 'ceremony',
    }),
    h('hsd-09', 'jaki kawałek jest między przygotowaniami a ceremonią?', {
      op: 'get_distance',
      subject: 'preparations',
      destination: 'ceremony',
    }),
    h('hsd-10', 'a daleko?', {
      op: ['get_distance', 'inherit'],
      requireInheritSignal: true,
    }, PREV_JULIA, 'ellipsis'),
    h('hsd-11', 'pokaż trasę z przygotowań na salę', {
      op: ['get_distance', 'get'],
      subject: ['route', 'preparations'],
      destination: 'reception',
    }),
    h('hsd-12', 'ile km na przygotowania Julii?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
    }),
    h('hsd-13', 'ile km na ceremonię?', {
      op: 'get_distance',
      subject: 'ceremony',
    }),
    h('hsd-14', 'ile jest z przygotowań Julii na ceremonię?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Juli',
      destination: 'ceremony',
    }),
    h('hsd-15', 'jak daleko z kościoła na salę?', {
      op: 'get_distance',
      subject: 'ceremony',
      destination: 'reception',
    }),
    h('hsd-16', 'gdzie ceremonia?', {
      op: 'get_location',
      subject: 'ceremony',
    }, undefined, 'simple_factual'),
    h('hsd-17', 'gdzie dzisiaj jadę?', {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['dziś', 'dzisiaj'],
    }, undefined, 'temporal_workday'),
    h('hsd-18', 'otwórz wesele Nowaków', {
      op: 'open',
      subject: 'wedding',
    }, undefined, 'simple_factual'),
    h('hsd-19', 'gdzie jem w sobotę?', {
      op: 'get_location',
      subject: 'assignment',
      temporalPhraseIncludes: ['sobot'],
    }, undefined, 'temporal_workday'),
    h('hsd-20', 'daleko mam na przygotowania Maksa?', {
      op: 'get_distance',
      subject: 'preparations',
      participantValue: 'Maks',
    }),
    h('hsd-21', 'jaka jest trasa?', {
      op: ['get', 'get_distance'],
      subject: 'route',
    }),
    h('hsd-22', 'ile km z sali do kościoła?', {
      op: 'get_distance',
      subject: 'reception',
      destination: 'ceremony',
    }),
    h('hsd-23', 'gdzie szykuje się Julia?', {
      op: 'get_location',
      subject: 'preparations',
      participantValue: 'Juli',
    }, undefined, 'participants'),
    h('hsd-24', 'a ślub o której będzie?', {
      op: 'get_time',
      subject: 'ceremony',
      requireExplicitSubject: true,
    }, {
      previousOp: 'get_location',
      previousSubject: 'preparations',
      hasSequenceContext: true,
    }, 'explicit_override'),
    h('hsd-25', 'a co potem?', {
      op: 'get_next',
    }, {
      previousOp: 'get_location',
      previousSubject: 'preparations',
      hasSequenceContext: true,
    }, 'sequence'),
    h('hsd-26', 'pokaż trasę', {
      op: ['get', 'get_distance'],
      subject: 'route',
    }),
    h('hsd-27', 'ile jeszcze wiszą?', {
      op: 'get_amount',
      subject: 'remaining',
    }, undefined, 'simple_factual'),
  ]
}

export const ASSISTANT_V4_SUBJECT_DISTANCE_HOLDOUT =
  buildSubjectDistanceHoldout()
