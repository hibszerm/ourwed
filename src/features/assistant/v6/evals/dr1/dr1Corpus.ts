/**
 * V6-DR1 — Small planner + verifier targeted validation corpus (≤8 each).
 */

import type { V6TurnPlan } from '../../turnPlan/types'
import type { V6WeddingPlaceDetailSelector } from '../../detail/weddingPlaceDetail'

export type Dr1PlannerCase = {
  id: string
  utterance: string
  priorUtterances: string[]
  expect: {
    stepKind?: 'INSPECT_WEDDING' | 'SEARCH_COLLECTION' | 'AGGREGATE_COLLECTION'
    detailSelector?: V6WeddingPlaceDetailSelector
    outputKind?:
      | 'DETAIL'
      | 'COLLECTION'
      | 'AGGREGATE'
      | 'UNSUPPORTED'
      | 'CLARIFICATION'
  }
}

export type Dr1VerifierCase = {
  id: string
  utterance: string
  priorUtterances: string[]
  draftPlan: V6TurnPlan
  gold: 'FAITHFUL' | 'NOT_FAITHFUL'
}

export const DR1_PLANNER_CASES: Dr1PlannerCase[] = [
  {
    id: 'p1-ceremony-address',
    utterance: 'Podaj mi adres ceremonii tego ślubu.',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    expect: {
      stepKind: 'INSPECT_WEDDING',
      detailSelector: 'ceremony_address',
      outputKind: 'DETAIL',
    },
  },
  {
    id: 'p2-reception-place',
    utterance: 'A gdzie mają wesele?',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    expect: {
      stepKind: 'INSPECT_WEDDING',
      detailSelector: 'reception_place',
      outputKind: 'DETAIL',
    },
  },
  {
    id: 'p3-groom-prep-place',
    utterance: 'Gdzie on się przygotowuje?',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    expect: {
      stepKind: 'INSPECT_WEDDING',
      detailSelector: 'groom_preparation_place',
      outputKind: 'DETAIL',
    },
  },
  {
    id: 'p4-bride-prep-address-followup',
    utterance: 'A ona — jaki ma adres przygotowań?',
    priorUtterances: [
      'Kiedy mam najbliższy ślub?',
      'Gdzie on się przygotowuje?',
    ],
    expect: {
      stepKind: 'INSPECT_WEDDING',
      detailSelector: 'bride_preparation_address',
      outputKind: 'DETAIL',
    },
  },
  {
    id: 'p5-multi-wedding-ambiguity',
    utterance: 'Podaj adres ceremonii.',
    priorUtterances: ['Pokaż trzy najbliższe wesela.'],
    expect: {
      outputKind: 'DETAIL',
    },
  },
  {
    id: 'p6-collection-regression',
    utterance: 'Pokaż trzy najbliższe wesela.',
    priorUtterances: [],
    expect: {
      stepKind: 'SEARCH_COLLECTION',
      outputKind: 'COLLECTION',
    },
  },
  {
    id: 'p7-aggregate-regression',
    utterance: 'Ile mam wesel zaplanowanych na rok 2027?',
    priorUtterances: [],
    expect: {
      stepKind: 'AGGREGATE_COLLECTION',
      outputKind: 'AGGREGATE',
    },
  },
  {
    id: 'p8-role-switch-bride-place',
    utterance: 'A ona?',
    priorUtterances: [
      'Kiedy mam najbliższy ślub?',
      'Gdzie on się przygotowuje?',
    ],
    expect: {
      stepKind: 'INSPECT_WEDDING',
      detailSelector: 'bride_preparation_place',
      outputKind: 'DETAIL',
    },
  },
]

function inspectDraft(
  selector: V6WeddingPlaceDetailSelector,
  handle = 'col_active',
): V6TurnPlan {
  return {
    steps: [
      {
        id: 's1',
        kind: 'INSPECT_WEDDING',
        inputFromStep: null,
        inputHandle: handle,
        detailSelector: selector,
      },
    ],
    output: { kind: 'DETAIL', fromStep: 's1' },
  }
}

export const DR1_VERIFIER_CASES: Dr1VerifierCase[] = [
  {
    id: 'v1-faithful-ceremony-address',
    utterance: 'Podaj adres ceremonii.',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    draftPlan: inspectDraft('ceremony_address'),
    gold: 'FAITHFUL',
  },
  {
    id: 'v2-faithful-groom-prep',
    utterance: 'Gdzie on się przygotowuje?',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    draftPlan: inspectDraft('groom_preparation_place'),
    gold: 'FAITHFUL',
  },
  {
    id: 'v3-faithful-bride-followup',
    utterance: 'A ona?',
    priorUtterances: [
      'Kiedy mam najbliższy ślub?',
      'Gdzie on się przygotowuje?',
    ],
    draftPlan: inspectDraft('bride_preparation_place'),
    gold: 'FAITHFUL',
  },
  {
    id: 'v4-wrong-place-vs-address',
    utterance: 'Podaj adres ceremonii.',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    draftPlan: inspectDraft('ceremony_place'),
    gold: 'NOT_FAITHFUL',
  },
  {
    id: 'v5-wrong-bride-groom',
    utterance: 'Gdzie on się przygotowuje?',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    draftPlan: inspectDraft('bride_preparation_place'),
    gold: 'NOT_FAITHFUL',
  },
  {
    id: 'v6-restore-only-incomplete',
    utterance: 'Podaj adres ceremonii.',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'RESTORE_COLLECTION',
          inputHandle: 'col_active',
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 's1' },
    },
    gold: 'NOT_FAITHFUL',
  },
  {
    id: 'v7-wrong-collection-handle',
    utterance: 'Gdzie on się przygotowuje?',
    priorUtterances: ['Kiedy mam najbliższy ślub?'],
    draftPlan: inspectDraft('groom_preparation_place', 'col_other'),
    gold: 'NOT_FAITHFUL',
  },
  {
    id: 'v8-normal-collection-plan',
    utterance: 'Pokaż trzy najbliższe wesela.',
    priorUtterances: [],
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: {
            type: 'Search',
            source: 'wedding',
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 3 },
          },
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 's1' },
    },
    gold: 'FAITHFUL',
  },
]
