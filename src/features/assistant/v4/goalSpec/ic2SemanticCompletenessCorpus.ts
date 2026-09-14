/**
 * IC2 — Focused semantic-completeness corpus (typed shape expectations).
 * Polish natural paraphrases; scoring uses GoalSpec structure, not keywords.
 */

import type { Ic2ShapeExpectation } from './ic2SemanticShape'

export type Ic2Family =
  | 'group_rank'
  | 'top_n'
  | 'avg_min_max'
  | 'temporal_remainder'
  | 'comparison'
  | 'negation'
  | 'relation_composition'
  | 'participant_filter'
  | 'follow_up'
  | 'unsupported_rich'
  | 'simple_supported'
  | 'ambiguous'
  | 'critical_qa'

export type Ic2Case = {
  id: string
  family: Ic2Family
  utterance: string
  semanticContext: unknown
  expectation: Ic2ShapeExpectation
  /** Gate buckets */
  isCriticalQa?: boolean
  isSupportedSimple?: boolean
  isFollowUp?: boolean
  isUnsupportedRich?: boolean
  /** False-promotion / false-measure sensitive (S4B-style). */
  falsePromotionSensitive?: boolean
  falseConcreteMeasureSensitive?: boolean
  notes?: string
}

const CTX_COUNT_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'count',
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

const CTX_COUNT_YEAR = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: '2027',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const GROUP_RANK: Ic2ShapeExpectation = {
  require: [
    'not_plain_count_without_group_rank',
    'not_simplified_list_or_sum',
    'grouping',
    'ranking_or_order',
  ],
  allowUnsupportedSafe: true,
}

const TOP_N: Ic2ShapeExpectation = {
  require: [
    'not_plain_count_without_group_rank',
    'not_simplified_list_or_sum',
    'top_n_limit',
    'ranking_or_order',
  ],
  allowUnsupportedSafe: true,
}

const TEMPORAL_REMAINDER: Ic2ShapeExpectation = {
  require: ['not_plain_unrestricted_count', 'temporal_expression'],
  allowUnsupportedSafe: true,
}

const COMPARISON: Ic2ShapeExpectation = {
  require: [
    'not_plain_count_without_group_rank',
    'not_simplified_list_or_sum',
  ],
  allowUnsupportedSafe: true,
}

const NEGATION: Ic2ShapeExpectation = {
  require: [
    'not_plain_count_without_group_rank',
    'not_simplified_list_or_sum',
  ],
  allowUnsupportedSafe: true,
}

const UNSUPPORTED_RICH: Ic2ShapeExpectation = {
  // Safe = typed unsupported OR any non-simplified rich shape (never plain count/list/sum).
  require: [
    'not_plain_count_without_group_rank',
    'not_simplified_list_or_sum',
  ],
  allowUnsupportedSafe: true,
}

const SIMPLE_COUNT_YEAR: Ic2ShapeExpectation = {
  require: [
    'request_domain_query',
    'aggregation_count',
    'temporal_expression',
  ],
  allowUnsupportedSafe: false,
}

const FOLLOW_LIST: Ic2ShapeExpectation = {
  require: [
    'request_domain_query',
    'aggregation_list',
    'dialogue_inherit',
    'inherit_active_collection',
  ],
  allowUnsupportedSafe: false,
}

