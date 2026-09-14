/**
 * S4B — Focused live Luna query-family qualification corpus (~28 cases).
 * Measures interpreter family contract, not phrase memorization.
 */

export type S4bExpectedFamily =
  | 'domain_query'
  | 'prepare_action'
  | 'product_help'
  | 'goal_plan'
  | 'unsupported'

export type S4bCaseClass =
  | 'A_explicit_resolved'
  | 'B_ambiguous_monetary'
  | 'C_missing_measure_monetary'
  | 'D_temporal_follow_up'
  | 'E_list_projection_follow_up'
  | 'F_venue_filter'
  | 'G_correction'
  | 'H_genuine_unsupported'
  | 'I_prepare_action'
  | 'J_product_help'
  | 'K_goal_plan'

export type S4bQualCase = {
  id: string
  class: S4bCaseClass
  utterance: string
  semanticContext: unknown
  expectedFamily: S4bExpectedFamily
  /** Supported query with incomplete slots — must emit domain_query. */
  incompleteSupportedQuery: boolean
  /** Must not become domain_query (false-promotion gate). */
  falsePromotionSensitive: boolean
  /** Expect measure=null and measure ambiguity present. */
  expectMeasureAmbiguity: boolean
  /** Expect a specific concrete measure (or null = must stay null / don't care). */
  expectMeasure?: string | null
  /** Expect aggregation when asserted. */
  expectAggregation?: string | null
  /** Temporal expression should contain (case-insensitive substring) when set. */
  expectTemporalContains?: string
  /** Expect inherit / correct dialogue when set. */
  expectDialogue?: 'ask' | 'inherit' | 'correct'
  /** Expect placeName surface when set. */
  expectPlaceContains?: string
  notes?: string
}

const CTX_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_PAID_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    source: 'wedding',
  },
} as const

const CTX_LIST_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'list',
    source: 'wedding',
  },
} as const

