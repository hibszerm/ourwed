/**
 * V6-SV2 — Blind holdout corpus (frozen BEFORE verifier run).
 * Semantic-effect gold only — no preferred op labels.
 */

export type Sv2SemanticGold = 'FAITHFUL' | 'NOT_FAITHFUL' | 'AMBIGUOUS'
export type Sv2Scope =
  | 'ROOT'
  | 'REFINE_ACTIVE'
  | 'RESTORE'
  | 'AGGREGATE_ACTIVE'
  | 'OTHER'
export type Sv2CapabilityGold = 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_RELEVANT'

export type Sv2HoldoutCase = {
  id: string
  partition: 'blind_holdout'
  family:
    | 'single_compositional'
    | 'multi_refine'
    | 'correction'
    | 'equivalence'
    | 'capability'
    | 'omission'
    | 'ambiguous'
  utterance: string
  priorUtterances: string[]
  contextNote: string
  draftPlan: unknown
  semantic_gold: Sv2SemanticGold
  expected_scope: Sv2Scope
  capability_gold: Sv2CapabilityGold
  required_semantics: string[]
  goldNote: string
}

function searchWedding(partial: Record<string, unknown>) {
  return {
    type: 'Search',
    source: 'wedding',
    ...partial,
  }
}

function collectionOut(fromStep: string) {
  return { kind: 'COLLECTION' as const, fromStep }
}

function aggregateOut(fromStep: string) {
  return { kind: 'AGGREGATE' as const, fromStep }
}

function unsupported(reason: string) {
  return { steps: [], output: { kind: 'UNSUPPORTED' as const, reason } }
}

