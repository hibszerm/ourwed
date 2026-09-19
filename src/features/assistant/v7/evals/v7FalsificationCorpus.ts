/**
 * V7 falsification corpus — realistic Polish multi-turn owner conversations.
 * Score user-level semantics against fixture CRM truth. No phrase dictionaries.
 */

import {
  fixtureLargestRemainingInYearEnd,
  fixtureRemainingYearEndIds,
  fixtureRemainingYearEndSum,
  V7_FIXTURE_TODAY,
  V7_FIXTURE_WEDDINGS,
} from './v7FixtureUniverse'

export type V7TurnExpectation = {
  /** Supported unambiguous turn that must succeed. */
  supportedUnambiguous: boolean
  /** Clarification or intentional unsupported refusal is OK. */
  allowClarifyOrRefuse?: boolean
  /** Soft checks on tool usage / answer content. */
  expect?: {
    /** At least one of these tools should run. */
    toolsAny?: string[]
    /** Final answer should match / include. */
    answerIncludes?: string[]
    answerMatches?: RegExp[]
    /** Numeric facts that must appear (formatted flexibly). */
    answerIncludesNumber?: number[]
    /** Must refuse writes / unsupported. */
    refuse?: boolean
    /** Must ask clarification. */
    clarify?: boolean
    /**
     * Reception questions: honest empty PLACE.RECEPTION_* is success.
     * Do not require WEDDING.PRIMARY_LOCATION text as a substitute.
     */
    acceptReceptionUnfilled?: boolean
  }
}

export type V7FalsificationConversation = {
  id: string
  title: string
  turns: Array<{
    user: string
    expect: V7TurnExpectation
  }>
}

const yearEndCount = fixtureRemainingYearEndIds().length
const yearEndSum = fixtureRemainingYearEndSum()
const largest = fixtureLargestRemainingInYearEnd()

