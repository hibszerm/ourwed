/**
 * V6-VF1 — Verifier-only semantic regression (synthetic; no planner/CRM).
 */

import type { V6CollectionSummary } from '../../collections/summary'
import type { V6TurnPlan } from '../../turnPlan/types'
import type { V6SemanticVerifierVerdict } from '../../verification/semanticVerifier'

export type Vf1Case = {
  id: string
  class:
    | 'root_reset_locality'
    | 'root_reset_venue'
    | 'root_reset_empty_prior'
    | 'root_reset_nonempty_prior'
    | 'wrong_root_when_refine'
    | 'wrong_place_value'
    | 'missing_place'
    | 'root_drops_prior_year_place'
  gold: V6SemanticVerifierVerdict
  note: string
  utterance: string
  priorUtterances: string[]
  collectionSummaries: V6CollectionSummary[]
  draftTurnPlan: V6TurnPlan
}

function summary(
  partial: Partial<V6CollectionSummary> & { handle: string },
): V6CollectionSummary {
  return {
    handle: partial.handle,
    active: partial.active ?? true,
    source: partial.source ?? 'wedding',
    totalCount: partial.totalCount ?? 3,
    ordering: partial.ordering ?? null,
    parentHandle: partial.parentHandle ?? null,
    temporalSummary: partial.temporalSummary ?? null,
    placeSummary: partial.placeSummary ?? null,
    excludePlaceSummary: partial.excludePlaceSummary ?? null,
    sliceSummary: partial.sliceSummary ?? null,
    preview: partial.preview ?? [],
    lineageDepth: partial.lineageDepth ?? 1,
  }
}

const rootSearchPlace = (value: string): V6TurnPlan => ({
  steps: [
    {
      id: 's1',
      kind: 'SEARCH_COLLECTION',
      search: {
        type: 'Search',
        source: 'wedding',
        filters: [
          { field: 'place.name', op: 'contains', value, role: 'any' },
        ],
      },
    },
  ],
  output: { kind: 'COLLECTION', fromStep: 's1' },
})

const year2027Active = summary({
  handle: 'col_1',
  active: true,
  totalCount: 4,
  temporalSummary: 'year:2027',
  placeSummary: null,
  lineageDepth: 1,
})

const emptyPlacePrior = summary({
  handle: 'col_2',
  active: true,
  totalCount: 0,
  parentHandle: 'col_1',
  temporalSummary: 'future_from_now',
  placeSummary: 'eq:Hotel Example',
  sliceSummary: 'offset:0,limit:4',
  preview: [],
  lineageDepth: 2,
})

const nonemptyNearest = summary({
  handle: 'col_1',
  active: true,
  totalCount: 3,
  temporalSummary: 'future_from_now',
  sliceSummary: 'offset:0,limit:3',
  ordering: { field: 'wedding.date', direction: 'asc' },
  preview: [
    { displayName: 'Sample A', date: '2026-10-01', ordinal: 1 },
    { displayName: 'Sample B', date: '2026-10-08', ordinal: 2 },
    { displayName: 'Sample C', date: '2026-11-12', ordinal: 3 },
  ],
  lineageDepth: 1,
})