export const S4B_QUERY_FAMILY_QUAL_CORPUS: readonly S4bQualCase[] = [
  // A — explicit resolved queries
  {
    id: 's4b-a1',
    class: 'A_explicit_resolved',
    utterance: 'Ile już wpłynęło z wesel w sierpniu?',
    semanticContext: null,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectMeasure: 'wedding.paid_amount',
    expectAggregation: 'sum',
  },
  {
    id: 's4b-a2',
    class: 'A_explicit_resolved',
    utterance: 'Jaka jest łączna wartość umów weselnych w tym roku?',
    semanticContext: null,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectMeasure: 'wedding.contract_value',
    expectAggregation: 'sum',
  },
  {
    id: 's4b-a3',
    class: 'A_explicit_resolved',
    utterance: 'a ile już wpłynęło?',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectMeasure: 'wedding.paid_amount',
    expectAggregation: 'sum',
    expectDialogue: 'inherit',
  },

  // B — ambiguous monetary (historical U4.7 stress)
  {
    id: 's4b-b1',
    class: 'B_ambiguous_monetary',
    utterance: 'Ile to będzie?',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
    expectAggregation: 'sum',
    notes: 'critical historical U4.7 shape',
  },
  {
    id: 's4b-b2',
    class: 'B_ambiguous_monetary',
    utterance: 'ile z tego wyjdzie finansowo?',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
    expectAggregation: 'sum',
  },
  {
    id: 's4b-b3',
    class: 'B_ambiguous_monetary',
    utterance: 'o jakiej kwocie mówimy?',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
  },
  {
    id: 's4b-b4',
    class: 'B_ambiguous_monetary',
    utterance: 'ile to wyjdzie?',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
    expectAggregation: 'sum',
  },

  // C — missing-measure monetary (standalone / sparse)
  {
    id: 's4b-c1',
    class: 'C_missing_measure_monetary',
    utterance: 'Podsumuj mi pieniądze z tych wesel.',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
    expectAggregation: 'sum',
  },
  {
    id: 's4b-c2',
    class: 'C_missing_measure_monetary',
    utterance: 'Ile łącznie finansowo?',
    semanticContext: CTX_LIST_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
  },

  // D — temporal follow-up
  // Temporal follow-ups: accept inherit OR correct (slot replacement of date).
  // Primary gate is temporalExpression / DQ date, not dialogue enum purity.
  {
    id: 's4b-d1',
    class: 'D_temporal_follow_up',
    utterance: 'a w przyszłym roku?',
    semanticContext: CTX_PAID_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectTemporalContains: 'przyszł',
  },
  {
    id: 's4b-d2',
    class: 'D_temporal_follow_up',
    utterance: 'a we wrześniu?',
    semanticContext: CTX_PAID_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectTemporalContains: 'wrześ',
  },

  // E — list projection follow-up
  {
    id: 's4b-e1',
    class: 'E_list_projection_follow_up',
    utterance: 'pokaż je',
    semanticContext: CTX_PAID_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectAggregation: 'list',
    expectDialogue: 'inherit',
  },
  {
    id: 's4b-e2',
    class: 'E_list_projection_follow_up',
    utterance: 'wypisz te wesela',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectAggregation: 'list',
  },

  // F — venue filter
  {
    id: 's4b-f1',
    class: 'F_venue_filter',
    utterance: 'ile mam wesel w Villa Love?',
    semanticContext: null,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectAggregation: 'count',
    expectPlaceContains: 'Villa Love',
  },
  {
    id: 's4b-f2',
    class: 'F_venue_filter',
    utterance: 'pokaż wesela z Dworem pod Lipami',
    semanticContext: null,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectAggregation: 'list',
    expectPlaceContains: 'Lipami',
  },

  // G — correction
  {
    id: 's4b-g1',
    class: 'G_correction',
    utterance: 'nie, chodziło o pozostało',
    semanticContext: CTX_PAID_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectMeasure: 'wedding.remaining_amount',
    expectDialogue: 'correct',
  },
  {
    id: 's4b-g2',
    class: 'G_correction',
    utterance: 'właściwie wartość umowy, nie wpłaty',
    semanticContext: CTX_PAID_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectMeasure: 'wedding.contract_value',
    expectDialogue: 'correct',
  },

  // H — genuine unsupported (must NOT become domain_query)
  {
    id: 's4b-h1',
    class: 'H_genuine_unsupported',
    utterance: 'Jaka jest stawka VAT na usługi fotograficzne w UE?',
    semanticContext: null,
    expectedFamily: 'unsupported',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },
  {
    id: 's4b-h2',
    class: 'H_genuine_unsupported',
    utterance: 'Napisz mi wiersz o księżycu.',
    semanticContext: null,
    expectedFamily: 'unsupported',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },
  {
    id: 's4b-h3',
    class: 'H_genuine_unsupported',
    utterance: 'Ile kosztuje bilet na Marsa?',
    semanticContext: CTX_AUG,
    expectedFamily: 'unsupported',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
    notes: 'context present but request outside family — no false promotion',
  },

  // I — prepare_action
  {
    id: 's4b-i1',
    class: 'I_prepare_action',
    utterance: 'Przygotuj draft wiadomości do pary o zaliczce.',
    semanticContext: null,
    expectedFamily: 'prepare_action',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },
  {
    id: 's4b-i2',
    class: 'I_prepare_action',
    utterance: 'Wyślij umowę do klienta.',
    semanticContext: null,
    expectedFamily: 'prepare_action',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },

  // J — product_help
  {
    id: 's4b-j1',
    class: 'J_product_help',
    utterance: 'Gdzie w OurWed ustawię termin płatności?',
    semanticContext: null,
    expectedFamily: 'product_help',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },
  {
    id: 's4b-j2',
    class: 'J_product_help',
    utterance: 'Jak dodać zadanie do wesela w aplikacji?',
    semanticContext: null,
    expectedFamily: 'product_help',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },

  // K — goal_plan
  {
    id: 's4b-k1',
    class: 'K_goal_plan',
    utterance: 'Czy dam radę zrobić dwa wesela tego samego dnia w różnych miastach?',
    semanticContext: null,
    expectedFamily: 'goal_plan',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },
  {
    id: 's4b-k2',
    class: 'K_goal_plan',
    utterance: 'Zaplanuj jak ogarnąć terminy dostaw na ten sezon.',
    semanticContext: null,
    expectedFamily: 'goal_plan',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: true,
    expectMeasureAmbiguity: false,
  },

  // Extra historical stress: ambiguous without prior context
  {
    id: 's4b-b5',
    class: 'B_ambiguous_monetary',
    utterance: 'Ile to będzie?',
    semanticContext: null,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: true,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: true,
    expectMeasure: null,
    notes: 'standalone ambiguous money — still domain_query',
  },
  {
    id: 's4b-f3',
    class: 'F_venue_filter',
    utterance: 'a w Villa Love?',
    semanticContext: CTX_AUG,
    expectedFamily: 'domain_query',
    incompleteSupportedQuery: false,
    falsePromotionSensitive: false,
    expectMeasureAmbiguity: false,
    expectPlaceContains: 'Villa Love',
    expectDialogue: 'inherit',
  },
]

export function s4bCorpusStats() {
  const byClass: Record<string, number> = {}
  let incomplete = 0
  let falsePromo = 0
  for (const c of S4B_QUERY_FAMILY_QUAL_CORPUS) {
    byClass[c.class] = (byClass[c.class] ?? 0) + 1
    if (c.incompleteSupportedQuery) incomplete += 1
    if (c.falsePromotionSensitive) falsePromo += 1
  }
  return {
    total: S4B_QUERY_FAMILY_QUAL_CORPUS.length,
    byClass,
    incompleteSupportedQuery: incomplete,
    falsePromotionSensitive: falsePromo,
  }
}
