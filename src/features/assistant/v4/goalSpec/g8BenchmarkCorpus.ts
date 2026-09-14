/**
 * G8 benchmark corpus — focused GoalSpec direct-interpreter cases.
 * Goldens are structural expectations; fixtures supply flat model payloads
 * for offline acceptance (no runtime NL heuristics).
 */

export type G8BenchmarkCategory =
  | 'simple'
  | 'venue'
  | 'relative_date'
  | 'year_replace'
  | 'zero_result'
  | 'finance_followup'
  | 'correction'
  | 'ellipsis'
  | 'ambiguity'
  | 'unsupported'
  | 'product_help'
  | 'goal_plan'
  | 'prepare_action'
  | 'sequence'

export type G8BenchmarkCase = {
  id: string
  category: G8BenchmarkCategory
  utterance: string
  /** Compact prior semantic summary (safe) — not TaskSpec. */
  semanticContext?: {
    previousGoalSummary?: {
      requestKind?: string | null
      source?: string | null
      aggregation?: string | null
      measure?: string | null
      placeName?: string | null
      temporalExpression?: string | null
    } | null
    hasActiveCollection?: boolean
  }
  /**
   * Offline fixture: flat GoalSpec model payload.
   * Live eval ignores this and calls the model.
   */
  fixtureFlat: Record<string, unknown>
  expect: {
    requestKind: string
    aggregation?: string | null
    measure?: string | null
    source?: string | null
    placeName?: string | null
    temporalContains?: string | null
    inheritActiveCollection?: boolean
    ambiguitySlots?: string[]
    correctionTarget?: string | null
    topicKey?: string | null
    /** When set, Binder+DQ path is scored against this active DomainQuery context. */
    executable?: boolean
  }
}

