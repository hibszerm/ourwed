/**
 * V6-F1 — Foundation eval corpus metadata (cases are structural/expected actions).
 * Holdout paraphrases are listed separately and MUST NOT be used for routing.
 */

export type V6EvalCase = {
  id: string
  kind: 'single' | 'multi' | 'adversarial' | 'unsupported' | 'holdout'
  utterance?: string
  turns?: string[]
  /** Expected high-level action types / ops — not phrase templates. */
  expect: {
    actions?: string[]
    tools?: string[]
    failClosed?: boolean
    unsupported?: boolean
  }
}

/** 40 single-turn natural Polish requests (foundation set). */
export const V6_FOUNDATION_SINGLE: V6EvalCase[] = [
  { id: 's01', kind: 'single', utterance: 'Pokaż 3 najbliższe wesela.', expect: { tools: ['query_collection'], actions: ['Search'] } },
  { id: 's02', kind: 'single', utterance: 'Ile mam wesel w 2028?', expect: { tools: ['query_collection', 'aggregate_collection'], actions: ['Search', 'Aggregate'] } },
  { id: 's03', kind: 'single', utterance: 'Policz śluby w sierpniu 2026.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's04', kind: 'single', utterance: 'Pokaż wesela w przyszłym roku.', expect: { actions: ['Search'] } },
  { id: 's05', kind: 'single', utterance: 'Jaka jest wartość umów wesel w 2027?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's06', kind: 'single', utterance: 'Ile zostało do zapłaty łącznie w tym roku?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's07', kind: 'single', utterance: 'Pokaż pięć najbliższych ślubów.', expect: { actions: ['Search'] } },
  { id: 's08', kind: 'single', utterance: 'Wypisz wesela w Villa Love w 2027.', expect: { actions: ['Search'] } },
  { id: 's09', kind: 'single', utterance: 'Ile wesel mam w październiku?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's10', kind: 'single', utterance: 'Pokaż wszystkie wesela z 2026.', expect: { actions: ['Search'] } },
  { id: 's11', kind: 'single', utterance: 'Suma wartości umów na 2028.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's12', kind: 'single', utterance: 'Pokaż najbliższe 2 wesela.', expect: { actions: ['Search'] } },
  { id: 's13', kind: 'single', utterance: 'Policz wesela poza Villa Love w 2027.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's14', kind: 'single', utterance: 'Ile zapłacono łącznie za wesela w 2026?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's15', kind: 'single', utterance: 'Pokaż wesela posortowane od najwcześniejszej daty.', expect: { actions: ['Search'] } },
  { id: 's16', kind: 'single', utterance: 'Lista ślubów w grudniu 2026.', expect: { actions: ['Search'] } },
  { id: 's17', kind: 'single', utterance: 'Ile mam ślubów w przyszłym miesiącu?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's18', kind: 'single', utterance: 'Pokaż 10 najbliższych wesel.', expect: { actions: ['Search'] } },
  { id: 's19', kind: 'single', utterance: 'Wartość umów wesel w Hotelu.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's20', kind: 'single', utterance: 'Policz wesela od dziś.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's21', kind: 'single', utterance: 'Pokaż wesela do końca 2026.', expect: { failClosed: true } },
  { id: 's22', kind: 'single', utterance: 'Ile pozostało do otrzymania w 2027?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's23', kind: 'single', utterance: 'Wypisz śluby w styczniu 2027.', expect: { actions: ['Search'] } },
  { id: 's24', kind: 'single', utterance: 'Pokaż 4 najbliższe wesela bez limitu daty.', expect: { actions: ['Search'] } },
  { id: 's25', kind: 'single', utterance: 'Suma wpłat za wesela w 2026.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's26', kind: 'single', utterance: 'Pokaż wesela w Barn.', expect: { actions: ['Search'] } },
  { id: 's27', kind: 'single', utterance: 'Ile wesel mam łącznie?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's28', kind: 'single', utterance: 'Pokaż najwcześniejsze wesela przyszłego roku — pięć sztuk.', expect: { actions: ['Search'] } },
  { id: 's29', kind: 'single', utterance: 'Policz wesela w maju 2027.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's30', kind: 'single', utterance: 'Wartość kontraktów wesel z 2025.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's31', kind: 'single', utterance: 'Pokaż śluby posortowane od najpóźniejszej daty.', expect: { actions: ['Search'] } },
  { id: 's32', kind: 'single', utterance: 'Ile mam wesel w 2030?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's33', kind: 'single', utterance: 'Lista najbliższych wesel (limit 1).', expect: { actions: ['Search'] } },
  { id: 's34', kind: 'single', utterance: 'Pokaż wesela z wyłączeniem Villa Love w 2027.', expect: { actions: ['Search'] } },
  { id: 's35', kind: 'single', utterance: 'Suma pozostałości do zapłaty w 2028.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's36', kind: 'single', utterance: 'Policz przyszłe wesela.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's37', kind: 'single', utterance: 'Pokaż wesela w listopadzie 2026.', expect: { actions: ['Search'] } },
  { id: 's38', kind: 'single', utterance: 'Ile warte są wesela w 2027?', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 's39', kind: 'single', utterance: 'Wypisz 6 najbliższych dat ślubów.', expect: { actions: ['Search'] } },
  { id: 's40', kind: 'single', utterance: 'Pokaż wesela z 2024 roku.', expect: { actions: ['Search'] } },
]

/** 15 multi-turn conversations. */
export const V6_FOUNDATION_MULTI: V6EvalCase[] = Array.from({ length: 15 }, (_, i) => ({
  id: `m${String(i + 1).padStart(2, '0')}`,
  kind: 'multi' as const,
  turns:
    i === 0
      ? [
          'Pokaż 3 najbliższe wesela.',
          'A które z nich mam w Villa Love?',
          'Ile są warte?',
          'A ile zostało do zapłaty?',
          'Bez pierwszego.',
          'Wróć do tych trzech.',
          'A tylko wrześniowe.',
          'Ile ich jest?',
        ]
      : [
          'Pokaż wesela w 2027.',
          'Tylko te poza Villa Love.',
          'Ile ich jest?',
          'Ile zostało do zapłaty?',
        ],
  expect: { tools: ['query_collection', 'transform_collection', 'aggregate_collection'] },
}))

/** 10 semantic-loss adversarial. */
export const V6_FOUNDATION_ADVERSARIAL: V6EvalCase[] = [
  { id: 'a01', kind: 'adversarial', utterance: 'Pokaż najbliższe ale policz jak cały 2027.', expect: { failClosed: true } },
  { id: 'a02', kind: 'adversarial', utterance: 'Z nich Villa Love — ale weź wszystkie z bazy.', expect: { failClosed: true } },
  { id: 'a03', kind: 'adversarial', utterance: 'Od teraz do grudnia jako cały rok.', expect: { failClosed: true } },
  { id: 'a04', kind: 'adversarial', utterance: 'Pomiń sortowanie i pokaż byle co.', expect: { failClosed: true } },
  { id: 'a05', kind: 'adversarial', utterance: 'Bez limitu pokaż 3 najbliższe bez sortowania.', expect: { failClosed: true } },
  { id: 'a06', kind: 'adversarial', utterance: 'Ile warte — policz sam z cen.', expect: { failClosed: true } },
  { id: 'a07', kind: 'adversarial', utterance: 'Wróć do poprzednich bez handle — zgadnij.', expect: { failClosed: true } },
  { id: 'a08', kind: 'adversarial', utterance: 'Pokaż je po zerowym wyniku z innego zbioru.', expect: { failClosed: true } },
  { id: 'a09', kind: 'adversarial', utterance: 'Zawęź do Villa Love globalnie zamiast z nich.', expect: { failClosed: true } },
  { id: 'a10', kind: 'adversarial', utterance: 'Najbliższe = przyszły rok bez daty od dziś.', expect: { failClosed: true } },
]

/** 10 unsupported. */
export const V6_FOUNDATION_UNSUPPORTED: V6EvalCase[] = [
  { id: 'u01', kind: 'unsupported', utterance: 'Który miesiąc mam najbardziej zajęty?', expect: { unsupported: true } },
  { id: 'u02', kind: 'unsupported', utterance: 'Porównaj 2026 z 2027 finansowo.', expect: { unsupported: true } },
  { id: 'u03', kind: 'unsupported', utterance: 'Usuń ślub Jana.', expect: { unsupported: true } },
  { id: 'u04', kind: 'unsupported', utterance: 'Wygeneruj umowę.', expect: { unsupported: true } },
  { id: 'u05', kind: 'unsupported', utterance: 'Pokaż zadania z ankiet.', expect: { unsupported: true } },
  { id: 'u06', kind: 'unsupported', utterance: 'Średnia wartość umowy.', expect: { unsupported: true } },
  { id: 'u07', kind: 'unsupported', utterance: 'Pokaż sesje produktowe.', expect: { unsupported: true } },
  { id: 'u08', kind: 'unsupported', utterance: 'Bez pierwszego i bez ostatniego i pogrupuj.', expect: { unsupported: true } },
  { id: 'u09', kind: 'unsupported', utterance: 'Napisz mail do pary.', expect: { unsupported: true } },
  { id: 'u10', kind: 'unsupported', utterance: 'Zmień termin ślubu.', expect: { unsupported: true } },
]

/**
 * Holdout paraphrases — DO NOT wire into prompts or routers.
 * Used only for later live scoring.
 */
export const V6_HOLDOUT_PARAPHRASES: V6EvalCase[] = [
  { id: 'h01', kind: 'holdout', utterance: 'Daj mi trójkę najbliższych dat weselnych.', expect: { actions: ['Search'] } },
  { id: 'h02', kind: 'holdout', utterance: 'Z tego zestawu zostaw tylko Villa Love.', expect: { actions: ['Refine'] } },
  { id: 'h03', kind: 'holdout', utterance: 'Jaka jest łączna wartość tych umów?', expect: { actions: ['Aggregate'] } },
  { id: 'h04', kind: 'holdout', utterance: 'A ile jeszcze mi mają zapłacić?', expect: { actions: ['Aggregate'] } },
  { id: 'h05', kind: 'holdout', utterance: 'Odrzuć pierwszą pozycję z listy.', expect: { actions: ['Transform'] } },
  { id: 'h06', kind: 'holdout', utterance: 'Przywróć wcześniejszą trójkę.', expect: { actions: ['Restore'] } },
  { id: 'h07', kind: 'holdout', utterance: 'Zostaw wyłącznie wrześniowe jeśli rok jasny.', expect: { actions: ['Refine'] } },
  { id: 'h08', kind: 'holdout', utterance: 'Policz aktualny zbiór.', expect: { actions: ['Aggregate'] } },
  { id: 'h09', kind: 'holdout', utterance: 'Z roku 2027 weź pięć najbliższych, bez Villa Love, suma remaining.', expect: { actions: ['Search', 'Aggregate'] } },
  { id: 'h10', kind: 'holdout', utterance: 'Pokaż pusty wynik ponownie — te same zero.', expect: { actions: ['Restore'] } },
]

export function v6FoundationCorpusCounts() {
  return {
    single: V6_FOUNDATION_SINGLE.length,
    multi: V6_FOUNDATION_MULTI.length,
    adversarial: V6_FOUNDATION_ADVERSARIAL.length,
    unsupported: V6_FOUNDATION_UNSUPPORTED.length,
    holdout: V6_HOLDOUT_PARAPHRASES.length,
  }
}
