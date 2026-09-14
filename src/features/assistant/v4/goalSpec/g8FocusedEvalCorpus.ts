/**
 * G8.6 — Focused live subset (~35–45): paraphrases of ambiguity + list+filter
 * (wording intentionally distinct from prompt few-shot exemplars).
 */

import {
  G8_LIVE_EVAL_CORPUS,
  type G8LiveEvalCase,
} from './g8LiveEvalCorpus'

function byId(id: string): G8LiveEvalCase {
  const c = G8_LIVE_EVAL_CORPUS.find((x) => x.id === id)
  if (!c) throw new Error(`missing live case ${id}`)
  return c
}

function flat(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    requestKind: 'domain_query',
    dialogue: 'ask',
    source: 'wedding',
    aggregation: null,
    measure: null,
    temporalExpression: null,
    dateDimension: null,
    dateDimensionAmbiguous: false,
    placeName: null,
    placeRole: null,
    packageName: null,
    extraName: null,
    orderByField: null,
    orderByDirection: null,
    groupByField: null,
    aspect0: null,
    aspect1: null,
    ambiguitySlot0: null,
    ambiguityReason0: null,
    ambiguitySlot1: null,
    ambiguityReason1: null,
    inheritActiveCollection: false,
    correctionTargetSlot: null,
    topicKey: null,
    unsupportedReason: null,
    namedTargetText: null,
    namedTargetKindHint: null,
    ...partial,
  }
}

const CTX_VILLA = {
  hasActiveCollection: true,
  previousGoalSummary: {
    placeName: 'Villa Love',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_LIST = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'list',
    source: 'wedding',
  },
} as const