/** Sanitized CR1.1 FP-class equivalent. */
export const VF1_CASES: Vf1Case[] = [
  {
    id: 'vf1-v1-root-locality',
    class: 'root_reset_locality',
    gold: 'FAITHFUL',
    note: 'Explicit root reset; locality-like place via place.name',
    priorUtterances: ['Pokaż śluby z 2027'],
    utterance:
      'Odłóżmy ten wycinek — pokaż teraz wszystkie moje wesela w Gdyni',
    collectionSummaries: [year2027Active],
    draftTurnPlan: rootSearchPlace('Gdynia'),
  },
  {
    id: 'vf1-v2-root-venue',
    class: 'root_reset_venue',
    gold: 'FAITHFUL',
    note: 'Explicit root reset; venue-like place via place.name',
    priorUtterances: ['Pokaż śluby z 2027'],
    utterance:
      'Zacznijmy od nowa: wypisz wszystkie śluby w Pałacu Nad Jeziorem',
    collectionSummaries: [year2027Active],
    draftTurnPlan: rootSearchPlace('Pałac Nad Jeziorem'),
  },
  {
    id: 'vf1-v3-root-empty-prior',
    class: 'root_reset_empty_prior',
    gold: 'FAITHFUL',
    note: 'CR1.1 FP class: root reset after empty prior; place.name locality',
    priorUtterances: [
      'Wypisz cztery najbliższe wesela przede mną',
      'Spośród nich zostaw wyłącznie przyjęcia w Hotelu Example',
      'Ile łącznie zostało mi od nich do zapłaty?',
    ],
    utterance:
      'Odłóżmy ten zestaw — przejrzyjmy teraz wszystkie moje śluby w Toruniu',
    collectionSummaries: [
      emptyPlacePrior,
      summary({
        handle: 'col_1',
        active: false,
        totalCount: 4,
        temporalSummary: 'future_from_now',
        sliceSummary: 'offset:0,limit:4',
        lineageDepth: 1,
      }),
    ],
    draftTurnPlan: rootSearchPlace('Toruń'),
  },
  {
    id: 'vf1-v4-root-nonempty-prior',
    class: 'root_reset_nonempty_prior',
    gold: 'FAITHFUL',
    note: 'Same root-reset semantics after non-empty prior',
    priorUtterances: ['Pokaż trzy najbliższe wesela'],
    utterance:
      'Koniec z tą trójką — pokaż teraz wszystkie moje wesela w Opolu',
    collectionSummaries: [nonemptyNearest],
    draftTurnPlan: rootSearchPlace('Opole'),
  },
  {
    id: 'vf1-v5-wrong-root-when-refine',
    class: 'wrong_root_when_refine',
    gold: 'NOT_FAITHFUL',
    note: 'User refers to prior set; root search loses collection identity',
    priorUtterances: ['Pokaż trzy najbliższe wesela'],
    utterance: 'Ile łącznie zostało mi od nich do zapłaty?',
    collectionSummaries: [nonemptyNearest],
    draftTurnPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: {
            type: 'Search',
            source: 'wedding',
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
          },
        },
        {
          id: 's2',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: 's1',
          inputHandle: null,
          aggregation: 'sum',
          measure: 'remaining_amount',
        },
      ],
      output: { kind: 'AGGREGATE', fromStep: 's2' },
    },
  },
  {
    id: 'vf1-v6-wrong-place-value',
    class: 'wrong_place_value',
    gold: 'NOT_FAITHFUL',
    note: 'Requested place A; plan uses place.name B',
    priorUtterances: [],
    utterance: 'Pokaż wszystkie moje śluby w Katowicach',
    collectionSummaries: [],
    draftTurnPlan: rootSearchPlace('Lublin'),
  },
  {
    id: 'vf1-v7-missing-place',
    class: 'missing_place',
    gold: 'NOT_FAITHFUL',
    note: 'Requested place constraint omitted',
    priorUtterances: ['Pokaż śluby z 2026'],
    utterance:
      'Zapomnij o roku — pokaż teraz wszystkie wesela w Rzeszowie',
    collectionSummaries: [
      summary({
        handle: 'col_1',
        active: true,
        totalCount: 5,
        temporalSummary: 'year:2026',
      }),
    ],
    draftTurnPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: {
            type: 'Search',
            source: 'wedding',
          },
        },
      ],
      output: { kind: 'COLLECTION', fromStep: 's1' },
    },
  },
  {
    id: 'vf1-v8-root-drops-year-place',
    class: 'root_drops_prior_year_place',
    gold: 'FAITHFUL',
    note: 'Root reset correctly drops prior year+place',
    priorUtterances: [
      'Pokaż śluby z 2028 w Hotelu Riviera',
    ],
    utterance:
      'Od nowa ze wszystkich: wypisz śluby w Bydgoszczy',
    collectionSummaries: [
      summary({
        handle: 'col_1',
        active: true,
        totalCount: 2,
        temporalSummary: 'year:2028',
        placeSummary: 'contains:Hotel Riviera',
      }),
    ],
    draftTurnPlan: rootSearchPlace('Bydgoszcz'),
  },
]