export const IC2_SEMANTIC_COMPLETENESS_CORPUS: readonly Ic2Case[] = [
  // --- Critical original QA probes ---
  {
    id: 'ic2-crit-month-most',
    family: 'critical_qa',
    utterance: 'W którym miesiącu mam najwięcej wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
    isCriticalQa: true,
    notes: 'original QA — must not plain count',
  },
  {
    id: 'ic2-crit-remaining-year',
    family: 'critical_qa',
    utterance: 'Ile mam jeszcze wesel do końca tego roku?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
    isCriticalQa: true,
    notes: 'original QA — must not unrestricted count',
  },
  {
    id: 'ic2-crit-show-them',
    family: 'critical_qa',
    utterance: 'Pokaż je',
    semanticContext: CTX_LIST_AUG,
    expectation: FOLLOW_LIST,
    isCriticalQa: true,
    isFollowUp: true,
  },

  // --- 1. group / rank (paraphrases; ≥10 draws across family) ---
  {
    id: 'ic2-gr-01',
    family: 'group_rank',
    utterance: 'W którym miesiącu mam najwięcej wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-02',
    family: 'group_rank',
    utterance: 'Który miesiąc ma u mnie najwięcej ślubów?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-03',
    family: 'group_rank',
    utterance: 'W jakim miesiącu mam największą liczbę wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-04',
    family: 'group_rank',
    utterance: 'Pokaż miesiąc z największą liczbą wesel',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-05',
    family: 'group_rank',
    utterance: 'Który miesiąc jest u mnie najmocniejszy pod względem liczby wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-06',
    family: 'group_rank',
    utterance: 'W którym miesiącu mam najmniej wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-07',
    family: 'group_rank',
    utterance: 'Rozbij wesela według miesięcy i wskaż szczyt',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-08',
    family: 'group_rank',
    utterance: 'Który rok miał u mnie najwięcej wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-09',
    family: 'group_rank',
    utterance: 'W której lokalizacji mam najwięcej wesel?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-10',
    family: 'group_rank',
    utterance: 'Jaki miesiąc dominuje pod względem liczby ślubów?',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-11',
    family: 'group_rank',
    utterance: 'Uszereguj miesiące według liczby wesel',
    semanticContext: null,
    expectation: GROUP_RANK,
  },
  {
    id: 'ic2-gr-12',
    family: 'group_rank',
    utterance: 'Podaj miesiąc z najwyższą liczbą wesel w kalendarzu',
    semanticContext: null,
    expectation: GROUP_RANK,
  },

  // --- 2. top-N ---
  {
    id: 'ic2-tn-01',
    family: 'top_n',
    utterance: 'Pokaż top 3 lokalizacje weselne',
    semanticContext: null,
    expectation: TOP_N,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-tn-02',
    family: 'top_n',
    utterance: 'Jakie są trzy najczęściej wybierane sale?',
    semanticContext: null,
    expectation: TOP_N,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-tn-03',
    family: 'top_n',
    utterance: 'Wymień 5 miesięcy z największą liczbą wesel',
    semanticContext: null,
    expectation: TOP_N,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-tn-04',
    family: 'top_n',
    utterance: 'Podaj dwie lokalizacje z największą liczbą ślubów',
    semanticContext: null,
    expectation: TOP_N,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-tn-05',
    family: 'top_n',
    utterance: 'Top 10 wesel według wartości umowy',
    semanticContext: null,
    expectation: {
      require: ['top_n_limit', 'ranking_or_order', 'not_simplified_list_or_sum'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-tn-06',
    family: 'top_n',
    utterance: 'Pokaż pierwsze trzy wesela w kolejności daty',
    semanticContext: null,
    expectation: {
      require: ['top_n_limit', 'ranking_or_order'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },

  // --- 3. average / min / max ---
  {
    id: 'ic2-amm-01',
    family: 'avg_min_max',
    utterance: 'Jaka jest średnia wartość umowy na przyszły rok?',
    semanticContext: null,
    expectation: {
      require: ['avg', 'measure_contract_value', 'temporal_expression'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-02',
    family: 'avg_min_max',
    utterance: 'Ile wynosi przeciętna wartość kontraktu weselnego w 2027?',
    semanticContext: null,
    expectation: {
      require: ['avg', 'measure_contract_value', 'temporal_expression'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-03',
    family: 'avg_min_max',
    utterance: 'Które wesele jest najwcześniejsze?',
    semanticContext: null,
    expectation: {
      require: ['min', 'not_plain_count_without_group_rank'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-04',
    family: 'avg_min_max',
    utterance: 'Które wesele mam najpóźniej w kalendarzu?',
    semanticContext: null,
    expectation: {
      require: ['max', 'not_plain_count_without_group_rank'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-05',
    family: 'avg_min_max',
    utterance: 'Jaka jest maksymalna wartość umowy wśród wesel?',
    semanticContext: null,
    expectation: {
      require: ['max', 'measure_contract_value'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-06',
    family: 'avg_min_max',
    utterance: 'Jaka jest minimalna wpłacona kwota na wesela w sierpniu?',
    semanticContext: null,
    expectation: {
      require: ['min', 'measure_paid', 'temporal_expression'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-07',
    family: 'avg_min_max',
    utterance: 'Policz średnią pozostałą kwotę do zapłaty',
    semanticContext: null,
    expectation: {
      require: ['avg', 'measure_remaining'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-amm-08',
    family: 'avg_min_max',
    utterance: 'Pokaż wesele z najwyższą wartością umowy',
    semanticContext: null,
    expectation: {
      require: ['max', 'measure_contract_value', 'not_simplified_list_or_sum'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },

  // --- 4. temporal remainder / open range (≥10) ---
  {
    id: 'ic2-tr-01',
    family: 'temporal_remainder',
    utterance: 'Ile mam jeszcze wesel do końca tego roku?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-02',
    family: 'temporal_remainder',
    utterance: 'Ile wesel zostało mi do końca roku?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-03',
    family: 'temporal_remainder',
    utterance: 'Ile mam jeszcze ślubów w tym roku od dziś?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-04',
    family: 'temporal_remainder',
    utterance: 'Ile wesel mam od teraz do końca września?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-05',
    family: 'temporal_remainder',
    utterance: 'Ile zostało wesel w tym miesiącu?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-06',
    family: 'temporal_remainder',
    utterance: 'Policz wesela po dzisiejszej dacie do końca roku',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-07',
    family: 'temporal_remainder',
    utterance: 'Ile mam wesel od dziś wzwyż w tym sezonie?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-08',
    family: 'temporal_remainder',
    utterance: 'Pokaż wesela które jeszcze zostały do końca roku',
    semanticContext: null,
    expectation: {
      require: ['not_plain_unrestricted_count', 'temporal_expression'],
      allowUnsupportedSafe: true,
    },
  },
  {
    id: 'ic2-tr-09',
    family: 'temporal_remainder',
    utterance: 'Ile wesel mam przed końcem października?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-10',
    family: 'temporal_remainder',
    utterance: 'Od teraz do grudnia — ile mam wesel?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-11',
    family: 'temporal_remainder',
    utterance: 'Ile mam jeszcze wesel w pozostałej części roku?',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },
  {
    id: 'ic2-tr-12',
    family: 'temporal_remainder',
    utterance: 'Policz wesela po dziś aż do końca 2026',
    semanticContext: null,
    expectation: TEMPORAL_REMAINDER,
  },

  // --- 5. comparison ---
  {
    id: 'ic2-cmp-01',
    family: 'comparison',
    utterance: 'Czy w 2027 mam więcej wesel niż w 2026?',
    semanticContext: null,
    expectation: COMPARISON,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-cmp-02',
    family: 'comparison',
    utterance: 'Porównaj liczbę wesel w sierpniu i we wrześniu',
    semanticContext: null,
    expectation: COMPARISON,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-cmp-03',
    family: 'comparison',
    utterance: 'Który rok był lepszy pod względem wartości umów: 2025 czy 2026?',
    semanticContext: null,
    expectation: COMPARISON,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-cmp-04',
    family: 'comparison',
    utterance: 'Czy Villa Love ma więcej wesel niż Dwór Sarbinowo?',
    semanticContext: null,
    expectation: COMPARISON,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-cmp-05',
    family: 'comparison',
    utterance: 'Porównaj wpływy z sierpnia i września',
    semanticContext: null,
    expectation: COMPARISON,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-cmp-06',
    family: 'comparison',
    utterance: 'Czy mam więcej wesel w Krakowie czy w Warszawie?',
    semanticContext: null,
    expectation: COMPARISON,
    isUnsupportedRich: true,
  },

  // --- 6. negation / exclusion ---
  {
    id: 'ic2-neg-01',
    family: 'negation',
    utterance: 'Pokaż wesela oprócz Villa Love',
    semanticContext: null,
    expectation: NEGATION,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-neg-02',
    family: 'negation',
    utterance: 'Ile mam wesel bez sali w Pałacu',
    semanticContext: null,
    expectation: NEGATION,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-neg-03',
    family: 'negation',
    utterance: 'Wypisz wesela z wyłączeniem lokalizacji Dwór',
    semanticContext: null,
    expectation: NEGATION,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-neg-04',
    family: 'negation',
    utterance: 'Policz wesela nie w Krakowie',
    semanticContext: null,
    expectation: NEGATION,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-neg-05',
    family: 'negation',
    utterance: 'Pokaż wszystko poza weselami w Villa Love',
    semanticContext: null,
    expectation: NEGATION,
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-neg-06',
    family: 'negation',
    utterance: 'Ile mam wesel z wyłączeniem tych w Warszawie?',
    semanticContext: null,
    expectation: NEGATION,
    isUnsupportedRich: true,
  },

  // --- 7. relation composition (temporal + venue + measure) ---
  {
    id: 'ic2-rel-01',
    family: 'relation_composition',
    utterance: 'Ile już wpłynęło z wesel w Villa Love w sierpniu?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_paid',
        'temporal_expression',
        'place_relation',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-rel-02',
    family: 'relation_composition',
    utterance: 'Jaka jest łączna wartość umów w Dworze Sarbinowo w 2027?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_contract_value',
        'temporal_expression',
        'place_relation',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-rel-03',
    family: 'relation_composition',
    utterance: 'Policz wesela w Krakowie w przyszłym roku',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_count',
        'temporal_expression',
        'place_relation',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-rel-04',
    family: 'relation_composition',
    utterance: 'Ile pozostało do zapłaty z wesel w Pałacu w sierpniu?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_remaining',
        'temporal_expression',
        'place_relation',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-rel-05',
    family: 'relation_composition',
    utterance: 'Pokaż wesela w Villa Love w 2028',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_list',
        'temporal_expression',
        'place_relation',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },

  // --- 8. participant filter ---
  {
    id: 'ic2-part-01',
    family: 'participant_filter',
    utterance: 'Pokaż wesela gdzie panią młodą jest Anna',
    semanticContext: null,
    expectation: {
      require: ['not_plain_unrestricted_count', 'named_target'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-part-02',
    family: 'participant_filter',
    utterance: 'Ile mam wesel z udziałem Jana Kowalskiego?',
    semanticContext: null,
    expectation: {
      require: ['not_plain_unrestricted_count', 'named_target'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-part-03',
    family: 'participant_filter',
    utterance: 'Znajdź wesele pary Julia i Tomasz',
    semanticContext: null,
    expectation: {
      require: ['not_plain_unrestricted_count'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-part-04',
    family: 'participant_filter',
    utterance: 'Które wesela mają uczestnika o nazwisku Nowak?',
    semanticContext: null,
    expectation: {
      require: ['not_plain_unrestricted_count'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },
  {
    id: 'ic2-part-05',
    family: 'participant_filter',
    utterance: 'Pokaż wesela klienta Marta Zielińska',
    semanticContext: null,
    expectation: {
      require: ['not_plain_unrestricted_count'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
  },

  // --- 9. follow-ups ---
  {
    id: 'ic2-fu-01',
    family: 'follow_up',
    utterance: 'Pokaż je',
    semanticContext: CTX_COUNT_AUG,
    expectation: FOLLOW_LIST,
    isFollowUp: true,
  },
  {
    id: 'ic2-fu-02',
    family: 'follow_up',
    utterance: 'a wylistuj',
    semanticContext: CTX_COUNT_YEAR,
    expectation: FOLLOW_LIST,
    isFollowUp: true,
  },
  {
    id: 'ic2-fu-03',
    family: 'follow_up',
    utterance: 'pokaż listę',
    semanticContext: CTX_COUNT_AUG,
    expectation: FOLLOW_LIST,
    isFollowUp: true,
  },
  {
    id: 'ic2-fu-04',
    family: 'follow_up',
    utterance: 'a ile już wpłynęło?',
    semanticContext: CTX_COUNT_AUG,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_paid',
        'dialogue_inherit',
      ],
      allowUnsupportedSafe: false,
    },
    isFollowUp: true,
    isSupportedSimple: true,
  },
  {
    id: 'ic2-fu-05',
    family: 'follow_up',
    utterance: 'a w 2028?',
    semanticContext: CTX_COUNT_YEAR,
    expectation: {
      require: [
        'request_domain_query',
        'temporal_expression',
        'inherit_active_collection',
      ],
      allowUnsupportedSafe: false,
    },
    isFollowUp: true,
    isSupportedSimple: true,
    notes: 'temporal override may use dialogue=correct or inherit',
  },
  {
    id: 'ic2-fu-06',
    family: 'follow_up',
    utterance: 'pokaż je jeszcze raz',
    semanticContext: CTX_LIST_AUG,
    expectation: FOLLOW_LIST,
    isFollowUp: true,
  },
  {
    id: 'ic2-fu-07',
    family: 'follow_up',
    utterance: 'a ile ich jest?',
    semanticContext: CTX_LIST_AUG,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_count',
        'dialogue_inherit',
        'inherit_active_collection',
      ],
      allowUnsupportedSafe: false,
    },
    isFollowUp: true,
    isSupportedSimple: true,
  },
  {
    id: 'ic2-fu-08',
    family: 'follow_up',
    utterance: 'zmień na listę',
    semanticContext: CTX_COUNT_AUG,
    expectation: FOLLOW_LIST,
    isFollowUp: true,
  },

  // --- 10. unsupported-but-meaningful analytics ---
  {
    id: 'ic2-ur-01',
    family: 'unsupported_rich',
    utterance: 'Jaki jest trend liczby wesel miesiąc do miesiąca w ostatnich 3 latach?',
    semanticContext: null,
    expectation: UNSUPPORTED_RICH,
    isUnsupportedRich: true,
    falsePromotionSensitive: true,
  },
  {
    id: 'ic2-ur-02',
    family: 'unsupported_rich',
    utterance: 'Prognozuj ile wesel będę mieć w 2030',
    semanticContext: null,
    expectation: UNSUPPORTED_RICH,
    isUnsupportedRich: true,
    falsePromotionSensitive: true,
  },
  {
    id: 'ic2-ur-03',
    family: 'unsupported_rich',
    utterance: 'Policz korelację między wartością umowy a lokalizacją',
    semanticContext: null,
    expectation: UNSUPPORTED_RICH,
    isUnsupportedRich: true,
    falsePromotionSensitive: true,
  },
  {
    id: 'ic2-ur-04',
    family: 'unsupported_rich',
    utterance: 'Narysuj histogram wesel według miesiąca',
    semanticContext: null,
    expectation: {
      require: ['not_plain_count_without_group_rank'],
      allowUnsupportedSafe: true,
    },
    isUnsupportedRich: true,
    falsePromotionSensitive: true,
  },
  {
    id: 'ic2-ur-05',
    family: 'unsupported_rich',
    utterance: 'Jaki jest percentyl 90 wartości umów?',
    semanticContext: null,
    expectation: UNSUPPORTED_RICH,
    isUnsupportedRich: true,
    falsePromotionSensitive: true,
  },
  {
    id: 'ic2-ur-06',
    family: 'unsupported_rich',
    utterance: 'Zrób kohortową analizę klientów weselnych',
    semanticContext: null,
    expectation: UNSUPPORTED_RICH,
    isUnsupportedRich: true,
    falsePromotionSensitive: true,
  },

  // --- supported simple ---
  {
    id: 'ic2-ss-01',
    family: 'simple_supported',
    utterance: 'Ile wesel mam w 2028?',
    semanticContext: null,
    expectation: SIMPLE_COUNT_YEAR,
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-02',
    family: 'simple_supported',
    utterance: 'Ile mam wesel w sierpniu?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_count',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-03',
    family: 'simple_supported',
    utterance: 'Pokaż wesela w 2027',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_list',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-04',
    family: 'simple_supported',
    utterance: 'Ile już wpłynęło z wesel w sierpniu?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_paid',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-05',
    family: 'simple_supported',
    utterance: 'Jaka jest łączna wartość umów weselnych w tym roku?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_contract_value',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-06',
    family: 'simple_supported',
    utterance: 'Ile pozostało do zapłaty z wesel w 2027?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'measure_remaining',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-07',
    family: 'simple_supported',
    utterance: 'Policz wesela w przyszłym roku',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_count',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },
  {
    id: 'ic2-ss-08',
    family: 'simple_supported',
    utterance: 'Ile wesel mam we wrześniu 2026?',
    semanticContext: null,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_count',
        'temporal_expression',
      ],
      allowUnsupportedSafe: false,
    },
    isSupportedSimple: true,
  },

  // --- ambiguous ---
  {
    id: 'ic2-amb-01',
    family: 'ambiguous',
    utterance: 'Ile to będzie?',
    semanticContext: CTX_COUNT_AUG,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'no_concrete_measure',
        'measure_ambiguity',
      ],
      allowUnsupportedSafe: false,
    },
    falseConcreteMeasureSensitive: true,
  },
  {
    id: 'ic2-amb-02',
    family: 'ambiguous',
    utterance: 'ile z tego wyjdzie finansowo?',
    semanticContext: CTX_COUNT_AUG,
    expectation: {
      require: [
        'request_domain_query',
        'aggregation_sum',
        'no_concrete_measure',
        'measure_ambiguity',
      ],
      allowUnsupportedSafe: false,
    },
    falseConcreteMeasureSensitive: true,
  },
  {
    id: 'ic2-amb-03',
    family: 'ambiguous',
    utterance: 'o jakiej kwocie mówimy?',
    semanticContext: CTX_COUNT_AUG,
    expectation: {
      require: [
        'request_domain_query',
        'no_concrete_measure',
        'measure_ambiguity',
      ],
      allowUnsupportedSafe: false,
    },
    falseConcreteMeasureSensitive: true,
  },
  {
    id: 'ic2-amb-04',
    family: 'ambiguous',
    utterance: 'ile pieniędzy?',
    semanticContext: CTX_LIST_AUG,
    expectation: {
      require: [
        'request_domain_query',
        'no_concrete_measure',
        'measure_ambiguity',
      ],
      allowUnsupportedSafe: false,
    },
    falseConcreteMeasureSensitive: true,
  },
]

export function ic2CorpusStats() {
  const byFamily: Record<string, number> = {}
  for (const c of IC2_SEMANTIC_COMPLETENESS_CORPUS) {
    byFamily[c.family] = (byFamily[c.family] ?? 0) + 1
  }
  return {
    total: IC2_SEMANTIC_COMPLETENESS_CORPUS.length,
    byFamily,
    groupRank: byFamily.group_rank ?? 0,
    temporalRemainder: byFamily.temporal_remainder ?? 0,
    criticalQa: IC2_SEMANTIC_COMPLETENESS_CORPUS.filter((c) => c.isCriticalQa)
      .length,
  }
}