/** Unseen paraphrases — avoid prompt exemplar tokens (Platinum / 2029 / monetary_measure_unspecified wording). */
const EXTRA: G8LiveEvalCase[] = [
  // A ambiguous monetary measure (paraphrases ≠ "ile to będzie?" only)
  {
    id: 'f86-amb-money-1',
    category: 'ambiguity',
    utterance: 'ile z tego wyjdzie finansowo?',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      measure: null,
      ambiguitySlots: ['measure'],
      executable: false,
    },
  },
  {
    id: 'f86-amb-money-2',
    category: 'ambiguity',
    utterance: 'o jakiej kwocie mówimy?',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      measure: null,
      ambiguitySlots: ['measure'],
      executable: false,
    },
  },
  {
    id: 'f86-amb-money-3',
    category: 'ambiguity',
    utterance: 'ile to będzie?',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      measure: null,
      ambiguitySlots: ['measure'],
      executable: false,
    },
  },
  // B clear monetary measure
  {
    id: 'f86-clear-paid',
    category: 'finance_followup',
    utterance: 'a ile już wpłynęło?',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'f86-clear-cv',
    category: 'simple',
    utterance: 'jaka jest ich łączna wartość umów?',
    semanticContext: CTX_LIST,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  // C ambiguous entity kind (≠ Platinum)
  {
    id: 'f86-amb-ent-1',
    category: 'ambiguity',
    utterance: 'pokaż Gold',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      ambiguitySlots: ['entity_kind'],
      executable: false,
    },
  },
  {
    id: 'f86-amb-ent-2',
    category: 'ambiguity',
    utterance: 'znajdź Premium',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      ambiguitySlots: ['entity_kind'],
      executable: false,
    },
  },
  // D clear typed entity
  {
    id: 'f86-clear-venue',
    category: 'venue',
    utterance: 'ile mam wesel w Villa Love?',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Villa Love',
      executable: true,
    },
  },
  // E–F list + filter (≠ exemplar year 2029)
  {
    id: 'f86-list-year',
    category: 'ellipsis',
    utterance: 'pokaż je w przyszłym roku',
    semanticContext: CTX_VILLA,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'przyszł',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'f86-list-venue',
    category: 'ellipsis',
    utterance: 'pokaż je w Hotelu Starym',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      placeName: 'Hotelu Starym',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'f86-list-venue-2',
    category: 'ellipsis',
    utterance: 'wylistuj te w Pałacu Wilanów',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      placeName: 'Pałac Wilanów',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  // G–H count/sum + filter
  {
    id: 'f86-count-year',
    category: 'relative_date',
    utterance: 'a ile będzie ich w przyszłym roku?',
    semanticContext: CTX_VILLA,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'przyszł',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'f86-sum-year',
    category: 'simple',
    utterance: 'jaka będzie ich łączna wartość w przyszłym roku?',
    semanticContext: CTX_VILLA,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      temporalContains: 'przyszł',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  // I filter-only
  {
    id: 'f86-filter-year',
    category: 'relative_date',
    utterance: 'a w przyszłym roku?',
    semanticContext: CTX_VILLA,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      temporalContains: 'przyszł',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'f86-filter-venue',
    category: 'venue',
    utterance: 'a w Hotelu Starym?',
    semanticContext: CTX_AUG,
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      placeName: 'Hotelu Starym',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  // J fresh ops
  {
    id: 'f86-fresh-list',
    category: 'simple',
    utterance: 'pokaż wesela z września',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'wrześ',
      executable: true,
    },
  },
  {
    id: 'f86-fresh-count',
    category: 'simple',
    utterance: 'ile mam wesel w październiku?',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'październik',
      executable: true,
    },
  },
  {
    id: 'f86-fresh-sum',
    category: 'simple',
    utterance: 'jaka jest łączna wartość wesel w maju?',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      temporalContains: 'maj',
      executable: true,
    },
  },
  // K correction
  {
    id: 'f86-corr',
    category: 'correction',
    utterance: 'nie Villa Love, tylko Hotel Stary',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        placeName: 'Villa Love',
        temporalExpression: '2027',
        aggregation: 'count',
      },
    },
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      placeName: 'Hotel Stary',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  // L–N families
  {
    id: 'f86-help',
    category: 'product_help',
    utterance: 'jak zmienić termin płatności?',
    fixtureFlat: flat(),
    expect: { requestKind: 'product_help', executable: false },
  },
  {
    id: 'f86-legal',
    category: 'unsupported',
    utterance: 'doradź mi jak rozliczyć VAT od wesel',
    fixtureFlat: flat(),
    expect: { requestKind: 'unsupported', executable: false },
  },
  {
    id: 'f86-prep',
    category: 'prepare_action',
    utterance: 'dodaj zadanie, żebym jutro zadzwonił do nich',
    fixtureFlat: flat(),
    expect: { requestKind: 'prepare_action', executable: false },
  },
  // measure absent OK on list
  {
    id: 'f86-measure-absent-ok',
    category: 'simple',
    utterance: 'wypisz wesela sierpniowe',
    fixtureFlat: flat(),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      measure: null,
      temporalContains: 'sierp',
      executable: true,
    },
  },
]

const REGRESSION_IDS = [
  'live-c1-t2-next-year',
  'live-para-next-year-count',
  'live-c2-t2-paid',
  'live-c2-t3-remaining',
  'live-c3-t2-correct-hotel',
  'live-c4-t3-remaining',
  'live-c6-t1-list-sept',
  'live-ell-show',
  'live-ell-year',
  'live-venue-hotel-list',
  'live-amb-which-money',
  'live-amb-entity-kind',
  'live-amb-earnings-week',
  'live-unsup-legal',
  'live-unsup-contract-draft',
  'live-help-payment-due',
] as const

export const G8_FOCUSED_EVAL_CORPUS: G8LiveEvalCase[] = [
  ...EXTRA,
  ...REGRESSION_IDS.map(byId),
]

export function g8FocusedCorpusStats() {
  return {
    n: G8_FOCUSED_EVAL_CORPUS.length,
    extras: EXTRA.length,
    regressionGuards: REGRESSION_IDS.length,
  }
}
