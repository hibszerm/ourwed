/**
 * V6-F1.1 — Live evaluation corpus (gold labels for judges only).
 * NEVER imported by prompts / Edge / agent schema.
 */

export type V6LiveFamily =
  | 'nearest'
  | 'count'
  | 'date_year'
  | 'date_month'
  | 'place'
  | 'exclude'
  | 'order_limit'
  | 'finance'
  | 'zero'
  | 'reference'
  | 'restore'
  | 'correction'
  | 'unsupported'
  | 'novel'
  | 'ambiguous'

export type V6LiveExpect = {
  /** High-level semantic requirements (judge heuristics, not phrase routers). */
  requireFutureFromNow?: boolean
  requireSortDateAsc?: boolean
  requireSlice?: boolean
  minSlice?: number
  requireClosedYear?: number
  requireClosedMonth?: { year: number; month: number }
  requirePlaceContains?: string
  requirePlaceExclude?: string
  requireAggregate?: 'count' | 'sum'
  requireMeasure?: 'contract_value' | 'paid_amount' | 'remaining_amount'
  requireTransformNotRootSearch?: boolean
  requireRestore?: boolean
  requireUnsupported?: boolean
  allowClarify?: boolean
  /** Fresh root search allowed */
  allowRootSearch?: boolean
}

export type V6LiveCase = {
  id: string
  set: 'single' | 'multi' | 'adversarial' | 'unsupported' | 'holdout' | 'special'
  family: V6LiveFamily
  /** true = not present in F1 prompt examples */
  novelParaphrase?: boolean
  turns: string[]
  expect: V6LiveExpect
}

/** Holdout paraphrases from F1 (isolated). */
export const V6_LIVE_HOLDOUT: V6LiveCase[] = [
  {
    id: 'h01',
    set: 'holdout',
    family: 'nearest',
    novelParaphrase: true,
    turns: ['Daj mi trójkę najbliższych dat weselnych.'],
    expect: {
      requireFutureFromNow: true,
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: 3,
      allowRootSearch: true,
    },
  },
  {
    id: 'h02',
    set: 'holdout',
    family: 'reference',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Z tego zestawu zostaw tylko Villa Love.',
    ],
    expect: { requireTransformNotRootSearch: true, requirePlaceContains: 'Villa Love' },
  },
  {
    id: 'h03',
    set: 'holdout',
    family: 'finance',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Jaka jest łączna wartość tych umów?',
    ],
    expect: {
      requireAggregate: 'sum',
      requireMeasure: 'contract_value',
      requireTransformNotRootSearch: false,
    },
  },
  {
    id: 'h04',
    set: 'holdout',
    family: 'finance',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'A ile jeszcze mi mają zapłacić?',
    ],
    expect: { requireAggregate: 'sum', requireMeasure: 'remaining_amount' },
  },
  {
    id: 'h05',
    set: 'holdout',
    family: 'exclude',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Odrzuć pierwszą pozycję z listy.',
    ],
    expect: { requireTransformNotRootSearch: true },
  },
  {
    id: 'h06',
    set: 'holdout',
    family: 'restore',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'A które z nich mam w Villa Love?',
      'Przywróć wcześniejszą trójkę.',
    ],
    expect: { requireRestore: true },
  },
  {
    id: 'h07',
    set: 'holdout',
    family: 'date_month',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Zostaw wyłącznie wrześniowe jeśli rok jasny.',
    ],
    expect: { allowClarify: true, requireTransformNotRootSearch: true },
  },
  {
    id: 'h08',
    set: 'holdout',
    family: 'count',
    novelParaphrase: true,
    turns: ['Pokaż 3 najbliższe wesela.', 'Policz aktualny zbiór.'],
    expect: { requireAggregate: 'count' },
  },
  {
    id: 'h09',
    set: 'holdout',
    family: 'novel',
    novelParaphrase: true,
    turns: [
      'Z roku 2027 weź pięć najbliższych, bez Villa Love, suma remaining.',
    ],
    expect: {
      requireClosedYear: 2027,
      requirePlaceExclude: 'Villa Love',
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: 5,
      requireAggregate: 'sum',
      requireMeasure: 'remaining_amount',
      allowRootSearch: true,
    },
  },
  {
    id: 'h10',
    set: 'holdout',
    family: 'zero',
    novelParaphrase: true,
    turns: [
      'Ile mam wesel w 2031?',
      'Pokaż pusty wynik ponownie — te same zero.',
    ],
    expect: { allowClarify: true, requireRestore: true, allowRootSearch: true },
  },
]