/** ~30 blind holdout cases — frozen gold. */
export const SV2_BLIND_HOLDOUT: Sv2HoldoutCase[] = [
  // —— 6 single-turn compositional ——
  {
    id: 'sv2-h01',
    partition: 'blind_holdout',
    family: 'single_compositional',
    utterance:
      'Z wesel w 2026 wybierz cztery najbliższe terminowo, pomijając Dwór Nadziei.',
    priorUtterances: [],
    contextNote: 'Single-turn root.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            excludePlace: {
              field: 'place.name',
              op: 'contains',
              value: 'Dwór Nadziei',
              role: 'any',
            },
            relativeTemporal: { kind: 'closed_calendar_year', year: 2026 },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 4, offset: 0 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'weddings in calendar year 2026',
      'exclude place Dwór Nadziei',
      'order by date ascending',
      'return at most 4',
    ],
    goldNote: 'Full compositional root plan.',
  },
  {
    id: 'sv2-h02',
    partition: 'blind_holdout',
    family: 'single_compositional',
    utterance: 'Policz ile mam wesel zaplanowanych od dzisiaj w przyszłość.',
    priorUtterances: [],
    contextNote: 'Single-turn root.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
          }),
        },
        {
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: 's1',
          inputHandle: null,
          aggregation: 'count',
          measure: null,
        },
      ],
      output: aggregateOut('a1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['future weddings from now', 'count'],
    goldNote: 'Count future.',
  },
  {
    id: 'sv2-h03',
    partition: 'blind_holdout',
    family: 'single_compositional',
    utterance: 'Ile łącznie pozostało do zapłaty z kontraktów wesel 2025?',
    priorUtterances: [],
    contextNote: 'Single-turn root.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'closed_calendar_year', year: 2025 },
          }),
        },
        {
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: 's1',
          inputHandle: null,
          aggregation: 'sum',
          measure: 'remaining_amount',
        },
      ],
      output: aggregateOut('a1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['year 2025', 'sum remaining_amount'],
    goldNote: 'Sum remaining 2025.',
  },
  {
    id: 'sv2-h04',
    partition: 'blind_holdout',
    family: 'single_compositional',
    utterance: 'Pokaż wesela w Pałacu Lilii w 2027.',
    priorUtterances: [],
    contextNote: 'Single-turn root.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            filters: [
              {
                field: 'place.name',
                op: 'contains',
                value: 'Pałac Lilii',
                role: 'any',
              },
            ],
            relativeTemporal: { kind: 'closed_calendar_year', year: 2027 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['place Pałac Lilii', 'year 2027'],
    goldNote: 'Place+year.',
  },
  {
    id: 'sv2-h05',
    partition: 'blind_holdout',
    family: 'single_compositional',
    utterance:
      'Weź przyszłe wesela, posortuj po wartości umowy malejąco i daj mi pierwsze pięć.',
    priorUtterances: [],
    contextNote: 'Single-turn root. Top-N via SORT+SLICE is valid.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'contract_value', direction: 'desc' },
            slice: { limit: 5 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'future weddings',
      'order by contract_value desc',
      'first 5 after that order',
    ],
    goldNote: 'Top-5 by contract via SORT+SLICE.',
  },
  {
    id: 'sv2-h06',
    partition: 'blind_holdout',
    family: 'single_compositional',
    utterance: 'Pokaż dwa najbliższe wesela bez Folwarku Stara Wieś.',
    priorUtterances: [],
    contextNote: 'Single-turn. Exclude ≡ negative filter OK.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            filters: [
              {
                field: 'place.name',
                op: 'contains',
                value: 'Folwark Stara Wieś',
                role: 'any',
              },
            ],
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 2 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'future',
      'exclude Folwark Stara Wieś',
      'nearest 2 by date',
    ],
    goldNote: 'Plausible omission: used include filter instead of exclude.',
  },

  // —— 8 multi-turn refine/reference ——
  {
    id: 'sv2-h07',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'Zostaw tylko te w Hotelu Belweder.',
    priorUtterances: ['Pokaż 6 najbliższych wesel.'],
    contextNote: 'Active col_1 = 6 nearest. Must refine exact prior set.',
    draftPlan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          ops: [
            {
              op: 'Filter',
              place: {
                field: 'place.name',
                op: 'contains',
                value: 'Hotel Belweder',
                role: 'any',
              },
            },
          ],
        },
      ],
      output: collectionOut('t1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'exact prior 6-nearest collection',
      'filter to Hotel Belweder',
    ],
    goldNote: 'Refine prior.',
  },
  {
    id: 'sv2-h08',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'A które z tej listy są w Hotelu Belweder?',
    priorUtterances: ['Pokaż 6 najbliższych wesel.'],
    contextNote: 'Must refine exact prior; root search breaks identity.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            filters: [
              {
                field: 'place.name',
                op: 'contains',
                value: 'Hotel Belweder',
                role: 'any',
              },
            ],
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 6 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'filter prior exact list',
      'not rematerialize nearest-6 root',
    ],
    goldNote: 'Root rematerialization loses exact collection identity.',
  },
  {
    id: 'sv2-h09',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'Wróć do poprzedniej szóstki.',
    priorUtterances: [
      'Pokaż 6 najbliższych wesel.',
      'Zostaw tylko te w Hotelu Belweder.',
    ],
    contextNote: 'col_1=6 nearest, col_2=Belweder subset. Restore col_1.',
    draftPlan: {
      steps: [
        {
          id: 'r1',
          kind: 'RESTORE_COLLECTION',
          inputHandle: 'col_1',
        },
      ],
      output: collectionOut('r1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'RESTORE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['restore exact prior 6-nearest snapshot'],
    goldNote: 'Restore.',
  },
  {
    id: 'sv2-h10',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'Policz ile ich jest.',
    priorUtterances: [
      'Pokaż 6 najbliższych wesel.',
      'Zostaw tylko te w Hotelu Belweder.',
    ],
    contextNote: 'Aggregate over active Belweder-refined set.',
    draftPlan: {
      steps: [
        {
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_2',
          aggregation: 'count',
          measure: null,
        },
      ],
      output: aggregateOut('a1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'AGGREGATE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['count over active refined collection'],
    goldNote: 'Aggregate active.',
  },
  {
    id: 'sv2-h11',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'Weź wszystkie wesela z bazy w Hotelu Belweder, nie tylko z tej listy.',
    priorUtterances: ['Pokaż 6 najbliższych wesel.'],
    contextNote: 'Explicit global reset away from prior list.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            filters: [
              {
                field: 'place.name',
                op: 'contains',
                value: 'Hotel Belweder',
                role: 'any',
              },
            ],
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['global Belweder search', 'not limited to prior 6'],
    goldNote: 'Explicit root reset.',
  },
  {
    id: 'sv2-h12',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'Weź wszystkie wesela z bazy w Hotelu Belweder, nie tylko z tej listy.',
    priorUtterances: ['Pokaż 6 najbliższych wesel.'],
    contextNote: 'Same utterance; wrong plan refines prior.',
    draftPlan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          ops: [
            {
              op: 'Filter',
              place: {
                field: 'place.name',
                op: 'contains',
                value: 'Hotel Belweder',
                role: 'any',
              },
            },
          ],
        },
      ],
      output: collectionOut('t1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['global reset', 'not refine prior nearest-6'],
    goldNote: 'Global request incorrectly refined.',
  },
  {
    id: 'sv2-h13',
    partition: 'blind_holdout',
    family: 'multi_refine',
    utterance: 'Z tych — bez pierwszego.',
    priorUtterances: ['Pokaż 4 najbliższe wesela.'],
    contextNote: 'Ordinal exclude on exact prior.',
    draftPlan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          ops: [{ op: 'Exclude', by: 'ordinal', ordinal: 1 }],
        },
      ],
      output: collectionOut('t1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['exclude first item of prior ordered set'],
    goldNote: 'Ordinal exclude.',
  },
  {
    id: 'sv2-h14',
    partition: 'blind_holdout',
    family: 'ambiguous',
    utterance: 'Pokaż je albo te wcześniejsze — jak wolisz.',
    priorUtterances: [
      'Pokaż 4 najbliższe wesela.',
      'Z tych — bez pierwszego.',
    ],
    contextNote: 'Genuine ambiguity: current set vs previous set.',
    draftPlan: {
      steps: [
        {
          id: 'r1',
          kind: 'RESTORE_COLLECTION',
          inputHandle: 'col_2',
        },
      ],
      output: collectionOut('r1'),
    },
    semantic_gold: 'AMBIGUOUS',
    expected_scope: 'OTHER',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'unclear whether current excluded set or prior four',
    ],
    goldNote: 'Ambiguous reference; UNCERTAIN acceptable.',
  },

  // —— 6 corrections ——
  {
    id: 'sv2-h15',
    partition: 'blind_holdout',
    family: 'correction',
    utterance: 'Przepraszam, chodziło o 2026, nie 2025.',
    priorUtterances: ['Pokaż wesela z 2025 w Stodole Pod Lipą.'],
    contextNote: 'Year correction; place filter must survive.',
    draftPlan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          ops: [
            {
              op: 'RelativeTemporal',
              temporal: { kind: 'closed_calendar_year', year: 2026 },
            },
          ],
        },
      ],
      output: collectionOut('t1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['year → 2026', 'keep Stodola Pod Lipą place scope'],
    goldNote: 'Year correction on prior collection.',
  },
  {
    id: 'sv2-h16',
    partition: 'blind_holdout',
    family: 'correction',
    utterance: 'Przepraszam, chodziło o 2026, nie 2025.',
    priorUtterances: ['Pokaż wesela z 2025 w Stodole Pod Lipą.'],
    contextNote: 'Same correction; plan drops place by root year-only search.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'closed_calendar_year', year: 2026 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['correct year', 'preserve place Stodola Pod Lipą'],
    goldNote: 'Year fix but drops place.',
  },
  {
    id: 'sv2-h17',
    partition: 'blind_holdout',
    family: 'correction',
    utterance: 'Nie wartość umowy — ile już zapłacono łącznie z tej listy.',
    priorUtterances: [
      'Pokaż 5 najbliższych wesel.',
      'Ile łącznie są warte?',
    ],
    contextNote: 'Measure correction; preserve collection.',
    draftPlan: {
      steps: [
        {
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          aggregation: 'sum',
          measure: 'paid_amount',
        },
      ],
      output: aggregateOut('a1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'AGGREGATE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['sum paid_amount', 'same prior nearest-5 set'],
    goldNote: 'Measure correction paid.',
  },
  {
    id: 'sv2-h18',
    partition: 'blind_holdout',
    family: 'correction',
    utterance: 'Nie wartość umowy — ile już zapłacono łącznie z tej listy.',
    priorUtterances: [
      'Pokaż 5 najbliższych wesel.',
      'Ile łącznie są warte?',
    ],
    contextNote: 'Wrong: keeps contract_value.',
    draftPlan: {
      steps: [
        {
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          aggregation: 'sum',
          measure: 'contract_value',
        },
      ],
      output: aggregateOut('a1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'AGGREGATE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['paid_amount not contract_value', 'same collection'],
    goldNote: 'Measure correction ignored.',
  },
  {
    id: 'sv2-h19',
    partition: 'blind_holdout',
    family: 'correction',
    utterance: 'Jednak z Dworem, nie bez niego.',
    priorUtterances: [
      'Pokaż przyszłe wesela bez Dworu Nadziei.',
    ],
    contextNote: 'Exclusion reversal → remove exclude / include Dwór.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'future weddings',
      'Dwór Nadziei no longer excluded',
    ],
    goldNote: 'Exclusion reversed via fresh future search without exclude.',
  },
  {
    id: 'sv2-h20',
    partition: 'blind_holdout',
    family: 'correction',
    utterance: 'Chodziło o Barnę Brzozową, nie o Pałac Lilii.',
    priorUtterances: ['Pokaż wesela w Pałacu Lilii w 2027.'],
    contextNote: 'Place correction; year should survive.',
    draftPlan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          ops: [
            {
              op: 'Filter',
              place: {
                field: 'place.name',
                op: 'contains',
                value: 'Barna Brzozowa',
                role: 'any',
              },
            },
          ],
        },
      ],
      output: collectionOut('t1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['place → Barna Brzozowa', 'keep 2027'],
    goldNote: 'Place correction on prior year-scoped set.',
  },

  // —— 4 semantic-equivalence ——
  {
    id: 'sv2-h21',
    partition: 'blind_holdout',
    family: 'equivalence',
    utterance: 'Pokaż trzy wesela z najwyższą wartością umowy.',
    priorUtterances: [],
    contextNote: 'TOP 3 ≡ SORT contract_value DESC + SLICE 3. Ties = first N after order.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            sort: { field: 'contract_value', direction: 'desc' },
            slice: { limit: 3 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'weddings',
      'order by contract_value desc',
      'at most first 3',
    ],
    goldNote: 'Top-3 equivalence.',
  },
  {
    id: 'sv2-h22',
    partition: 'blind_holdout',
    family: 'equivalence',
    utterance: 'Pomiń Restaurację Słoneczną na liście przyszłych.',
    priorUtterances: [],
    contextNote: 'EXCLUDE ≡ negative filter not required as Exclude op.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            excludePlace: {
              field: 'place.name',
              op: 'contains',
              value: 'Restauracja Słoneczna',
              role: 'any',
            },
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['future', 'exclude Restauracja Słoneczna'],
    goldNote: 'Exclude via excludePlace.',
  },
  {
    id: 'sv2-h23',
    partition: 'blind_holdout',
    family: 'equivalence',
    utterance: 'Z tej listy trzy najdroższe kontrakty.',
    priorUtterances: ['Pokaż wesela z 2028.'],
    contextNote: 'Refine prior; SORT+SLICE top-3 by contract_value.',
    draftPlan: {
      steps: [
        {
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          ops: [
            { op: 'Sort', sort: { field: 'contract_value', direction: 'desc' } },
            { op: 'Slice', slice: { limit: 3 } },
          ],
        },
      ],
      output: collectionOut('t1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'REFINE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: [
      'exact prior 2028 set',
      'contract_value desc',
      'top 3',
    ],
    goldNote: 'Prior-list top-3 equivalence.',
  },
  {
    id: 'sv2-h24',
    partition: 'blind_holdout',
    family: 'equivalence',
    utterance: 'Ile zostało do ściągnięcia z tych pięciu?',
    priorUtterances: [
      'Z przyszłorocznych wesel pokaż pięć najbliższych bez Dworu Nadziei.',
    ],
    contextNote: 'remaining unpaid → remaining_amount over prior set.',
    draftPlan: {
      steps: [
        {
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          inputFromStep: null,
          inputHandle: 'col_1',
          aggregation: 'sum',
          measure: 'remaining_amount',
        },
      ],
      output: aggregateOut('a1'),
    },
    semantic_gold: 'FAITHFUL',
    expected_scope: 'AGGREGATE_ACTIVE',
    capability_gold: 'SUPPORTED',
    required_semantics: ['sum remaining_amount over exact prior five'],
    goldNote: 'Remaining unpaid wording.',
  },

  // —— 3 capability ——
  {
    id: 'sv2-h25',
    partition: 'blind_holdout',
    family: 'capability',
    utterance: 'Uszereguj salony według liczby wesel.',
    priorUtterances: [],
    contextNote: 'Group/rank unsupported; clean UNSUPPORTED is semantically faithful.',
    draftPlan: unsupported(
      'Ranking/group-by miejsc według liczby wesel nie jest obsługiwane.',
    ),
    semantic_gold: 'FAITHFUL',
    expected_scope: 'OTHER',
    capability_gold: 'UNSUPPORTED',
    required_semantics: ['honest unsupported for group/rank venues'],
    goldNote: 'Capability split: semantic FAITHFUL + cap UNSUPPORTED.',
  },
  {
    id: 'sv2-h26',
    partition: 'blind_holdout',
    family: 'capability',
    utterance: 'Porównaj przychód 2026 vs 2027 obok siebie.',
    priorUtterances: [],
    contextNote: 'Comparison unsupported.',
    draftPlan: unsupported(
      'Porównanie przychodów między latami nie jest obsługiwane.',
    ),
    semantic_gold: 'FAITHFUL',
    expected_scope: 'OTHER',
    capability_gold: 'UNSUPPORTED',
    required_semantics: ['honest unsupported for year comparison'],
    goldNote: 'Capability comparison.',
  },
  {
    id: 'sv2-h27',
    partition: 'blind_holdout',
    family: 'capability',
    utterance: 'Pogrupuj te wesela po miesiącach.',
    priorUtterances: ['Pokaż wesela z 2027.'],
    contextNote: 'Group on prior unsupported.',
    draftPlan: unsupported(
      'Grupowanie kolekcji wesel po miesiącach nie jest obsługiwane.',
    ),
    semantic_gold: 'FAITHFUL',
    expected_scope: 'OTHER',
    capability_gold: 'UNSUPPORTED',
    required_semantics: ['honest unsupported for group-by month'],
    goldNote: 'Capability group on prior.',
  },

  // —— 3 adversarial omissions (schema-valid, plausible) ——
  {
    id: 'sv2-h28',
    partition: 'blind_holdout',
    family: 'omission',
    utterance:
      'Z wesel w 2026 w Stodole Pod Lipą pokaż trzy najbliższe terminy.',
    priorUtterances: [],
    contextNote: 'Drops year; keeps place+nearest — plausible wrong.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            filters: [
              {
                field: 'place.name',
                op: 'contains',
                value: 'Stodola Pod Lipą',
                role: 'any',
              },
            ],
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 3 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['year 2026', 'place Stodola', 'nearest 3'],
    goldNote: 'Dropped closed year 2026.',
  },
  {
    id: 'sv2-h29',
    partition: 'blind_holdout',
    family: 'omission',
    utterance:
      'Pięć najbliższych przyszłych, ale bez Folwarku Stara Wieś.',
    priorUtterances: [],
    contextNote: 'Drops exclude; returns plain nearest 5.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
            slice: { limit: 5 },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['future', 'exclude Folwark', 'nearest 5'],
    goldNote: 'Dropped exclusion.',
  },
  {
    id: 'sv2-h30',
    partition: 'blind_holdout',
    family: 'omission',
    utterance: 'Pokaż cztery najbliższe wesela.',
    priorUtterances: [],
    contextNote: 'Drops slice — unrestricted future list.',
    draftPlan: {
      steps: [
        {
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchWedding({
            relativeTemporal: { kind: 'future_from_now', inclusive: true },
            sort: { field: 'wedding.date', direction: 'asc' },
          }),
        },
      ],
      output: collectionOut('s1'),
    },
    semantic_gold: 'NOT_FAITHFUL',
    expected_scope: 'ROOT',
    capability_gold: 'SUPPORTED',
    required_semantics: ['future', 'sort date asc', 'limit 4'],
    goldNote: 'Dropped cardinality.',
  },
]
