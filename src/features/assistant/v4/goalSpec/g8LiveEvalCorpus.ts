/**
 * G8.1 — LIVE eval corpus only (60–100 + multi-turn chains).
 * Does not replace the 16-case offline fixture corpus.
 * Fixtures are stubs; live mode ignores them.
 */

import {
  type G8BenchmarkCase,
  type G8BenchmarkCategory,
} from './g8BenchmarkCorpus'

export type G8LiveEvalCase = G8BenchmarkCase & {
  chainId?: string
  chainTurn?: number
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

function c(
  partial: Omit<G8LiveEvalCase, 'fixtureFlat'> & {
    fixtureFlat?: Record<string, unknown>
  },
): G8LiveEvalCase {
  return {
    fixtureFlat: partial.fixtureFlat ?? flat(),
    ...partial,
  }
}

const CTX_VILLA = {
  hasActiveCollection: true,
  previousGoalSummary: {
    requestKind: 'domain_query',
    aggregation: 'count',
    placeName: 'Villa Love',
    source: 'wedding',
  },
} as const

const CTX_VILLA_2027 = {
  hasActiveCollection: true,
  previousGoalSummary: {
    requestKind: 'domain_query',
    aggregation: 'count',
    placeName: 'Villa Love',
    temporalExpression: '2027',
    source: 'wedding',
  },
} as const

const CTX_AUGUST = {
  hasActiveCollection: true,
  previousGoalSummary: {
    requestKind: 'domain_query',
    aggregation: 'count',
    temporalExpression: 'sierpień',
    source: 'wedding',
  },
} as const

const CTX_HOTEL_2027 = {
  hasActiveCollection: true,
  previousGoalSummary: {
    placeName: 'Hotel Stary',
    temporalExpression: '2027',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_ZERO_VILLA_2027 = {
  hasActiveCollection: true,
  previousGoalSummary: {
    placeName: 'Villa Love',
    temporalExpression: '2027',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_PAID = {
  hasActiveCollection: true,
  previousGoalSummary: {
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    temporalExpression: 'sierpień',
    source: 'wedding',
  },
} as const

/** Required multi-turn chains + focused single-turn coverage (~75–90 turns). */
export const G8_LIVE_EVAL_CORPUS: G8LiveEvalCase[] = [
  // ========== CHAIN 1 ==========
  c({
    id: 'live-c1-t1-villa-count',
    chainId: 'chain-1',
    chainTurn: 1,
    category: 'venue',
    utterance: 'ile mam wesel w Villa Love?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Villa Love',
      source: 'wedding',
      executable: true,
    },
  }),
  c({
    id: 'live-c1-t2-next-year',
    chainId: 'chain-1',
    chainTurn: 2,
    category: 'relative_date',
    utterance: 'a w przyszłym roku?',
    semanticContext: CTX_VILLA,
    expect: {
      requestKind: 'domain_query',
      inheritActiveCollection: true,
      temporalContains: 'przyszł',
      placeName: null,
      executable: true,
    },
  }),
  c({
    id: 'live-c1-t3-show',
    chainId: 'chain-1',
    chainTurn: 3,
    category: 'ellipsis',
    utterance: 'pokaż je',
    semanticContext: {
      ...CTX_VILLA,
      previousGoalSummary: {
        ...CTX_VILLA.previousGoalSummary,
        temporalExpression: 'w przyszłym roku',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-c1-t4-contract-sum',
    chainId: 'chain-1',
    chainTurn: 4,
    category: 'simple',
    utterance: 'jaka jest ich łączna wartość?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: { placeName: 'Villa Love', aggregation: 'list' },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 2 ==========
  c({
    id: 'live-c2-t1-august-count',
    chainId: 'chain-2',
    chainTurn: 1,
    category: 'simple',
    utterance: 'ile mam wesel w sierpniu?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'sierp',
      source: 'wedding',
      executable: true,
    },
  }),
  c({
    id: 'live-c2-t2-paid',
    chainId: 'chain-2',
    chainTurn: 2,
    category: 'finance_followup',
    utterance: 'a zapłacone?',
    semanticContext: CTX_AUGUST,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-c2-t3-remaining',
    chainId: 'chain-2',
    chainTurn: 3,
    category: 'finance_followup',
    utterance: 'a ile jeszcze dostanę?',
    semanticContext: CTX_PAID,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 3 — venue A+year → correct to B, year retained ==========
  c({
    id: 'live-c3-t1-villa-2027',
    chainId: 'chain-3',
    chainTurn: 1,
    category: 'venue',
    utterance: 'ile mam wesel w Villa Love w 2027?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Villa Love',
      temporalContains: '2027',
      executable: true,
    },
  }),
  c({
    id: 'live-c3-t2-correct-hotel',
    chainId: 'chain-3',
    chainTurn: 2,
    category: 'correction',
    utterance: 'nie Villa Love, tylko Hotel Stary',
    semanticContext: CTX_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      placeName: 'Hotel Stary',
      correctionTarget: 'place',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 4 — zero result → list → remaining → replace year ==========
  c({
    id: 'live-c4-t1-zero-count',
    chainId: 'chain-4',
    chainTurn: 1,
    category: 'zero_result',
    utterance: 'ile mam wesel w Villa Love w 2027?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Villa Love',
      temporalContains: '2027',
      executable: true,
    },
  }),
  c({
    id: 'live-c4-t2-list',
    chainId: 'chain-4',
    chainTurn: 2,
    category: 'zero_result',
    utterance: 'pokaż je',
    semanticContext: CTX_ZERO_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-c4-t3-remaining',
    chainId: 'chain-4',
    chainTurn: 3,
    category: 'zero_result',
    utterance: 'a ile zostało?',
    semanticContext: CTX_ZERO_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-c4-t4-year-replace',
    chainId: 'chain-4',
    chainTurn: 4,
    category: 'year_replace',
    utterance: 'a w 2028?',
    semanticContext: CTX_ZERO_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      temporalContains: '2028',
      inheritActiveCollection: true,
      placeName: null,
      executable: true,
    },
  }),

  // ========== CHAIN 5 — page context then close (no inheritance after fresh) ==========
  c({
    id: 'live-c5-t1-page-ref',
    chainId: 'chain-5',
    chainTurn: 1,
    category: 'ellipsis',
    utterance: 'jaka jest wartość umowy?',
    semanticContext: {
      hasActiveCollection: false,
      previousGoalSummary: null,
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: false,
      executable: false,
    },
  }),
  c({
    id: 'live-c5-t2-fresh-no-inherit',
    chainId: 'chain-5',
    chainTurn: 2,
    category: 'simple',
    utterance: 'ile mam wesel w sierpniu?',
    semanticContext: {
      hasActiveCollection: false,
      previousGoalSummary: null,
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'sierp',
      inheritActiveCollection: false,
      executable: true,
    },
  }),

  // ========== CHAIN 6 — finance paraphrase chain ==========
  c({
    id: 'live-c6-t1-list-sept',
    chainId: 'chain-6',
    chainTurn: 1,
    category: 'simple',
    utterance: 'pokaż wesela z września',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'wrześ',
      executable: true,
    },
  }),
  c({
    id: 'live-c6-t2-paid',
    chainId: 'chain-6',
    chainTurn: 2,
    category: 'finance_followup',
    utterance: 'a ile już zapłacono?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        aggregation: 'list',
        temporalExpression: 'wrzesień',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-c6-t3-contract',
    chainId: 'chain-6',
    chainTurn: 3,
    category: 'finance_followup',
    utterance: 'a łączna wartość kontraktów?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        measure: 'wedding.paid_amount',
        aggregation: 'sum',
        temporalExpression: 'wrzesień',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 7 — place role then list ==========
  c({
    id: 'live-c7-t1-ceremony',
    chainId: 'chain-7',
    chainTurn: 1,
    category: 'venue',
    utterance: 'ile mam wesel z ceremonią w Pałacu Wilanów?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Pałac Wilanów',
      executable: true,
    },
  }),
  c({
    id: 'live-c7-t2-list',
    chainId: 'chain-7',
    chainTurn: 2,
    category: 'ellipsis',
    utterance: 'pokaż je',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        placeName: 'Pałac Wilanów',
        aggregation: 'count',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 8 — year then venue correction ==========
  c({
    id: 'live-c8-t1-year',
    chainId: 'chain-8',
    chainTurn: 1,
    category: 'relative_date',
    utterance: 'ile mam wesel w 2026?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: '2026',
      executable: true,
    },
  }),
  c({
    id: 'live-c8-t2-venue-filter',
    chainId: 'chain-8',
    chainTurn: 2,
    category: 'venue',
    utterance: 'tylko w Hotelu Starym',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        temporalExpression: '2026',
        aggregation: 'count',
      },
    },
    expect: {
      requestKind: 'domain_query',
      placeName: 'Hotel Stary',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 9 — remaining ↔ paid flip ==========
  c({
    id: 'live-c9-t1-remaining',
    chainId: 'chain-9',
    chainTurn: 1,
    category: 'simple',
    utterance: 'ile jeszcze mam dostać z wesel w czerwcu?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      temporalContains: 'czerw',
      executable: true,
    },
  }),
  c({
    id: 'live-c9-t2-paid',
    chainId: 'chain-9',
    chainTurn: 2,
    category: 'finance_followup',
    utterance: 'a zapłacone?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        measure: 'wedding.remaining_amount',
        aggregation: 'sum',
        temporalExpression: 'czerwiec',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 10 — correction year ==========
  c({
    id: 'live-c10-t1',
    chainId: 'chain-10',
    chainTurn: 1,
    category: 'venue',
    utterance: 'ile wesel w Hotel Stary w 2027?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Hotel Stary',
      temporalContains: '2027',
      executable: true,
    },
  }),
  c({
    id: 'live-c10-t2-year-correct',
    chainId: 'chain-10',
    chainTurn: 2,
    category: 'correction',
    utterance: 'nie 2027, tylko 2028',
    semanticContext: CTX_HOTEL_2027,
    expect: {
      requestKind: 'domain_query',
      temporalContains: '2028',
      correctionTarget: 'temporal',
      inheritActiveCollection: true,
      placeName: null,
      executable: true,
    },
  }),

  // ========== CHAIN 11 — list then value ==========
  c({
    id: 'live-c11-t1',
    chainId: 'chain-11',
    chainTurn: 1,
    category: 'simple',
    utterance: 'wymień wesela z lipca',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'lip',
      executable: true,
    },
  }),
  c({
    id: 'live-c11-t2',
    chainId: 'chain-11',
    chainTurn: 2,
    category: 'ellipsis',
    utterance: 'jaka jest ich wartość?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        aggregation: 'list',
        temporalExpression: 'lipiec',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CHAIN 12 — next year then show ==========
  c({
    id: 'live-c12-t1',
    chainId: 'chain-12',
    chainTurn: 1,
    category: 'relative_date',
    utterance: 'ile mam wesel w przyszłym roku?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'przyszł',
      executable: true,
    },
  }),
  c({
    id: 'live-c12-t2',
    chainId: 'chain-12',
    chainTurn: 2,
    category: 'ellipsis',
    utterance: 'pokaż je',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        temporalExpression: 'w przyszłym roku',
        aggregation: 'count',
      },
    },
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== SIMPLE / PARAPHRASE ==========
  c({
    id: 'live-simple-count-oct',
    category: 'simple',
    utterance: 'ile mam wesel w październiku?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'październik',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-list-may',
    category: 'simple',
    utterance: 'pokaż listę wesel z maja',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'maj',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-how-many-this-year',
    category: 'relative_date',
    utterance: 'ile mam wesel w tym roku?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'tym roku',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-count-2025',
    category: 'relative_date',
    utterance: 'ile wesel miałem w 2025?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: '2025',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-list-all-aug',
    category: 'simple',
    utterance: 'wypisz mi wesela sierpniowe',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'sierp',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-count-nov',
    category: 'simple',
    utterance: 'ile mam wesel w listopadzie?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'listopad',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-sum-contract-standalone',
    category: 'simple',
    utterance: 'jaka jest łączna wartość umów z września?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      temporalContains: 'wrześ',
      executable: true,
    },
  }),
  c({
    id: 'live-simple-count-dec',
    category: 'simple',
    utterance: 'ile mam zaplanowanych wesel w grudniu?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'grud',
      executable: true,
    },
  }),

  // ========== FINANCE ==========
  c({
    id: 'live-fin-paid-aug',
    category: 'finance_followup',
    utterance: 'ile zapłacono z wesel w sierpniu?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      temporalContains: 'sierp',
      executable: true,
    },
  }),
  c({
    id: 'live-fin-remaining-aug',
    category: 'finance_followup',
    utterance: 'ile zostało do zapłaty z wesel sierpniowych?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      temporalContains: 'sierp',
      executable: true,
    },
  }),
  c({
    id: 'live-fin-contract-paraphrase',
    category: 'simple',
    utterance: 'jaka jest suma wartości kontraktów w 2026?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      temporalContains: '2026',
      executable: true,
    },
  }),
  c({
    id: 'live-fin-paid-paraphrase',
    category: 'finance_followup',
    utterance: 'ile pieniędzy już wpłynęło z wesel w maju?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      temporalContains: 'maj',
      executable: true,
    },
  }),
  c({
    id: 'live-fin-remaining-paraphrase',
    category: 'finance_followup',
    utterance: 'ile jeszcze mam dostać z tegorocznych wesel?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      temporalContains: 'tego',
      executable: true,
    },
  }),
  c({
    id: 'live-fin-followup-zostalo',
    category: 'finance_followup',
    utterance: 'a ile zostało?',
    semanticContext: CTX_PAID,
    expect: {
      requestKind: 'domain_query',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== TEMPORAL ==========
  c({
    id: 'live-temp-next-year-standalone',
    category: 'relative_date',
    utterance: 'pokaż wesela z przyszłego roku',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'przyszł',
      executable: true,
    },
  }),
  c({
    id: 'live-temp-2028-count',
    category: 'relative_date',
    utterance: 'ile mam wesel w 2028?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: '2028',
      executable: true,
    },
  }),
  c({
    id: 'live-temp-replace-2028',
    category: 'year_replace',
    utterance: 'a w 2028?',
    semanticContext: CTX_HOTEL_2027,
    expect: {
      requestKind: 'domain_query',
      temporalContains: '2028',
      inheritActiveCollection: true,
      placeName: null,
      executable: true,
    },
  }),
  c({
    id: 'live-temp-current-year-list',
    category: 'relative_date',
    utterance: 'pokaż tegoroczne wesela',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'tego',
      executable: true,
    },
  }),
  c({
    id: 'live-temp-april',
    category: 'relative_date',
    utterance: 'ile mam wesel w kwietniu?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'kwiec',
      executable: true,
    },
  }),
  c({
    id: 'live-temp-march-list',
    category: 'relative_date',
    utterance: 'lista wesel z marca',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      temporalContains: 'marz',
      executable: true,
    },
  }),

  // ========== VENUE / PLACE ==========
  c({
    id: 'live-venue-dworek',
    category: 'venue',
    utterance: 'ile mam wesel w Dworku Białym?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Dworku Białym',
      executable: true,
    },
  }),
  c({
    id: 'live-venue-hotel-list',
    category: 'venue',
    utterance: 'pokaż wesela w Hotelu Starym',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      placeName: 'Hotelu Starym',
      executable: true,
    },
  }),
  c({
    id: 'live-venue-reception',
    category: 'venue',
    utterance: 'ile mam wesel z przyjęciem w Sali Balowej?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Sala Balowa',
      executable: true,
    },
  }),
  c({
    id: 'live-venue-prep',
    category: 'venue',
    utterance: 'ile wesel z przygotowaniami w Willi Nova?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      // Surface form as spoken — interpreter extracts text; does not lemmatize.
      placeName: 'Willi Nova',
      executable: true,
    },
  }),
  c({
    id: 'live-venue-replace-delta',
    category: 'correction',
    utterance: 'a w Pałacu Wilanów?',
    semanticContext: CTX_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      placeName: 'Pałac Wilanów',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== ELLIPSIS / CONTINUATION ==========
  c({
    id: 'live-ell-show',
    category: 'ellipsis',
    utterance: 'pokaż je',
    semanticContext: CTX_VILLA,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-ell-paid',
    category: 'ellipsis',
    utterance: 'a zapłacone?',
    semanticContext: CTX_AUGUST,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-ell-remaining',
    category: 'ellipsis',
    utterance: 'a ile zostało?',
    semanticContext: CTX_PAID,
    expect: {
      requestKind: 'domain_query',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-ell-year',
    category: 'ellipsis',
    utterance: 'a w 2028?',
    semanticContext: CTX_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      temporalContains: '2028',
      inheritActiveCollection: true,
      placeName: null,
      executable: true,
    },
  }),
  c({
    id: 'live-ell-value',
    category: 'ellipsis',
    utterance: 'jaka jest ich łączna wartość?',
    semanticContext: CTX_VILLA,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== CORRECTION ==========
  c({
    id: 'live-corr-venue',
    category: 'correction',
    utterance: 'nie Villa Love, tylko Hotel Stary',
    semanticContext: CTX_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      placeName: 'Hotel Stary',
      correctionTarget: 'place',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-corr-year',
    category: 'correction',
    utterance: 'przepraszam, chodziło mi o 2028',
    semanticContext: CTX_HOTEL_2027,
    expect: {
      requestKind: 'domain_query',
      temporalContains: '2028',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-corr-venue-soft',
    category: 'correction',
    utterance: 'chodzi o Dworek Biały, nie Villa Love',
    semanticContext: CTX_VILLA,
    expect: {
      requestKind: 'domain_query',
      placeName: 'Dworek Biały',
      inheritActiveCollection: true,
      executable: true,
    },
  }),

  // ========== AMBIGUITY ==========
  c({
    id: 'live-amb-earnings-week',
    category: 'ambiguity',
    utterance: 'ile zarobię w przyszłym tygodniu?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: null,
      ambiguitySlots: ['date_dimension', 'measure'],
      executable: false,
    },
  }),
  c({
    id: 'live-amb-earnings-month',
    category: 'ambiguity',
    utterance: 'ile zarobię w październiku?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: null,
      ambiguitySlots: ['measure'],
      executable: false,
    },
  }),
  c({
    id: 'live-amb-which-money',
    category: 'ambiguity',
    utterance: 'ile to będzie?',
    semanticContext: CTX_AUGUST,
    expect: {
      requestKind: 'domain_query',
      measure: null,
      ambiguitySlots: ['measure'],
      executable: false,
    },
  }),
  c({
    id: 'live-amb-entity-kind',
    category: 'ambiguity',
    utterance: 'pokaż Gold',
    expect: {
      requestKind: 'domain_query',
      ambiguitySlots: ['entity_kind'],
      executable: false,
    },
  }),
  c({
    id: 'live-amb-when-money',
    category: 'ambiguity',
    utterance: 'kiedy dostanę pieniądze?',
    expect: {
      requestKind: 'domain_query',
      ambiguitySlots: ['date_dimension'],
      executable: false,
    },
  }),

  // ========== UNSUPPORTED ==========
  c({
    id: 'live-unsup-contract-draft',
    category: 'prepare_action',
    utterance: 'napisz za mnie umowę weselną',
    expect: {
      // User intent = prepare a document action (capability support is downstream).
      requestKind: 'prepare_action',
      executable: false,
    },
  }),
  c({
    id: 'live-unsup-email',
    category: 'prepare_action',
    utterance: 'wyślij maila do wszystkich par z sierpnia',
    expect: {
      // User intent = prepare/send action (not product_help; not forced unsupported).
      requestKind: 'prepare_action',
      executable: false,
    },
  }),
  c({
    id: 'live-unsup-image',
    category: 'unsupported',
    utterance: 'wygeneruj plakat na wesele',
    expect: { requestKind: 'unsupported', executable: false },
  }),
  c({
    id: 'live-unsup-legal',
    category: 'unsupported',
    utterance: 'doradź mi jak rozliczyć VAT od wesel',
    expect: {
      // Generic legal/accounting advice ≠ product_help; keep unsupported.
      requestKind: 'unsupported',
      executable: false,
    },
  }),

  // ========== FUTURE REQUEST FAMILIES ==========
  c({
    id: 'live-help-payment-due',
    category: 'product_help',
    utterance: 'jak zmienić termin płatności?',
    expect: {
      requestKind: 'product_help',
      topicKey: 'change_payment_due_date',
      executable: false,
    },
  }),
  c({
    id: 'live-help-add-venue',
    category: 'product_help',
    utterance: 'jak dodać miejsce ceremonii?',
    expect: {
      requestKind: 'product_help',
      executable: false,
    },
  }),
  c({
    id: 'live-goal-travel',
    category: 'goal_plan',
    utterance:
      'czy opłaca mi się wracać do domu między tymi dwoma weselami?',
    expect: {
      requestKind: 'goal_plan',
      topicKey: 'travel_between_weddings',
      executable: false,
    },
  }),
  c({
    id: 'live-goal-schedule',
    category: 'goal_plan',
    utterance: 'jak ułożyć dzień, żeby zdążyć na obie ceremonie?',
    expect: {
      requestKind: 'goal_plan',
      executable: false,
    },
  }),
  c({
    id: 'live-prep-task',
    category: 'prepare_action',
    utterance: 'dodaj zadanie, żebym jutro zadzwonił do nich',
    expect: {
      requestKind: 'prepare_action',
      topicKey: 'create_task',
      executable: false,
    },
  }),
  c({
    id: 'live-prep-note',
    category: 'prepare_action',
    utterance: 'przygotuj notatkę o zmianie sali',
    expect: {
      requestKind: 'prepare_action',
      executable: false,
    },
  }),

  // ========== MORE NATURAL PARAPHRASES ==========
  c({
    id: 'live-para-how-many-villa',
    category: 'venue',
    utterance: 'ile wesel mam u siebie w Villa Love?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      placeName: 'Villa Love',
      executable: true,
    },
  }),
  c({
    id: 'live-para-show-paid',
    category: 'finance_followup',
    utterance: 'pokaż ile już zapłacono z tych wesel',
    semanticContext: CTX_AUGUST,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.paid_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-para-next-year-count',
    category: 'relative_date',
    utterance: 'a ile będzie ich w przyszłym roku?',
    semanticContext: CTX_VILLA,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'przyszł',
      inheritActiveCollection: true,
      placeName: null,
      executable: true,
    },
  }),
  c({
    id: 'live-para-remaining-soft',
    category: 'finance_followup',
    utterance: 'a ile jeszcze do wzięcia?',
    semanticContext: CTX_PAID,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.remaining_amount',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
  c({
    id: 'live-para-list-hotel-year',
    category: 'venue',
    utterance: 'pokaż wesela w Hotelu Starym z 2027',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      placeName: 'Hotelu Starym',
      temporalContains: '2027',
      executable: true,
    },
  }),
  c({
    id: 'live-para-count-feb',
    category: 'simple',
    utterance: 'ile mam wesel w lutym?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'count',
      temporalContains: 'lut',
      executable: true,
    },
  }),
  c({
    id: 'live-para-sum-jan',
    category: 'simple',
    utterance: 'jaka jest łączna wartość wesel styczniowych?',
    expect: {
      requestKind: 'domain_query',
      aggregation: 'sum',
      measure: 'wedding.contract_value',
      temporalContains: 'stycz',
      executable: true,
    },
  }),
  c({
    id: 'live-zero-show-after-empty',
    category: 'zero_result',
    utterance: 'pokaż je',
    semanticContext: CTX_ZERO_VILLA_2027,
    expect: {
      requestKind: 'domain_query',
      aggregation: 'list',
      inheritActiveCollection: true,
      executable: true,
    },
  }),
]

export function g8LiveCorpusStats() {
  const n = G8_LIVE_EVAL_CORPUS.length
  const chains = new Set(
    G8_LIVE_EVAL_CORPUS.map((x) => x.chainId).filter(Boolean),
  )
  const byCat: Record<string, number> = {}
  for (const x of G8_LIVE_EVAL_CORPUS) {
    byCat[x.category] = (byCat[x.category] ?? 0) + 1
  }
  return { n, chainCount: chains.size, byCat }
}

/** Type guard helper for categories used in reports. */
export type { G8BenchmarkCategory }