function nearest(id: string, text: string, n?: number): V6LiveCase {
  return {
    id,
    set: 'single',
    family: 'nearest',
    novelParaphrase: true,
    turns: [text],
    expect: {
      requireFutureFromNow: true,
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: n,
      allowRootSearch: true,
      allowClarify: n == null,
    },
  }
}

/** 60 single-turn natural requests (includes ≥20 novel paraphrases). */
export const V6_LIVE_SINGLE: V6LiveCase[] = [
  nearest('s01', 'Pokaż 3 najbliższe wesela.', 3),
  nearest('s02', 'Pokaż mi te najbliższe.'),
  nearest('s03', 'Daj najbliższe pięć ślubów.', 5),
  nearest('s04', 'Co mam najbliżej w kalendarzu weselnym?'),
  nearest('s05', 'Wypisz trzy najbliższe terminy.', 3),
  nearest('s06', 'Najbliższe wesela — max 4.', 4),
  nearest('s07', 'Pokaż kolejne wesela od dziś, trzy sztuki.', 3),
  nearest('s08', 'Zbliżające się śluby, pierwsze trzy.', 3),
  {
    id: 's09',
    set: 'single',
    family: 'count',
    novelParaphrase: true,
    turns: ['Ile mam wesel w 2028?'],
    expect: {
      requireClosedYear: 2028,
      requireAggregate: 'count',
      allowRootSearch: true,
    },
  },
  {
    id: 's10',
    set: 'single',
    family: 'count',
    novelParaphrase: true,
    turns: ['Policz śluby w 2027.'],
    expect: {
      requireClosedYear: 2027,
      requireAggregate: 'count',
      allowRootSearch: true,
    },
  },
  {
    id: 's11',
    set: 'single',
    family: 'date_year',
    novelParaphrase: true,
    turns: ['Pokaż wesela z przyszłego roku.'],
    expect: { requireClosedYear: 2027, allowRootSearch: true },
  },
  {
    id: 's12',
    set: 'single',
    family: 'date_year',
    turns: ['Lista ślubów 2026.'],
    expect: { requireClosedYear: 2026, allowRootSearch: true },
  },
  {
    id: 's13',
    set: 'single',
    family: 'date_month',
    novelParaphrase: true,
    turns: ['Ile wesel w październiku 2026?'],
    expect: {
      requireClosedMonth: { year: 2026, month: 10 },
      requireAggregate: 'count',
      allowRootSearch: true,
    },
  },
  {
    id: 's14',
    set: 'single',
    family: 'date_month',
    turns: ['Pokaż wesela w grudniu 2026.'],
    expect: {
      requireClosedMonth: { year: 2026, month: 12 },
      allowRootSearch: true,
    },
  },
  {
    id: 's15',
    set: 'single',
    family: 'place',
    novelParaphrase: true,
    turns: ['Pokaż wesela w Villa Love w 2027.'],
    expect: {
      requireClosedYear: 2027,
      requirePlaceContains: 'Villa Love',
      allowRootSearch: true,
    },
  },
  {
    id: 's16',
    set: 'single',
    family: 'place',
    turns: ['Wypisz śluby w Hotelu w 2026.'],
    expect: { requireClosedYear: 2026, requirePlaceContains: 'Hotel', allowRootSearch: true },
  },
  {
    id: 's17',
    set: 'single',
    family: 'exclude',
    novelParaphrase: true,
    turns: ['Pokaż wesela 2027 bez Villa Love.'],
    expect: {
      requireClosedYear: 2027,
      requirePlaceExclude: 'Villa Love',
      allowRootSearch: true,
    },
  },
  {
    id: 's18',
    set: 'single',
    family: 'exclude',
    turns: ['Policz wesela w 2027 poza Villa Love.'],
    expect: {
      requireClosedYear: 2027,
      requirePlaceExclude: 'Villa Love',
      requireAggregate: 'count',
      allowRootSearch: true,
    },
  },
  {
    id: 's19',
    set: 'single',
    family: 'order_limit',
    novelParaphrase: true,
    turns: ['Pokaż 10 najbliższych wesel.'],
    expect: {
      requireFutureFromNow: true,
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: 10,
      allowRootSearch: true,
    },
  },
  {
    id: 's20',
    set: 'single',
    family: 'order_limit',
    turns: ['Pięć najbliższych dat ślubów.'],
    expect: {
      requireFutureFromNow: true,
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: 5,
      allowRootSearch: true,
    },
  },
  {
    id: 's21',
    set: 'single',
    family: 'finance',
    novelParaphrase: true,
    turns: ['Jaka jest wartość umów wesel w 2027?'],
    expect: {
      requireClosedYear: 2027,
      requireAggregate: 'sum',
      requireMeasure: 'contract_value',
      allowRootSearch: true,
    },
  },
  {
    id: 's22',
    set: 'single',
    family: 'finance',
    turns: ['Ile zostało do zapłaty łącznie w 2027?'],
    expect: {
      requireClosedYear: 2027,
      requireAggregate: 'sum',
      requireMeasure: 'remaining_amount',
      allowRootSearch: true,
    },
  },
  {
    id: 's23',
    set: 'single',
    family: 'finance',
    novelParaphrase: true,
    turns: ['Ile łącznie wpłynęło z wesel w 2026?'],
    expect: {
      requireClosedYear: 2026,
      requireAggregate: 'sum',
      requireMeasure: 'paid_amount',
      allowRootSearch: true,
    },
  },
  {
    id: 's24',
    set: 'single',
    family: 'zero',
    turns: ['Ile mam wesel w 2031?'],
    expect: {
      requireClosedYear: 2031,
      requireAggregate: 'count',
      allowRootSearch: true,
    },
  },
  {
    id: 's25',
    set: 'single',
    family: 'zero',
    novelParaphrase: true,
    turns: ['Pokaż wesela z 2035.'],
    expect: { requireClosedYear: 2035, allowRootSearch: true },
  },
  // more singles to reach 60
  ...Array.from({ length: 35 }, (_, i) => {
    const n = i + 26
    const variants: V6LiveCase[] = [
      nearest(`s${n}`, `Pokaż najbliższe ${2 + (i % 3)} wesela.`, 2 + (i % 3)),
      {
        id: `s${n}`,
        set: 'single',
        family: 'count',
        novelParaphrase: i % 2 === 0,
        turns: [`Ile ślubów mam w ${2026 + (i % 3)}?`],
        expect: {
          requireClosedYear: 2026 + (i % 3),
          requireAggregate: 'count',
          allowRootSearch: true,
        },
      },
      {
        id: `s${n}`,
        set: 'single',
        family: 'finance',
        novelParaphrase: true,
        turns: [`Suma wartości umów ${2027 + (i % 2)}.`],
        expect: {
          requireClosedYear: 2027 + (i % 2),
          requireAggregate: 'sum',
          requireMeasure: 'contract_value',
          allowRootSearch: true,
        },
      },
    ]
    return variants[i % 3]!
  }),
]