function flat(partial: Record<string, unknown>): Record<string, unknown> {
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

export const G8_GOALSPEC_BENCHMARK_CORPUS: G8BenchmarkCase[] = [
  {
    id: 'g8-simple-count-august',
    category: 'simple',
    utterance: 'ile mam wesel w sierpniu?',
    fixtureFlat: flat({
      aggregation: 'count',
      temporalExpression: 'sierpień',
      dateDimension: 'wedding.date',
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      source: 'wedding',
      temporalContains: 'sierp',
      executable: true,
    },
  },
  {
    id: 'g8-simple-list-paraphrase',
    category: 'simple',
    utterance: 'pokaż listę wesel z sierpnia',
    fixtureFlat: flat({
      aggregation: 'list',
      temporalExpression: 'sierpień',
      dateDimension: 'wedding.date',
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'sierp',
      executable: true,
    },
  },
  {
    id: 'g8-venue-villa',
    category: 'venue',
    utterance: 'ile mam wesel w Villa Love?',
    fixtureFlat: flat({
      aggregation: 'count',
      placeName: 'Villa Love',
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Villa Love',
      executable: true,
    },
  },
  {
    id: 'g8-relative-next-year-delta',
    category: 'relative_date',
    utterance: 'a w przyszłym roku?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        requestKind: 'domain_query',
        aggregation: 'count',
        placeName: 'Villa Love',
      },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'count',
      temporalExpression: 'w przyszłym roku',
      dateDimension: 'wedding.date',
      inheritActiveCollection: true,
      placeName: null,
    }),
    expect: {
      requestKind: 'domain_query',
      inheritActiveCollection: true,
      temporalContains: 'przyszł',
      placeName: null,
      executable: true,
    },
  },
  {
    id: 'g8-year-replace-2028',
    category: 'year_replace',
    utterance: 'a w 2028?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        placeName: 'Hotel Stary',
        temporalExpression: '2027',
      },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'count',
      temporalExpression: '2028',
      dateDimension: 'wedding.date',
      inheritActiveCollection: true,
    }),
    expect: {
      requestKind: 'domain_query',
      temporalContains: '2028',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'g8-ellipsis-show-them',
    category: 'ellipsis',
    utterance: 'pokaż je',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: { placeName: 'Villa Love', aggregation: 'count' },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'list',
      inheritActiveCollection: true,
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'g8-finance-paid-followup',
    category: 'finance_followup',
    utterance: 'a zapłacone?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        aggregation: 'count',
        temporalExpression: 'sierpień',
      },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'g8-finance-remaining-followup',
    category: 'finance_followup',
    utterance: 'a ile zostało?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        measure: 'wedding.paid_amount',
        aggregation: 'sum',
      },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
    }),
    expect: {
      requestKind: 'domain_query',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'g8-sum-contract-value',
    category: 'simple',
    utterance: 'jaka jest ich łączna wartość?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: { placeName: 'Villa Love' },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'g8-correction-venue',
    category: 'correction',
    utterance: 'nie Villa Love, tylko Hotel Stary',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: { placeName: 'Villa Love', temporalExpression: '2027' },
    },
    fixtureFlat: flat({
      dialogue: 'correct',
      aggregation: 'count',
      placeName: 'Hotel Stary',
      inheritActiveCollection: true,
      correctionTargetSlot: 'place',
    }),
    expect: {
      requestKind: 'domain_query',
      placeName: 'Hotel Stary',
      correctionTarget: 'place',
      inheritActiveCollection: true,
      executable: true,
    },
  },
  {
    id: 'g8-ambiguity-earnings',
    category: 'ambiguity',
    utterance: 'ile zarobię w przyszłym tygodniu?',
    fixtureFlat: flat({
      aggregation: 'sum',
      measure: null,
      temporalExpression: 'w przyszłym tygodniu',
      dateDimensionAmbiguous: true,
      ambiguitySlot0: 'measure',
      ambiguityReason0: 'earnings_measure_unspecified',
      ambiguitySlot1: 'date_dimension',
      ambiguityReason1: 'week_binds_multiple_date_fields',
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: null,
      ambiguitySlots: ['date_dimension', 'measure'],
      executable: false,
    },
  },
  {
    id: 'g8-product-help',
    category: 'product_help',
    utterance: 'jak zmienić termin płatności?',
    fixtureFlat: flat({
      requestKind: 'product_help',
      source: null,
      topicKey: 'change_payment_due_date',
      aspect0: 'payment.due_date',
    }),
    expect: {
      requestKind: 'product_help',
      topicKey: 'change_payment_due_date',
      executable: false,
    },
  },
  {
    id: 'g8-goal-plan',
    category: 'goal_plan',
    utterance:
      'czy opłaca mi się wracać do domu między tymi dwoma weselami?',
    fixtureFlat: flat({
      requestKind: 'goal_plan',
      source: null,
      topicKey: 'travel_between_weddings',
      aspect0: 'return_home_between',
    }),
    expect: {
      requestKind: 'goal_plan',
      topicKey: 'travel_between_weddings',
      executable: false,
    },
  },
  {
    id: 'g8-prepare-action',
    category: 'prepare_action',
    utterance: 'dodaj zadanie, żebym jutro zadzwonił do nich',
    fixtureFlat: flat({
      requestKind: 'prepare_action',
      source: null,
      topicKey: 'create_task',
      temporalExpression: 'jutro',
      dateDimensionAmbiguous: true,
      namedTargetText: 'nich',
      namedTargetKindHint: 'participant',
      aspect0: 'call',
    }),
    expect: {
      requestKind: 'prepare_action',
      topicKey: 'create_task',
      executable: false,
    },
  },
  {
    id: 'g8-unsupported',
    category: 'unsupported',
    utterance: 'wygeneruj plakat na wesele',
    fixtureFlat: flat({
      requestKind: 'unsupported',
      source: null,
      unsupportedReason: 'image_generation_out_of_scope',
    }),
    expect: {
      requestKind: 'unsupported',
      executable: false,
    },
  },
  {
    id: 'g8-zero-list-delta',
    category: 'zero_result',
    utterance: 'pokaż je',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        placeName: 'Villa Love',
        temporalExpression: '2027',
        aggregation: 'count',
      },
    },
    fixtureFlat: flat({
      dialogue: 'inherit',
      aggregation: 'list',
      inheritActiveCollection: true,
    }),
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  },
]
