/**
 * CR1 — Focused canary re-entry soak corpus (~50).
 * Mix of IC1-eligible and rich fail-closed cases. Polish NL.
 */

export type Cr1CaseClass =
  | 'eligible_ic1'
  | 'rich_fail_closed'
  | 'follow_up'
  | 'critical_qa'

export type Cr1Case = {
  id: string
  class: Cr1CaseClass
  utterance: string
  semanticContext: unknown
  /** Expected canary re-entry eligibility under simulated canary+allowlist. */
  expectEligible: boolean
  /** Rich cases that must not silently become plain IC1 count/list/sum. */
  richSimplificationSensitive?: boolean
  notes?: string
}

const CTX_COUNT_2028 = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: '2028',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_COUNT_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'count',
    source: 'wedding',
  },
} as const

const CTX_SUM_PAID_AUG = {
  hasActiveCollection: true,
  previousGoalSummary: {
    temporalExpression: 'sierpień',
    aggregation: 'sum',
    measure: 'wedding.paid_amount',
    source: 'wedding',
  },
} as const

export const CR1_CANARY_REENTRY_CORPUS: readonly Cr1Case[] = [
  // Critical QA — must stay ineligible
  {
    id: 'cr1-crit-month-most',
    class: 'critical_qa',
    utterance: 'W którym miesiącu mam najwięcej wesel?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-crit-remaining-year',
    class: 'critical_qa',
    utterance: 'Ile mam jeszcze wesel do końca tego roku?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },

  // Eligible IC1
  {
    id: 'cr1-el-2028',
    class: 'eligible_ic1',
    utterance: 'Ile wesel mam w 2028?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-2027',
    class: 'eligible_ic1',
    utterance: 'Ile mam wesel w 2027?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-aug',
    class: 'eligible_ic1',
    utterance: 'Ile wesel mam w sierpniu?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-list-2027',
    class: 'eligible_ic1',
    utterance: 'Pokaż wesela w 2027',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-sum-cv',
    class: 'eligible_ic1',
    utterance: 'Jaka jest łączna wartość umów weselnych w 2027?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-sum-paid',
    class: 'eligible_ic1',
    utterance: 'Ile już wpłynęło z wesel w sierpniu?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-sum-remaining',
    class: 'eligible_ic1',
    utterance: 'Ile pozostało do zapłaty z wesel w 2027?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-venue-year',
    class: 'eligible_ic1',
    utterance: 'Ile wesel mam w Villa Love w 2027?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-venue-aug',
    class: 'eligible_ic1',
    utterance: 'Ile już wpłynęło z wesel w Villa Love w sierpniu?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-next-year',
    class: 'eligible_ic1',
    utterance: 'Policz wesela w przyszłym roku',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-sep-2026',
    class: 'eligible_ic1',
    utterance: 'Ile wesel mam we wrześniu 2026?',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-list-aug',
    class: 'eligible_ic1',
    utterance: 'Wylistuj wesela z sierpnia',
    semanticContext: null,
    expectEligible: true,
  },
  {
    id: 'cr1-el-cv-this-year',
    class: 'eligible_ic1',
    utterance: 'Jaka jest łączna wartość umów weselnych w tym roku?',
    semanticContext: null,
    expectEligible: true,
  },

  // Follow-ups
  {
    id: 'cr1-fu-show',
    class: 'follow_up',
    utterance: 'Pokaż je',
    semanticContext: CTX_COUNT_2028,
    expectEligible: true,
  },
  {
    id: 'cr1-fu-list',
    class: 'follow_up',
    utterance: 'a wylistuj',
    semanticContext: CTX_COUNT_AUG,
    expectEligible: true,
  },
  {
    id: 'cr1-fu-count',
    class: 'follow_up',
    utterance: 'a ile ich jest?',
    semanticContext: {
      hasActiveCollection: true,
      previousGoalSummary: {
        temporalExpression: '2028',
        aggregation: 'list',
        source: 'wedding',
      },
    },
    expectEligible: true,
  },
  {
    id: 'cr1-fu-paid',
    class: 'follow_up',
    utterance: 'a ile już wpłynęło?',
    semanticContext: CTX_COUNT_AUG,
    expectEligible: true,
  },
  {
    id: 'cr1-fu-year',
    class: 'follow_up',
    utterance: 'a w 2028?',
    semanticContext: CTX_COUNT_AUG,
    expectEligible: true,
  },
  {
    id: 'cr1-fu-remaining-money',
    class: 'follow_up',
    utterance: 'a ile zostało do zapłaty?',
    semanticContext: CTX_SUM_PAID_AUG,
    expectEligible: true,
  },

  // Ambiguous money — eligible as clarification under canary sim
  {
    id: 'cr1-amb-money',
    class: 'eligible_ic1',
    utterance: 'Ile to będzie?',
    semanticContext: CTX_COUNT_AUG,
    expectEligible: true,
    notes: 'typed measure clarification is eligible ownership under canary',
  },

  // Rich fail-closed
  {
    id: 'cr1-rich-month-most-2',
    class: 'rich_fail_closed',
    utterance: 'Który miesiąc ma u mnie najwięcej ślubów?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-month-least',
    class: 'rich_fail_closed',
    utterance: 'W którym miesiącu mam najmniej wesel?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-top3',
    class: 'rich_fail_closed',
    utterance: 'Pokaż top 3 lokalizacje weselne',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-avg',
    class: 'rich_fail_closed',
    utterance: 'Jaka jest średnia wartość umowy na przyszły rok?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-earliest',
    class: 'rich_fail_closed',
    utterance: 'Które wesele jest najwcześniejsze?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-compare-years',
    class: 'rich_fail_closed',
    utterance: 'Czy w 2027 mam więcej wesel niż w 2026?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-compare-venues',
    class: 'rich_fail_closed',
    utterance: 'Czy Villa Love ma więcej wesel niż Dwór Sarbinowo?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-except',
    class: 'rich_fail_closed',
    utterance: 'Pokaż wesela oprócz Villa Love',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-remaining-2',
    class: 'rich_fail_closed',
    utterance: 'Ile wesel zostało mi do końca roku?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-remaining-3',
    class: 'rich_fail_closed',
    utterance: 'Ile mam jeszcze ślubów w tym roku od dziś?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-from-now',
    class: 'rich_fail_closed',
    utterance: 'Od teraz do grudnia — ile mam wesel?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-rest-month',
    class: 'rich_fail_closed',
    utterance: 'Ile zostało wesel w tym miesiącu?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-rank-venue',
    class: 'rich_fail_closed',
    utterance: 'W której lokalizacji mam najwięcej wesel?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-histogram',
    class: 'rich_fail_closed',
    utterance: 'Narysuj histogram wesel według miesiąca',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-trend',
    class: 'rich_fail_closed',
    utterance: 'Jaki jest trend liczby wesel miesiąc do miesiąca?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-participant',
    class: 'rich_fail_closed',
    utterance: 'Ile mam wesel z udziałem Jana Kowalskiego?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-max-cv',
    class: 'rich_fail_closed',
    utterance: 'Jaka jest maksymalna wartość umowy wśród wesel?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-top5-months',
    class: 'rich_fail_closed',
    utterance: 'Wymień 5 miesięcy z największą liczbą wesel',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-exclude-city',
    class: 'rich_fail_closed',
    utterance: 'Policz wesela nie w Krakowie',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-forecast',
    class: 'rich_fail_closed',
    utterance: 'Prognozuj ile wesel będę mieć w 2030',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-percentile',
    class: 'rich_fail_closed',
    utterance: 'Jaki jest percentyl 90 wartości umów?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-after-today-year',
    class: 'rich_fail_closed',
    utterance: 'Policz wesela po dzisiejszej dacie do końca roku',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-before-oct',
    class: 'rich_fail_closed',
    utterance: 'Ile wesel mam przed końcem października?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-group-rank-year',
    class: 'rich_fail_closed',
    utterance: 'Który rok miał u mnie najwięcej wesel?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-latest',
    class: 'rich_fail_closed',
    utterance: 'Które wesele mam najpóźniej w kalendarzu?',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-compare-months',
    class: 'rich_fail_closed',
    utterance: 'Porównaj liczbę wesel w sierpniu i we wrześniu',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-except-2',
    class: 'rich_fail_closed',
    utterance: 'Wypisz wesela z wyłączeniem lokalizacji Dwór',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
  {
    id: 'cr1-rich-avg-remaining',
    class: 'rich_fail_closed',
    utterance: 'Policz średnią pozostałą kwotę do zapłaty',
    semanticContext: null,
    expectEligible: false,
    richSimplificationSensitive: true,
  },
]

export function cr1CorpusStats() {
  const byClass: Record<string, number> = {}
  for (const c of CR1_CANARY_REENTRY_CORPUS) {
    byClass[c.class] = (byClass[c.class] ?? 0) + 1
  }
  return {
    total: CR1_CANARY_REENTRY_CORPUS.length,
    byClass,
    expectEligible: CR1_CANARY_REENTRY_CORPUS.filter((c) => c.expectEligible)
      .length,
    expectIneligible: CR1_CANARY_REENTRY_CORPUS.filter((c) => !c.expectEligible)
      .length,
  }
}