/** Fix duplicate ids in the generated tail — rebuild singles cleanly below if needed. */

export const V6_LIVE_MULTI: V6LiveCase[] = [
  {
    id: 'm01-core8',
    set: 'multi',
    family: 'reference',
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'A które z nich mam w Villa Love?',
      'Ile są warte?',
      'A ile zostało do zapłaty?',
      'Bez pierwszego.',
      'Wróć do tych trzech.',
      'A tylko wrześniowe.',
      'Ile ich jest?',
    ],
    expect: { requireTransformNotRootSearch: true },
  },
  {
    id: 'm02-original',
    set: 'special',
    family: 'nearest',
    turns: ['Pokaż mi te najbliższe.', 'A które z nich mam w Villa Love?'],
    expect: {
      requireFutureFromNow: true,
      requireSortDateAsc: true,
      requireTransformNotRootSearch: true,
      requirePlaceContains: 'Villa Love',
      allowClarify: true,
    },
  },
  {
    id: 'm03-novel',
    set: 'special',
    family: 'novel',
    turns: [
      'Z przyszłorocznych wesel pokaż pięć najbliższych, pomiń Villa Love i powiedz ile łącznie zostało mi z nich do otrzymania.',
    ],
    expect: {
      requireClosedYear: 2027,
      requirePlaceExclude: 'Villa Love',
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: 5,
      requireAggregate: 'sum',
      requireMeasure: 'remaining_amount',
      allowRootSearch: true,
    },
  },
  {
    id: 'm04-ref-te',
    set: 'multi',
    family: 'reference',
    novelParaphrase: true,
    turns: ['Pokaż 3 najbliższe wesela.', 'Pokaż je.'],
    expect: { requireTransformNotRootSearch: true, allowClarify: true },
  },
  {
    id: 'm05-ref-nich',
    set: 'multi',
    family: 'reference',
    turns: ['Pokaż 4 najbliższe wesela.', 'Które z nich są w Villa Love?'],
    expect: {
      requireTransformNotRootSearch: true,
      requirePlaceContains: 'Villa Love',
    },
  },
  {
    id: 'm06-ref-pierwsze',
    set: 'multi',
    family: 'exclude',
    novelParaphrase: true,
    turns: ['Pokaż 3 najbliższe wesela.', 'Bez pierwszego.'],
    expect: { requireTransformNotRootSearch: true },
  },
  {
    id: 'm07-ref-tamte',
    set: 'multi',
    family: 'restore',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Tylko Villa Love.',
      'Wróć do tamtych trzech.',
    ],
    expect: { requireRestore: true },
  },
  {
    id: 'm08-ref-wszystkie',
    set: 'multi',
    family: 'restore',
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Tylko Villa Love.',
      'Jednak wszystkie.',
    ],
    expect: { requireRestore: true, allowClarify: true },
  },
  {
    id: 'm09-corr-year',
    set: 'multi',
    family: 'correction',
    novelParaphrase: true,
    turns: ['Pokaż wesela w 2027.', 'Nie, chodziło mi o 2028.'],
    expect: { requireClosedYear: 2028, allowRootSearch: true },
  },
  {
    id: 'm10-corr-measure',
    set: 'multi',
    family: 'correction',
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Ile są warte?',
      'Nie, ile zostało do zapłaty.',
    ],
    expect: { requireAggregate: 'sum', requireMeasure: 'remaining_amount' },
  },
  {
    id: 'm11-corr-place',
    set: 'multi',
    family: 'correction',
    novelParaphrase: true,
    turns: [
      'Pokaż 5 najbliższych wesel.',
      'Tylko Villa Love.',
      'Jednak bez Villa Love.',
    ],
    expect: {
      requireTransformNotRootSearch: true,
      requirePlaceExclude: 'Villa Love',
    },
  },
  {
    id: 'm12-zero',
    set: 'multi',
    family: 'zero',
    turns: ['Ile mam wesel w 2031?', 'Pokaż je.'],
    expect: { allowRootSearch: true, allowClarify: true },
  },
  {
    id: 'm13-finance-chain',
    set: 'multi',
    family: 'finance',
    turns: [
      'Pokaż wesela w 2027.',
      'Ile są warte?',
      'A ile już zapłacono?',
    ],
    expect: { requireAggregate: 'sum', allowRootSearch: true },
  },
  {
    id: 'm14-place-then-count',
    set: 'multi',
    family: 'place',
    novelParaphrase: true,
    turns: ['Pokaż 3 najbliższe wesela.', 'Z nich Villa Love.', 'Ile ich jest?'],
    expect: {
      requireTransformNotRootSearch: true,
      requireAggregate: 'count',
    },
  },
  {
    id: 'm15-year-then-nearest',
    set: 'multi',
    family: 'nearest',
    turns: ['Pokaż wesela 2027.', 'Pokaż pięć najbliższych z nich.'],
    expect: {
      requireTransformNotRootSearch: true,
      requireSortDateAsc: true,
      requireSlice: true,
      minSlice: 5,
    },
  },
  {
    id: 'm16',
    set: 'multi',
    family: 'reference',
    novelParaphrase: true,
    turns: ['Pokaż 3 najbliższe wesela.', 'Te w Villa Love.'],
    expect: {
      requireTransformNotRootSearch: true,
      requirePlaceContains: 'Villa Love',
    },
  },
  {
    id: 'm17',
    set: 'multi',
    family: 'reference',
    turns: ['Pokaż 3 najbliższe wesela.', 'Policz je.'],
    expect: { requireAggregate: 'count' },
  },
  {
    id: 'm18',
    set: 'multi',
    family: 'finance',
    novelParaphrase: true,
    turns: ['Pokaż wesela 2028.', 'Ile łącznie zostało do otrzymania?'],
    expect: {
      requireAggregate: 'sum',
      requireMeasure: 'remaining_amount',
      allowRootSearch: true,
    },
  },
  {
    id: 'm19',
    set: 'multi',
    family: 'exclude',
    turns: ['Pokaż 4 najbliższe wesela.', 'Pomiń pierwsze dwa.'],
    expect: { requireTransformNotRootSearch: true, allowClarify: true },
  },
  {
    id: 'm20',
    set: 'multi',
    family: 'restore',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Bez pierwszego.',
      'Wróć do poprzednich.',
    ],
    expect: { requireRestore: true },
  },
  {
    id: 'm21',
    set: 'multi',
    family: 'correction',
    turns: ['Pokaż wesela w sierpniu 2026.', 'Chodziło o wrzesień 2026.'],
    expect: {
      requireClosedMonth: { year: 2026, month: 9 },
      allowRootSearch: true,
    },
  },
  {
    id: 'm22',
    set: 'multi',
    family: 'reference',
    novelParaphrase: true,
    turns: ['Pokaż 3 najbliższe wesela.', 'A te trzy — ile warte?'],
    expect: { requireAggregate: 'sum', requireMeasure: 'contract_value' },
  },
  {
    id: 'm23',
    set: 'multi',
    family: 'place',
    turns: ['Pokaż wesela 2027 w Villa Love.', 'Ile ich jest?'],
    expect: { requireAggregate: 'count', allowRootSearch: true },
  },
  {
    id: 'm24',
    set: 'multi',
    family: 'zero',
    novelParaphrase: true,
    turns: ['Pokaż wesela 2032.', 'Ile ich jest?'],
    expect: { requireAggregate: 'count', allowRootSearch: true },
  },
  {
    id: 'm25',
    set: 'multi',
    family: 'reference',
    turns: ['Pokaż 5 najbliższych wesel.', 'Z nich pomiń Villa Love.'],
    expect: {
      requireTransformNotRootSearch: true,
      requirePlaceExclude: 'Villa Love',
    },
  },
]