export const V7_FALSIFICATION_CORPUS: V7FalsificationConversation[] = [
  {
    id: 'owner-failure-exact',
    title: 'Exact live owner failure conversation',
    turns: [
      {
        user: 'Ile mam jeszcze wesel do końca roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'aggregate_resources'],
            answerIncludesNumber: [yearEndCount],
          },
        },
      },
      {
        user: 'Pokaż je.',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['describe_resource_set'],
            answerIncludes: ['Julia', 'Anna', 'Ola', 'Kasia'],
          },
        },
      },
      {
        user: 'A ile pozostało łącznie do zapłaty na tych ślubach?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['aggregate_resources'],
            answerIncludesNumber: [yearEndSum],
          },
        },
      },
      {
        user: 'A na którym z nich zostało najwięcej?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['sort_resources', 'inspect_resource'],
            answerIncludes: [largest.label.split(' & ')[0]!],
          },
        },
      },
      {
        user: 'Jaki mam numer do panny młodej?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource'],
            answerIncludes: [largest.bridePhone!.replace(/\s/g, '')],
          },
        },
      },
    ],
  },
  {
    id: 'future-year',
    title: 'Wesela w przyszłym roku',
    turns: [
      {
        user: 'Ile mam wesel w przyszłym roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludesNumber: [1],
          },
        },
      },
      {
        user: 'Które to?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['describe_resource_set', 'inspect_resource'],
            answerIncludes: ['Ewa'],
          },
        },
      },
    ],
  },
  {
    id: 'villa-love-2028',
    title: 'Villa Love 2028 + correction',
    turns: [
      {
        user: 'Pokaż wesela w Villa Love w przyszłym roku.',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludes: ['Ewa'],
          },
        },
      },
      {
        user: 'Nie, pokaż jednak wszystkie z Villa Love, ale w 2028.',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludes: ['Magda'],
          },
        },
      },
    ],
  },
  {
    id: 'nearest-three',
    title: 'Najbliższe trzy + refine bez zaliczki',
    turns: [
      {
        user: 'Pokaż trzy najbliższe wesela.',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludesNumber: [3],
          },
        },
      },
      {
        user: 'A które z nich nie mają zaliczki?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['refine_resources'],
            answerIncludes: ['Anna'],
          },
        },
      },
    ],
  },
  {
    id: 'deposit-unsigned',
    title: 'Bez podpisu umowy',
    turns: [
      {
        user: 'Które wesela do końca roku nie mają podpisanej umowy?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'refine_resources'],
            answerIncludes: ['Anna'],
          },
        },
      },
    ],
  },
  {
    id: 'package-inspect',
    title: 'Pakiet na konkretnym ślubie',
    turns: [
      {
        user: 'Jakie mam wesela w grudniu?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludes: ['Ola'],
          },
        },
      },
      {
        user: 'Jaki pakiet ma to wesele?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource'],
            answerIncludes: ['Gold'],
          },
        },
      },
    ],
  },
  {
    id: 'groom-pronoun',
    title: 'Zaimki pan młody',
    turns: [
      {
        user: 'Pokaż wesele Julii i Adama.',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludes: ['Julia'],
          },
        },
      },
      {
        user: 'A jaki numer ma pan młody?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource'],
            answerIncludes: ['500333444'],
          },
        },
      },
    ],
  },
  {
    id: 'travel-fee',
    title: 'Opłata dojazdowa',
    turns: [
      {
        user: 'Ile wynosi opłata za dojazd na ślubie Ewy i Bartka?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'inspect_resource'],
            answerIncludesNumber: [1200],
          },
        },
      },
    ],
  },
  {
    id: 'zero-result',
    title: 'Pusty wynik',
    turns: [
      {
        user: 'Ile mam wesel w 2030 roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludesNumber: [0],
          },
        },
      },
    ],
  },
  {
    id: 'empty-phone',
    title: 'Pusty numer panny młodej',
    turns: [
      {
        user: 'Pokaż wesele Kasi i Tomka.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'Jaki mam numer do panny młodej?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource'],
            // Empty CRM field — must not invent a number
          },
        },
      },
    ],
  },
  {
    id: 'return-earlier-set',
    title: 'Powrót do wcześniejszego zestawu',
    turns: [
      {
        user: 'Ile mam jeszcze wesel do końca roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludesNumber: [yearEndCount],
          },
        },
      },
      {
        user: 'Pokaż tylko te bez zaliczki.',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['refine_resources'],
            answerIncludes: ['Anna'],
          },
        },
      },
      {
        user: 'Wróć do poprzednich — ile ich było łącznie?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['aggregate_resources'],
            answerIncludesNumber: [yearEndCount],
          },
        },
      },
    ],
  },
  {
    id: 'total-paid',
    title: 'Suma wpłat',
    turns: [
      {
        user: 'Ile łącznie zapłacono na weselach do końca roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'aggregate_resources'],
            answerIncludesNumber: [
              V7_FIXTURE_WEDDINGS.filter(
                (w) =>
                  w.date >= V7_FIXTURE_TODAY && w.date <= '2026-12-31',
              ).reduce((s, w) => s + w.paidAmount, 0),
            ],
          },
        },
      },
    ],
  },
  {
    id: 'contract-value-one',
    title: 'Wartość umowy',
    turns: [
      {
        user: 'Jaka jest wartość umowy na ślubie Magdy i Igora?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'inspect_resource'],
            answerIncludesNumber: [16000],
          },
        },
      },
    ],
  },
  {
    id: 'month-october',
    title: 'Wesela w październiku',
    turns: [
      {
        user: 'Co mam w październiku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludes: ['Julia'],
          },
        },
      },
    ],
  },
  {
    id: 'multi-turn-remaining-top',
    title: 'Pozostało + top bez pokaż je',
    turns: [
      {
        user: 'Ile zostało mi wesel w tym roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources'],
            answerIncludesNumber: [yearEndCount],
          },
        },
      },
      {
        user: 'Na którym zostało najwięcej do zapłaty?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['sort_resources'],
            answerIncludes: ['Anna'],
          },
        },
      },
      {
        user: 'A ile dokładnie?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource', 'aggregate_resources'],
            answerIncludesNumber: [15000],
          },
        },
      },
    ],
  },
  {
    id: 'tasks-related',
    title: 'Otwarte zadania',
    turns: [
      {
        user: 'Pokaż wesele Anny i Piotra.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'Jakie mają otwarte zadania?',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['list_related'] },
        },
      },
    ],
  },
  {
    id: 'questionnaire-status',
    title: 'Status ankiety',
    turns: [
      {
        user: 'Jaki jest status ankiety przedślubnej u Julii i Adama?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'inspect_resource'],
          },
        },
      },
    ],
  },
  {
    id: 'unsupported-notes',
    title: 'Raw notes unsupported',
    turns: [
      {
        user: 'Przeczytaj mi notatki ze ślubu Julii.',
        expect: {
          supportedUnambiguous: false,
          allowClarifyOrRefuse: true,
          expect: { refuse: true },
        },
      },
    ],
  },
  {
    id: 'unsupported-questionnaire-body',
    title: 'Treść ankiety unsupported',
    turns: [
      {
        user: 'Co dokładnie napisali w ankiecie przedślubnej u Oli?',
        expect: {
          supportedUnambiguous: false,
          allowClarifyOrRefuse: true,
          expect: { refuse: true },
        },
      },
    ],
  },
  {
    id: 'write-request',
    title: 'Write request refused',
    turns: [
      {
        user: 'Dodaj nowe wesele na 12 czerwca 2027.',
        expect: {
          supportedUnambiguous: false,
          allowClarifyOrRefuse: true,
          expect: { refuse: true },
        },
      },
    ],
  },
  {
    id: 'ambiguous-reference',
    title: 'Ambiguous pronoun',
    turns: [
      {
        user: 'Pokaż wesela w Villa Love.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'A ona?',
        expect: {
          supportedUnambiguous: false,
          allowClarifyOrRefuse: true,
          expect: { clarify: true },
        },
      },
    ],
  },
  {
    id: 'long-chain-six',
    title: '6-turn chain year-end finance',
    turns: [
      {
        user: 'Ile mam jeszcze wesel do końca roku?',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludesNumber: [yearEndCount] },
        },
      },
      {
        user: 'Pokaż je.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['describe_resource_set'] },
        },
      },
      {
        user: 'Które nie mają zaliczki?',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludes: ['Anna'] },
        },
      },
      {
        user: 'A ile pozostało do zapłaty na tym bez zaliczki?',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludesNumber: [15000] },
        },
      },
      {
        user: 'Jaki pakiet?',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludes: ['Silver'] },
        },
      },
      {
        user: 'Daj numer do pani młodej.',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludes: ['501222333'] },
        },
      },
    ],
  },
  {
    id: 'long-chain-rebase',
    title: '5-turn rebase to 2028',
    turns: [
      {
        user: 'Pokaż wesela Villa Love do końca roku.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'Te najbliższe.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['sort_resources', 'describe_resource_set'] },
        },
      },
      {
        user: 'Jednak pokaż Villa Love w 2028.',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludes: ['Magda'] },
        },
      },
      {
        user: 'Czy wszystko już opłacone?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource', 'aggregate_resources'],
            answerIncludesNumber: [0],
          },
        },
      },
      {
        user: 'Jaki pakiet mają?',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludes: ['Platinum'] },
        },
      },
    ],
  },
  {
    id: 'sessions-related',
    title: 'Sesje',
    turns: [
      {
        user: 'Pokaż ślub Oli i Marka.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'Jakie mają sesje?',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['list_related'] },
        },
      },
    ],
  },
  {
    id: 'payments-related',
    title: 'Lista płatności',
    turns: [
      {
        user: 'Pokaż ślub Julii i Adama.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'Pokaż płatności.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['list_related'] },
        },
      },
    ],
  },
  {
    id: 'signed-filter',
    title: 'Podpisane umowy do końca roku',
    turns: [
      {
        user: 'Które wesela do końca roku mają już podpisaną umowę?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['search_resources', 'refine_resources'],
            answerIncludes: ['Julia'],
          },
        },
      },
    ],
  },
  {
    id: 'past-excluded',
    title: 'Jeszcze = nie przeszłe',
    turns: [
      {
        user: 'Ile mam jeszcze wesel w tym roku?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            // Must NOT include past May wedding → 4 not 5
            answerIncludesNumber: [yearEndCount],
          },
        },
      },
    ],
  },
  {
    id: 'extras-related',
    title: 'Dodatki',
    turns: [
      {
        user: 'Pokaż wesele Ewy.',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['search_resources'] },
        },
      },
      {
        user: 'Jakie mają dodatki?',
        expect: {
          supportedUnambiguous: true,
          expect: { toolsAny: ['list_related'] },
        },
      },
    ],
  },
  {
    id: 'bride-then-place',
    title: 'Kontynuacja po pani młodej',
    turns: [
      {
        user: 'Znajdź wesele Anny Wiśniewskiej.',
        expect: {
          supportedUnambiguous: true,
          expect: { answerIncludes: ['Anna'] },
        },
      },
      {
        user: 'Gdzie jest przyjęcie?',
        expect: {
          supportedUnambiguous: true,
          expect: {
            toolsAny: ['inspect_resource'],
            // PLACE.RECEPTION_* is authoritative; fixture has null reception slots.
            // Honest unfilled must pass — do not require PRIMARY_LOCATION "Pałac".
            acceptReceptionUnfilled: true,
          },
        },
      },
    ],
  },
  {
    id: 'write-payment',
    title: 'Write payment refused',
    turns: [
      {
        user: 'Oznacz zaliczkę u Anny jako opłaconą.',
        expect: {
          supportedUnambiguous: false,
          allowClarifyOrRefuse: true,
          expect: { refuse: true },
        },
      },
    ],
  },
]

export function summarizeCorpus(): {
  conversations: number
  turns: number
  supportedUnambiguous: number
} {
  let turns = 0
  let supportedUnambiguous = 0
  for (const c of V7_FALSIFICATION_CORPUS) {
    for (const t of c.turns) {
      turns += 1
      if (t.expect.supportedUnambiguous) supportedUnambiguous += 1
    }
  }
  return {
    conversations: V7_FALSIFICATION_CORPUS.length,
    turns,
    supportedUnambiguous,
  }
}
