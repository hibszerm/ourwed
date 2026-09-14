/**
 * TR1 — Temporal-focused live Luna soak corpus (shadow contract).
 */

export type Tr1TemporalFamily =
  | 'closed_year'
  | 'closed_month'
  | 'explicit_range'
  | 'remaining_year'
  | 'remaining_month'
  | 'from_now_until'
  | 'after_today'
  | 'before_date'
  | 'next_n_days'
  | 'follow_up_scope_change'

export type Tr1Case = {
  id: string
  family: Tr1TemporalFamily
  utterance: string
  /** Expect faithful closed-range canary eligibility when IC1-complete. */
  expectClosedEligible: boolean
  /**
   * When true, any closed resolvedRange that equals a full calendar year/month
   * while the utterance carries open/remainder/from-now meaning is widening.
   */
  openOrPartial: boolean
  semanticContext?: unknown
}

function ctx(previous?: {
  aggregation?: string
  temporalExpression?: string
  placeName?: string
}) {
  if (!previous) return { previousGoalSummary: null }
  return { previousGoalSummary: previous }
}

export const TR1_TEMPORAL_CORPUS: Tr1Case[] = [
  // --- Closed year ---
  {
    id: 'cy-2028',
    family: 'closed_year',
    utterance: 'Ile mam wesel w 2028?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cy-w-2028',
    family: 'closed_year',
    utterance: 'Ile ślubów w 2028 roku?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cy-this-year',
    family: 'closed_year',
    utterance: 'Ile mam wesel w tym roku?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cy-next-year',
    family: 'closed_year',
    utterance: 'Ile wesel w przyszłym roku?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cy-prev-year',
    family: 'closed_year',
    utterance: 'Ile wesel w poprzednim roku?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cy-2027-alt',
    family: 'closed_year',
    utterance: 'Policz wesela na rok 2027',
    expectClosedEligible: true,
    openOrPartial: false,
  },

  // --- Closed month ---
  {
    id: 'cm-sierpien',
    family: 'closed_month',
    utterance: 'Ile mam wesel w sierpniu?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cm-wrzesien-2026',
    family: 'closed_month',
    utterance: 'Ile ślubów we wrześniu 2026?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cm-this-month',
    family: 'closed_month',
    utterance: 'Ile mam wesel w tym miesiącu?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cm-next-month',
    family: 'closed_month',
    utterance: 'Ile wesel w przyszłym miesiącu?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cm-pazdziernik',
    family: 'closed_month',
    utterance: 'Policz wesela w październiku',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cm-grudzien-2026',
    family: 'closed_month',
    utterance: 'Ile mam wesel w grudniu 2026?',
    expectClosedEligible: true,
    openOrPartial: false,
  },

  // --- Explicit range (typed day spans may stay meaning-only; must not widen) ---
  {
    id: 'er-sept-days',
    family: 'explicit_range',
    utterance: 'Ile wesel od 10 września do 30 września?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'er-aug-sept',
    family: 'explicit_range',
    utterance: 'Ile mam ślubów od sierpnia do września?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'er-iso-span',
    family: 'explicit_range',
    utterance: 'Policz wesela od 2026-09-01 do 2026-09-15',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- Remaining year ---
  {
    id: 'ry-do-konca',
    family: 'remaining_year',
    utterance: 'Ile mam jeszcze ślubów do końca tego roku?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'ry-jeszcze',
    family: 'remaining_year',
    utterance: 'Ile wesel jeszcze w tym roku?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'ry-reszta',
    family: 'remaining_year',
    utterance: 'Policz resztę wesel w tym roku',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'ry-cr1',
    family: 'remaining_year',
    utterance: 'Ile mam jeszcze ślubów w tym roku od dziś?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'ry-do-konca-short',
    family: 'remaining_year',
    utterance: 'Ile wesel do końca tego roku?',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- Remaining month ---
  {
    id: 'rm-reszta',
    family: 'remaining_month',
    utterance: 'Ile wesel w reszcie tego miesiąca?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'rm-jeszcze',
    family: 'remaining_month',
    utterance: 'Ile mam jeszcze ślubów w tym miesiącu?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'rm-od-dzis',
    family: 'remaining_month',
    utterance: 'Od dziś do końca miesiąca — ile wesel?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'rm-pozostale',
    family: 'remaining_month',
    utterance: 'Ile pozostało mi wesel w tym miesiącu?',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- From now until ---
  {
    id: 'fn-do-grudnia',
    family: 'from_now_until',
    utterance: 'Od teraz do grudnia — ile mam wesel?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'fn-do-paz',
    family: 'from_now_until',
    utterance: 'Od dziś do października ile ślubów?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'fn-do-konca-roku',
    family: 'from_now_until',
    utterance: 'Od teraz do końca roku — ile wesel?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'fn-do-2027',
    family: 'from_now_until',
    utterance: 'Od dziś do końca 2027 ile mam wesel?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'fn-po-dzis-rok',
    family: 'from_now_until',
    utterance: 'Ile wesel po dziś aż do końca 2026?',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- After today ---
  {
    id: 'at-po-dzis',
    family: 'after_today',
    utterance: 'Ile mam wesel po dziś?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'at-od-dzis',
    family: 'after_today',
    utterance: 'Ile ślubów od dziś?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'at-pojutrze-onward',
    family: 'after_today',
    utterance: 'Ile wesel od jutra wzwyż?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'at-nastepne',
    family: 'after_today',
    utterance: 'Ile mam następnych wesel od dzisiaj?',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- Before date ---
  {
    id: 'bd-przed-paz',
    family: 'before_date',
    utterance: 'Ile wesel przed końcem października?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'bd-przed-grudniem',
    family: 'before_date',
    utterance: 'Ile ślubów przed grudniem?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'bd-do-wrzesnia',
    family: 'before_date',
    utterance: 'Ile mam wesel do września włącznie — ale nie po?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'bd-przed-2027',
    family: 'before_date',
    utterance: 'Ile wesel przed 2027?',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- Next N days (meaning-only unless typed) ---
  {
    id: 'nd-7',
    family: 'next_n_days',
    utterance: 'Ile wesel w najbliższych 7 dniach?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'nd-30',
    family: 'next_n_days',
    utterance: 'Policz śluby w ciągu najbliższych 30 dni',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'nd-14',
    family: 'next_n_days',
    utterance: 'Ile mam wesel przez najbliższe dwa tygodnie?',
    expectClosedEligible: false,
    openOrPartial: true,
  },

  // --- Follow-ups changing temporal scope ---
  {
    id: 'fu-from-2027-to-2028',
    family: 'follow_up_scope_change',
    utterance: 'A w 2028?',
    expectClosedEligible: true,
    openOrPartial: false,
    semanticContext: ctx({
      aggregation: 'count',
      temporalExpression: '2027',
    }),
  },
  {
    id: 'fu-from-month-to-year',
    family: 'follow_up_scope_change',
    utterance: 'A w tym roku?',
    expectClosedEligible: true,
    openOrPartial: false,
    semanticContext: ctx({
      aggregation: 'count',
      temporalExpression: 'sierpień',
    }),
  },
  {
    id: 'fu-open-over-year',
    family: 'follow_up_scope_change',
    utterance: 'A od dziś do końca roku?',
    expectClosedEligible: false,
    openOrPartial: true,
    semanticContext: ctx({
      aggregation: 'count',
      temporalExpression: '2028',
    }),
  },
  {
    id: 'fu-list-same-month',
    family: 'follow_up_scope_change',
    utterance: 'Pokaż je',
    expectClosedEligible: true,
    openOrPartial: false,
    semanticContext: ctx({
      aggregation: 'count',
      temporalExpression: 'sierpień',
    }),
  },
  {
    id: 'fu-from-now-dec-over-year',
    family: 'follow_up_scope_change',
    utterance: 'Od teraz do grudnia',
    expectClosedEligible: false,
    openOrPartial: true,
    semanticContext: ctx({
      aggregation: 'count',
      temporalExpression: '2028',
    }),
  },
  {
    id: 'fu-closed-month-override',
    family: 'follow_up_scope_change',
    utterance: 'A we wrześniu?',
    expectClosedEligible: true,
    openOrPartial: false,
    semanticContext: ctx({
      aggregation: 'count',
      temporalExpression: '2028',
    }),
  },

  // Extra closed paraphrases
  {
    id: 'cy-a-2028',
    family: 'closed_year',
    utterance: 'A w 2028 roku ile mam wesel?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'cm-listopad',
    family: 'closed_month',
    utterance: 'Ile wesel w listopadzie?',
    expectClosedEligible: true,
    openOrPartial: false,
  },
  {
    id: 'ry-paraphrase',
    family: 'remaining_year',
    utterance: 'Co mi zostało wesel do końca roku?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
  {
    id: 'fn-paraphrase',
    family: 'from_now_until',
    utterance: 'Od teraz aż do grudnia — ile ślubów?',
    expectClosedEligible: false,
    openOrPartial: true,
  },
]

export function tr1CorpusStats() {
  const byFamily: Record<string, number> = {}
  let closedExpected = 0
  let openExpected = 0
  for (const c of TR1_TEMPORAL_CORPUS) {
    byFamily[c.family] = (byFamily[c.family] ?? 0) + 1
    if (c.expectClosedEligible) closedExpected++
    else openExpected++
  }
  return {
    total: TR1_TEMPORAL_CORPUS.length,
    byFamily,
    closedExpected,
    openExpected,
  }
}