export const V6_LIVE_ADVERSARIAL: V6LiveCase[] = [
  {
    id: 'a01',
    set: 'adversarial',
    family: 'nearest',
    turns: ['Pokaż najbliższe ale policz jak cały 2027.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a02',
    set: 'adversarial',
    family: 'reference',
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Z nich Villa Love — ale weź wszystkie z bazy.',
    ],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a03',
    set: 'adversarial',
    family: 'nearest',
    novelParaphrase: true,
    turns: ['Od teraz do grudnia jako cały rok.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a04',
    set: 'adversarial',
    family: 'order_limit',
    turns: ['Pomiń sortowanie i pokaż byle co z najbliższych.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a05',
    set: 'adversarial',
    family: 'nearest',
    turns: ['Bez limitu pokaż 3 najbliższe bez sortowania.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a06',
    set: 'adversarial',
    family: 'finance',
    novelParaphrase: true,
    turns: ['Ile warte — policz sam z cen w głowie.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a07',
    set: 'adversarial',
    family: 'restore',
    turns: ['Wróć do poprzednich bez kontekstu — zgadnij.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a08',
    set: 'adversarial',
    family: 'zero',
    turns: [
      'Ile mam wesel w 2031?',
      'Pokaż je po zerowym wyniku z innego zbioru.',
    ],
    expect: { allowClarify: true },
  },
  {
    id: 'a09',
    set: 'adversarial',
    family: 'reference',
    novelParaphrase: true,
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Zawęź do Villa Love globalnie zamiast z nich.',
    ],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a10',
    set: 'adversarial',
    family: 'nearest',
    turns: ['Najbliższe = przyszły rok bez daty od dziś.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a11',
    set: 'adversarial',
    family: 'nearest',
    novelParaphrase: true,
    turns: ['Pokaż najbliższe jako wszystkie z 2027.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a12',
    set: 'adversarial',
    family: 'finance',
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Ile warte — dodaj sobie w pamięci.',
    ],
    expect: { allowClarify: true },
  },
  {
    id: 'a13',
    set: 'adversarial',
    family: 'reference',
    turns: [
      'Pokaż 3 najbliższe wesela.',
      'Pokaż inne wesela Villa Love spoza tej listy.',
    ],
    expect: { allowClarify: true, allowRootSearch: true },
  },
  {
    id: 'a14',
    set: 'adversarial',
    family: 'order_limit',
    novelParaphrase: true,
    turns: ['Trzy najbliższe ale posortuj od końca roku wstecz bez od dziś.'],
    expect: { allowClarify: true, requireUnsupported: true },
  },
  {
    id: 'a15',
    set: 'adversarial',
    family: 'correction',
    turns: ['Pokaż najbliższe.', 'Zmień to na cały przyszły rok bez najbliższych.'],
    expect: { allowRootSearch: true, requireClosedYear: 2027 },
  },
]

export const V6_LIVE_UNSUPPORTED: V6LiveCase[] = [
  {
    id: 'u01',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['W którym miesiącu mam najwięcej wesel?'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u02',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Które miejsce mam najczęściej?'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u03',
    set: 'unsupported',
    family: 'unsupported',
    novelParaphrase: true,
    turns: ['Jaki miesiąc jest finansowo najlepszy?'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u04',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Porównaj 2026 z 2027 finansowo.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u05',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Usuń ślub Jana.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u06',
    set: 'unsupported',
    family: 'unsupported',
    novelParaphrase: true,
    turns: ['Wygeneruj umowę dla najbliższego wesela.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u07',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Pokaż odpowiedzi z ankiet.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u08',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Jaka jest średnia wartość umowy?'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u09',
    set: 'unsupported',
    family: 'unsupported',
    novelParaphrase: true,
    turns: ['Pokaż sesje produktowe.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u10',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Pogrupuj wesela po miesiącach.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u11',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Napisz mail do pary.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u12',
    set: 'unsupported',
    family: 'unsupported',
    novelParaphrase: true,
    turns: ['Zmień termin ślubu na październik.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u13',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Który weekend mam najbardziej obłożony?'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u14',
    set: 'unsupported',
    family: 'unsupported',
    turns: ['Ranking miejscowości po liczbie wesel.'],
    expect: { requireUnsupported: true },
  },
  {
    id: 'u15',
    set: 'unsupported',
    family: 'unsupported',
    novelParaphrase: true,
    turns: ['W którym miesiącu mam najwięcej przychodu z wesel?'],
    expect: { requireUnsupported: true },
  },
]

/** Deduplicate / ensure 60 unique singles with stable ids. */
export function buildLiveSingleCorpus(): V6LiveCase[] {
  const base = V6_LIVE_SINGLE.slice(0, 25)
  const extra: V6LiveCase[] = []
  for (let i = 0; i < 35; i++) {
    const id = `s${String(26 + i).padStart(2, '0')}`
    if (i % 5 === 0) {
      extra.push(
        nearest(id, `Rzuć okiem na ${3 + (i % 2)} najbliższe wesela.`, 3 + (i % 2)),
      )
    } else if (i % 5 === 1) {
      extra.push({
        id,
        set: 'single',
        family: 'count',
        novelParaphrase: true,
        turns: [`Policz wesela ${2026 + (i % 4)}.`],
        expect: {
          requireClosedYear: 2026 + (i % 4),
          requireAggregate: 'count',
          allowRootSearch: true,
        },
      })
    } else if (i % 5 === 2) {
      extra.push({
        id,
        set: 'single',
        family: 'finance',
        novelParaphrase: true,
        turns: [`Ile warte są wesela w ${2027 + (i % 2)}?`],
        expect: {
          requireClosedYear: 2027 + (i % 2),
          requireAggregate: 'sum',
          requireMeasure: 'contract_value',
          allowRootSearch: true,
        },
      })
    } else if (i % 5 === 3) {
      extra.push({
        id,
        set: 'single',
        family: 'place',
        novelParaphrase: true,
        turns: [`Pokaż wesela Villa Love ${2026 + (i % 3)}.`],
        expect: {
          requireClosedYear: 2026 + (i % 3),
          requirePlaceContains: 'Villa Love',
          allowRootSearch: true,
        },
      })
    } else {
      extra.push({
        id,
        set: 'single',
        family: 'date_month',
        novelParaphrase: true,
        turns: [`Wesela w ${((i % 12) + 1)} miesiącu 2027.`],
        expect: {
          requireClosedMonth: { year: 2027, month: (i % 12) + 1 },
          allowRootSearch: true,
          allowClarify: true,
        },
      })
    }
  }
  return [...base, ...extra]
}

export function allLiveCases(): V6LiveCase[] {
  return [
    ...buildLiveSingleCorpus(),
    ...V6_LIVE_MULTI,
    ...V6_LIVE_ADVERSARIAL,
    ...V6_LIVE_UNSUPPORTED,
    ...V6_LIVE_HOLDOUT,
  ]
}

export function liveCorpusCounts() {
  const all = allLiveCases()
  return {
    single: all.filter((c) => c.set === 'single').length,
    multi: all.filter((c) => c.set === 'multi' || c.set === 'special').length,
    adversarial: all.filter((c) => c.set === 'adversarial').length,
    unsupported: all.filter((c) => c.set === 'unsupported').length,
    holdout: all.filter((c) => c.set === 'holdout').length,
    novelParaphrases: all.filter((c) => c.novelParaphrase).length,
    total: all.length,
  }
}
