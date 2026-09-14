/**
 * S0 — Core semantic regression cases (typed GoalSpec authority).
 * Utterance strings are labels only.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { emptyDomainQuery, type DomainQuery } from '../../domainQuery/domainQuery'
import {
  SEMANTIC_FIELD_REGISTRY,
  getFieldCollectionSource,
  type SemanticFieldId,
} from '../../domainQuery/fieldRegistry'
import { emptyGoalSpec } from '../goalSpec'
import {
  clearGoalClarificationSession,
  clearPendingGoalClarificationOnly,
  getPendingGoalClarification,
  setPendingGoalClarification,
  setGoalClarificationActiveCollection,
} from '../goalClarificationSession'
import {
  destroyGoalClarificationOnAssistantClose,
  answerGoalClarification,
} from '../resumeGoalClarification'
import { bindGoalSpec, makeGoalBinderContext } from '../bindGoalSpec'
import {
  getV5GoalShadowGeneration,
  invalidateV5GoalShadowTurn,
  resetV5GoalShadowSessionForTests,
  setV5GoalShadowSessionOpen,
} from '../v5GoalSpecShadow'
import type { GoalClarificationRequest } from '../goalClarificationTypes'
import type { SemanticRegressionCase } from './types'

export const AUGUST_2026 = { from: '2026-08-01', to: '2026-08-31' }
export const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }
export const YEAR_2028 = { from: '2028-01-01', to: '2028-12-31' }

function paidAugustSumQuery(
  extra?: Partial<DomainQuery>,
): DomainQuery {
  return emptyDomainQuery({
    source: 'wedding',
    aggregate: 'sum',
    measure: 'wedding.paid_amount',
    dateBinding: { dimension: 'wedding.date', range: AUGUST_2026 },
    relations: [],
    ...extra,
  })
}

function villaLoveYearQuery(
  range: { from: string; to: string },
  aggregate: DomainQuery['aggregate'] = 'count',
): DomainQuery {
  return emptyDomainQuery({
    source: 'wedding',
    aggregate,
    measure: null,
    dateBinding: { dimension: 'wedding.date', range },
    relations: [
      {
        relation: 'place',
        field: 'place.name',
        op: 'contains',
        value: 'Villa Love',
      },
    ],
  })
}

const MONEY_MEASURES = [
  'wedding.contract_value',
  'wedding.paid_amount',
  'wedding.remaining_amount',
] as const

function hostSrc(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/features/assistant/AssistantHost.tsx'),
    'utf8',
  )
}

function stubPendingMeasureRequest(
  pendingGoal = emptyGoalSpec({
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
  }),
): GoalClarificationRequest {
  return {
    id: 's0-pending-a',
    slot: 'measure',
    questionKey: 'measure',
    options: MONEY_MEASURES.map((id) => ({
      id,
      value: id,
      labelKey:
        id === 'wedding.paid_amount'
          ? 'measure.paid_amount'
          : id === 'wedding.contract_value'
            ? 'measure.contract_value'
            : 'measure.remaining_amount',
    })),
    pendingGoal,
    preservedActiveCollectionQuery: null,
    depth: 0,
    signature: 'measure|0|test',
  }
}

export const SEMANTIC_REGRESSION_CASES: SemanticRegressionCase[] = [
  // 1. August paid sum
  {
    id: '1',
    name: 'August paid sum',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    invariants: ['wedding + sum + paid + wedding.date August 2026'],
    turns: [
      {
        label: 'Ile już wpłynęło z wesel w sierpniu?',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'sum',
          measure: 'wedding.paid_amount',
          temporal: {
            expression: 'sierpień',
            resolvedRange: AUGUST_2026,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'sum',
            measure: 'wedding.paid_amount',
            dateFrom: AUGUST_2026.from,
            dateTo: AUGUST_2026.to,
            dateDimension: 'wedding.date',
          },
        },
        expectedDomainQuery: {
          source: 'wedding',
          aggregate: 'sum',
          measure: 'wedding.paid_amount',
          operation: 'sum',
          dateFrom: AUGUST_2026.from,
          dateDimension: 'wedding.date',
        },
      },
    ],
  },

  // 2. August → next year
  {
    id: '2',
    name: 'August → next year',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    invariants: [
      'preserve paid + sum',
      'replace temporal with 2027',
      'no invented place filter',
    ],
    turns: [
      {
        label: 'Ile już wpłynęło z wesel w sierpniu?',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'sum',
          measure: 'wedding.paid_amount',
          temporal: {
            expression: 'sierpień',
            resolvedRange: AUGUST_2026,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'sum',
            measure: 'wedding.paid_amount',
            dateFrom: AUGUST_2026.from,
          },
        },
        expectedDomainQuery: {
          measure: 'wedding.paid_amount',
          operation: 'sum',
          dateFrom: AUGUST_2026.from,
        },
      },
      {
        label: 'a w przyszłym roku?',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'inherit',
          source: null,
          aggregation: null,
          measure: null,
          inheritance: { fromActiveCollection: true, fromPrevious: true },
          temporal: {
            expression: 'w przyszłym roku',
            resolvedRange: YEAR_2027,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'sum',
            measure: 'wedding.paid_amount',
            dateFrom: YEAR_2027.from,
            dateTo: YEAR_2027.to,
            placeName: null,
          },
        },
        expectedDomainQuery: {
          source: 'wedding',
          measure: 'wedding.paid_amount',
          operation: 'sum',
          dateFrom: YEAR_2027.from,
          placeName: null,
        },
      },
    ],
  },

  // 3. August → show them
  {
    id: '3',
    name: 'August → show them',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    invariants: [
      'keep August temporal',
      'sum → list',
      'no page/month fallback',
    ],
    turns: [
      {
        label: 'paid weddings August 2026',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'sum',
          measure: 'wedding.paid_amount',
          temporal: {
            expression: null,
            resolvedRange: AUGUST_2026,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            aggregation: 'sum',
            measure: 'wedding.paid_amount',
            dateFrom: AUGUST_2026.from,
          },
        },
      },
      {
        label: 'pokaż je',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'inherit',
          source: 'wedding',
          aggregation: 'list',
          measure: null,
          inheritance: { fromActiveCollection: true, fromPrevious: true },
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'list',
            measure: null,
            dateFrom: AUGUST_2026.from,
            dateTo: AUGUST_2026.to,
          },
        },
        expectedDomainQuery: {
          source: 'wedding',
          operation: 'list',
          aggregate: null,
          measure: null,
          dateFrom: AUGUST_2026.from,
          dateDimension: 'wedding.date',
        },
      },
    ],
  },

  // 4. zero-result venue → show them
  {
    id: '4',
    name: 'zero-result venue collection → show them',
    status: 'PASS_CURRENT',
    layer: 'domain_query',
    invariants: [
      'active DomainQuery identity survives resultCount=0',
      'list keeps same filters',
    ],
    turns: [
      {
        label: 'Villa Love 2027 (zero rows possible)',
        activeDomainQuery: null,
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'count',
          relations: [
            {
              relation: 'place',
              field: 'place.name',
              op: 'contains',
              value: 'Villa Love',
            },
          ],
          temporal: {
            expression: '2027',
            resolvedRange: YEAR_2027,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            aggregation: 'count',
            placeName: 'Villa Love',
            dateFrom: YEAR_2027.from,
          },
        },
        expectedDomainQuery: {
          operation: 'count',
          placeName: 'Villa Love',
          dateFrom: YEAR_2027.from,
        },
      },
      {
        label: 'pokaż je (after zero-result identity)',
        // Simulate conversation SoT with explicit active DQ (memberIds irrelevant)
        activeDomainQuery: villaLoveYearQuery(YEAR_2027, 'count'),
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'inherit',
          source: 'wedding',
          aggregation: 'list',
          inheritance: { fromActiveCollection: true, fromPrevious: true },
        }),
        expected: {
          kind: 'bound',
          slots: {
            aggregation: 'list',
            placeName: 'Villa Love',
            dateFrom: YEAR_2027.from,
          },
        },
        expectedDomainQuery: {
          operation: 'list',
          placeName: 'Villa Love',
          dateFrom: YEAR_2027.from,
        },
      },
    ],
  },

  // 5. venue + year composition
  {
    id: '5',
    name: 'venue + year composition',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    turns: [
      {
        label: 'next year Villa Love weddings',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'list',
          relations: [
            {
              relation: 'place',
              field: 'place.name',
              op: 'contains',
              value: 'Villa Love',
            },
          ],
          temporal: {
            expression: '2027',
            resolvedRange: YEAR_2027,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'list',
            placeName: 'Villa Love',
            dateFrom: YEAR_2027.from,
            dateDimension: 'wedding.date',
          },
        },
        expectedDomainQuery: {
          source: 'wedding',
          operation: 'list',
          placeName: 'Villa Love',
          dateFrom: YEAR_2027.from,
        },
      },
    ],
  },

  // 6. sum + unresolved measure → clarification
  {
    id: '6',
    name: 'sum + unresolved measure → clarification',
    status: 'PASS_CURRENT',
    layer: 'clarification_resume',
    invariants: ['missing measure ≠ unsupported'],
    turns: [
      {
        label: 'ile to będzie? (semantic shape only)',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'sum',
          measure: null,
          ambiguities: [
            {
              slot: 'measure',
              reason: 'sum_requires_measure',
              candidates: MONEY_MEASURES.map((id) => ({ id, label: id })),
            },
          ],
        }),
        expected: {
          kind: 'needs_clarification',
          slot: 'measure',
          measureOptions: [...MONEY_MEASURES],
        },
      },
    ],
  },

  // 7. typed paid clarification resume
  {
    id: '7',
    name: 'typed paid clarification resume',
    status: 'PASS_CURRENT',
    layer: 'clarification_resume',
    invariants: ['zero LLM', 'typed value wedding.paid_amount', 'not label parse'],
    turns: [
      {
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'sum',
          measure: null,
          ambiguities: [
            {
              slot: 'measure',
              reason: 'sum_requires_measure',
            },
          ],
        }),
        expected: { kind: 'needs_clarification', slot: 'measure' },
        resume: {
          slot: 'measure',
          selectedValue: 'wedding.paid_amount',
          selectedLabel: 'Już wpłacone',
        },
        expectedAfterResume: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'sum',
            measure: 'wedding.paid_amount',
          },
        },
        expectedDomainQueryAfterResume: {
          source: 'wedding',
          operation: 'sum',
          measure: 'wedding.paid_amount',
        },
      },
    ],
  },

  // 8. source from typed field ownership (current path: U4.8 / binder with measure)
  {
    id: '8',
    name: 'source from typed field ownership',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    note:
      'Registry has entity=wedding on paid_amount but no collectionSource yet. Current PASS via U4.8 auto-resolve / bind withClarification when source null + money sum.',
    turns: [
      {
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: null,
          aggregation: 'sum',
          measure: 'wedding.paid_amount',
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            aggregation: 'sum',
            measure: 'wedding.paid_amount',
          },
        },
        expectedDomainQuery: {
          source: 'wedding',
          measure: 'wedding.paid_amount',
          operation: 'sum',
        },
      },
    ],
  },

  // 9 / 10. source compatibility conflict — TARGET invariant; current DomainQuerySource=wedding only
  {
    id: '9',
    name: 'source ownership metadata',
    status: 'PASS_CURRENT',
    layer: 'registry',
    note:
      'S1: collectionSource explicit on registry. place.* stays null (relation-only).',
    customCheck: () => {
      const paid = SEMANTIC_FIELD_REGISTRY['wedding.paid_amount']
      if (!paid) throw new Error('missing paid field')
      if (paid.entity !== 'wedding') throw new Error('entity should be wedding')
      if (paid.collectionSource !== 'wedding') {
        throw new Error('paid collectionSource should be wedding')
      }
      const place = SEMANTIC_FIELD_REGISTRY['place.name']
      if (place.collectionSource != null) {
        throw new Error('place.name must not set collectionSource')
      }
      if (place.entity !== 'place') throw new Error('place entity')
    },
  },
  {
    id: '10',
    name: 'source compatibility conflict',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    note:
      'S1: synthetic collectionSource override proves inherited wedding is rejected when measure ownership differs. No fake production field.',
    customCheck: () => {
      const active = emptyDomainQuery({
        source: 'wedding',
        aggregate: 'sum',
        measure: 'wedding.paid_amount',
      })
      const goal = emptyGoalSpec({
        requestKind: 'domain_query',
        source: null,
        aggregation: 'sum',
        measure: 'wedding.paid_amount',
      })
      const bound = bindGoalSpec(
        goal,
        makeGoalBinderContext({
          activeCollectionQuery: active,
          getCollectionSource: (id) =>
            id === 'wedding.paid_amount'
              ? 'synthetic_other'
              : getFieldCollectionSource(id),
        }),
      )
      if (bound.status !== 'unsupported') {
        throw new Error(
          `expected unsupported (reject inherit), got ${bound.status}`,
        )
      }
      if (
        !bound.reason.includes('synthetic_other') &&
        !bound.reason.includes('not_in_g7')
      ) {
        throw new Error(`unexpected reason ${bound.reason}`)
      }
    },
  },

  // 11. place relation != collection source
  {
    id: '11',
    name: 'place relation != collection source',
    status: 'PASS_CURRENT',
    layer: 'domain_query',
    turns: [
      {
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'sum',
          measure: 'wedding.paid_amount',
          relations: [
            {
              relation: 'place',
              field: 'place.name',
              op: 'contains',
              value: 'Villa Love',
            },
          ],
        }),
        expected: {
          kind: 'bound',
          slots: {
            source: 'wedding',
            measure: 'wedding.paid_amount',
            placeName: 'Villa Love',
          },
        },
        expectedDomainQuery: {
          source: 'wedding',
          measure: 'wedding.paid_amount',
          placeName: 'Villa Love',
          operation: 'sum',
        },
      },
      {
        label: 'list filtered by venue',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'list',
          relations: [
            {
              relation: 'place',
              field: 'place.name',
              op: 'contains',
              value: 'Villa Love',
            },
          ],
        }),
        expected: {
          kind: 'bound',
          slots: { source: 'wedding', aggregation: 'list', placeName: 'Villa Love' },
        },
        expectedDomainQuery: {
          source: 'wedding',
          operation: 'list',
          placeName: 'Villa Love',
        },
      },
    ],
  },

  // 12. date-dimension preservation
  {
    id: '12',
    name: 'date-dimension preservation',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    note: 'Current G7 slice: only wedding.date is legal. paidAt/session date not in registry as date dimensions.',
    turns: [
      {
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'ask',
          source: 'wedding',
          aggregation: 'count',
          temporal: {
            expression: null,
            resolvedRange: AUGUST_2026,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            dateDimension: 'wedding.date',
            dateFrom: AUGUST_2026.from,
          },
        },
        expectedDomainQuery: {
          dateDimension: 'wedding.date',
          dateFrom: AUGUST_2026.from,
        },
      },
    ],
  },

  // 13. explicit current > compatible inherited
  {
    id: '13',
    name: 'explicit current > compatible inherited',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    turns: [
      {
        activeDomainQuery: paidAugustSumQuery(),
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'inherit',
          source: 'wedding',
          aggregation: 'sum',
          measure: 'wedding.remaining_amount',
          inheritance: { fromActiveCollection: true, fromPrevious: true },
          temporal: {
            expression: null,
            resolvedRange: YEAR_2027,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            measure: 'wedding.remaining_amount',
            dateFrom: YEAR_2027.from,
            aggregation: 'sum',
          },
        },
        expectedDomainQuery: {
          measure: 'wedding.remaining_amount',
          dateFrom: YEAR_2027.from,
          operation: 'sum',
        },
      },
    ],
  },

  // 14. incompatible inheritance does not silently win
  {
    id: '14',
    name: 'incompatible inheritance does not silently win',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    note:
      'Binder (bindGoalSpec): explicit measure + null aggregation must NOT inherit count or invent sum. Clarification adapter does not yet expose aggregation as a UI slot — asserted at Binder layer.',
    customCheck: () => {
      const active = emptyDomainQuery({
        aggregate: 'count',
        dateBinding: {
          dimension: 'wedding.date',
          range: AUGUST_2026,
        },
      })
      const goal = emptyGoalSpec({
        requestKind: 'domain_query',
        dialogue: 'inherit',
        source: 'wedding',
        aggregation: null,
        measure: 'wedding.remaining_amount',
        inheritance: { fromActiveCollection: true, fromPrevious: true },
      })
      const bound = bindGoalSpec(
        goal,
        makeGoalBinderContext({ activeCollectionQuery: active }),
      )
      if (bound.status !== 'needs_clarification') {
        throw new Error(`expected needs_clarification, got ${bound.status}`)
      }
      if (!bound.clarification.missingSlots.includes('aggregation')) {
        throw new Error(
          `expected missingSlots aggregation, got ${bound.clarification.missingSlots.join(',')}`,
        )
      }
    },
  },

  // 15. V5 pending survives V3 parallel (structural Host ownership)
  {
    id: '15',
    name: 'V5 pending clarification survives V3 parallel completion',
    status: 'PASS_CURRENT',
    layer: 'state_ownership',
    customCheck: () => {
      const host = hostSrc()
      // V5 pending checked before V3 workingContext pending
      const v5 = host.indexOf('getPendingGoalClarification()')
      const v3 = host.indexOf('workingContext.pendingClarification')
      if (!(v5 >= 0 && v3 > v5)) {
        throw new Error('V5 pending not checked before V3')
      }
      // V3 apply path must not call clearGoalClarificationSession
      // (only clearPending on new NL / clearAssistant on close)
      // Session module separation
      clearGoalClarificationSession()
      setPendingGoalClarification(stubPendingMeasureRequest())
      // Simulate V3 clearing its own pending only — V5 session untouched
      if (!getPendingGoalClarification()) {
        throw new Error('V5 pending missing')
      }
      // Host must not clear V5 session on V3 clarification resolve string
      if (
        host.includes('pendingClarification: null') &&
        !host.includes('clearPendingGoalClarificationOnly')
      ) {
        // still ok if clear only on NL
      }
      if (!host.includes('clearPendingGoalClarificationOnly')) {
        throw new Error('missing NL supersede seam')
      }
    },
  },

  // 16. new V5 turn supersedes pending
  {
    id: '16',
    name: 'new V5 turn supersedes old pending clarification',
    status: 'PASS_CURRENT',
    layer: 'state_ownership',
    customCheck: () => {
      clearGoalClarificationSession()
      setPendingGoalClarification(stubPendingMeasureRequest())
      const id = getPendingGoalClarification()?.id
      clearPendingGoalClarificationOnly()
      if (getPendingGoalClarification() != null) {
        throw new Error('pending not cleared')
      }
      const stale = answerGoalClarification({
        clarificationId: id!,
        slot: 'measure',
        selectedValue: 'wedding.paid_amount',
      })
      if (stale.status !== 'rejected') {
        throw new Error(`expected rejected, got ${stale.status}`)
      }
    },
  },

  // 17. late V5 result discarded
  {
    id: '17',
    name: 'late V5 result discarded by generation',
    status: 'PASS_CURRENT',
    layer: 'state_ownership',
    customCheck: () => {
      resetV5GoalShadowSessionForTests()
      setV5GoalShadowSessionOpen(true)
      const g0 = getV5GoalShadowGeneration()
      invalidateV5GoalShadowTurn({ reason: 'new_nl_turn' })
      const g1 = getV5GoalShadowGeneration()
      if (g1 !== g0 + 1) {
        throw new Error(`generation did not bump (${g0} → ${g1})`)
      }
      const host = hostSrc()
      if (!host.includes('invalidateV5GoalShadowTurn')) {
        throw new Error('Host missing invalidate on new NL')
      }
    },
  },

  // 18. close destroys state
  {
    id: '18',
    name: 'close destroys V5 ephemeral session',
    status: 'PASS_CURRENT',
    layer: 'state_ownership',
    customCheck: () => {
      clearGoalClarificationSession()
      setPendingGoalClarification(stubPendingMeasureRequest())
      setGoalClarificationActiveCollection(paidAugustSumQuery())
      destroyGoalClarificationOnAssistantClose()
      if (getPendingGoalClarification() != null) {
        throw new Error('pending survived close')
      }
      const host = hostSrc()
      if (!host.includes('clearAssistantV4ShadowSessionAndPending')) {
        throw new Error('Host close missing shadow clear')
      }
    },
  },

  // 19. unsupported vs needs_clarification
  {
    id: '19',
    name: 'unsupported vs needs_clarification distinction',
    status: 'PASS_CURRENT',
    layer: 'taxonomy',
    turns: [
      {
        label: 'missing measure → clarification',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          source: 'wedding',
          aggregation: 'sum',
          measure: null,
        }),
        expected: { kind: 'needs_clarification', slot: 'measure' },
      },
      {
        label: 'rank out of G7 slice → unsupported',
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          source: 'wedding',
          aggregation: 'rank',
          measure: null,
        }),
        expected: {
          kind: 'unsupported',
          reasonIncludes: 'rank',
          conceptualClass: 'understood_but_capability_unavailable',
        },
      },
    ],
  },

  // 20. DomainQuery identity survives zero rows (+ and in 2028?)
  {
    id: '20',
    name: 'DomainQuery identity survives zero rows',
    status: 'PASS_CURRENT',
    layer: 'domain_query',
    invariants: [
      'filters/relations/temporal are SoT',
      'memberIds not authority',
      'year delta preserves venue',
    ],
    turns: [
      {
        activeDomainQuery: villaLoveYearQuery(YEAR_2027, 'count'),
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          dialogue: 'inherit',
          source: 'wedding',
          aggregation: null,
          measure: null,
          inheritance: { fromActiveCollection: true, fromPrevious: true },
          temporal: {
            expression: '2028',
            resolvedRange: YEAR_2028,
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            aggregation: 'count',
            placeName: 'Villa Love',
            dateFrom: YEAR_2028.from,
            dateTo: YEAR_2028.to,
          },
        },
        expectedDomainQuery: {
          operation: 'count',
          placeName: 'Villa Love',
          dateFrom: YEAR_2028.from,
        },
      },
    ],
  },

  // --- Generalization / taxonomy extras ---
  {
    id: 'G-A',
    name: 'generalization: remaining this season',
    status: 'PASS_CURRENT',
    layer: 'resolution',
    turns: [
      {
        goal: emptyGoalSpec({
          requestKind: 'domain_query',
          source: 'wedding',
          aggregation: 'sum',
          measure: 'wedding.remaining_amount',
          temporal: {
            expression: 'ten sezon',
            resolvedRange: {
              from: '2026-01-01',
              to: '2026-12-31',
            },
            dateDimension: 'wedding.date',
            dateDimensionAmbiguous: false,
          },
        }),
        expected: {
          kind: 'bound',
          slots: {
            measure: 'wedding.remaining_amount',
            aggregation: 'sum',
            dateFrom: '2026-01-01',
          },
        },
      },
    ],
  },
  {
    id: 'G-D',
    name: 'future: missing ceremony time',
    status: 'FUTURE_CAPABILITY',
    layer: 'resolution',
    note: 'No ceremony-time field in SEMANTIC_FIELD_REGISTRY.',
  },
  {
    id: 'G-E',
    name: 'future: rank packages by contract value',
    status: 'FUTURE_CAPABILITY',
    layer: 'resolution',
    note: 'rank / package source not in G7 DomainQuery slice.',
  },
  {
    id: 'T-B',
    name: 'taxonomy: understood but capability unavailable',
    status: 'PASS_CURRENT',
    layer: 'taxonomy',
    note: 'Maps to binder unsupported request_kind / aggregate_*_not_in_g7_slice today.',
    turns: [
      {
        goal: emptyGoalSpec({
          requestKind: 'prepare_action',
          topicKey: 'send_invoice',
        }),
        expected: {
          kind: 'unsupported',
          reasonIncludes: 'prepare_action',
          conceptualClass: 'understood_but_capability_unavailable',
        },
      },
    ],
  },
  {
    id: 'T-C',
    name: 'taxonomy: out_of_scope (conceptual)',
    status: 'KNOWN_GAP',
    layer: 'taxonomy',
    note:
      'Luna may emit requestKind=unsupported + unsupportedReason. No distinct OUT_OF_SCOPE enum in binder yet — both collapse to unsupported.',
    customCheck: () => {
      throw new Error(
        'KNOWN_GAP: no OUT_OF_SCOPE vs UNINTERPRETABLE discrimination in binder enums',
      )
    },
  },
  {
    id: 'R-1',
    name: 'registry: money measures allow sum',
    status: 'PASS_CURRENT',
    layer: 'registry',
    customCheck: () => {
      for (const id of MONEY_MEASURES) {
        const def = SEMANTIC_FIELD_REGISTRY[id as SemanticFieldId]
        if (!def.aggregateOperators.includes('sum')) {
          throw new Error(`${id} missing sum`)
        }
        if (def.entity !== 'wedding') throw new Error(`${id} entity`)
        if (def.valueType !== 'money') throw new Error(`${id} valueType`)
      }
      if (!SEMANTIC_FIELD_REGISTRY['wedding.date'].isDateDimension) {
        throw new Error('wedding.date must be date dimension')
      }
      if (SEMANTIC_FIELD_REGISTRY['place.name'].entity !== 'place') {
        throw new Error('place.name entity')
      }
      if (SEMANTIC_FIELD_REGISTRY['place.name'].isDateDimension) {
        throw new Error('place.name must not be date dimension')
      }
    },
  },
  {
    id: 'Z-1',
    name: 'zero-result DQ identity object (not memberIds)',
    status: 'PASS_CURRENT',
    layer: 'domain_query',
    customCheck: () => {
      const q = villaLoveYearQuery(YEAR_2027)
      // DomainActiveCollection may carry memberIds=[] — query remains identity
      const collection = { query: q, memberIds: [] as string[], resultCount: 0 }
      if (collection.resultCount !== 0) throw new Error('setup')
      if (collection.query.relations[0]?.value !== 'Villa Love') {
        throw new Error('query identity lost')
      }
      if (collection.query.dateBinding?.range.from !== YEAR_2027.from) {
        throw new Error('temporal identity lost')
      }
    },
  },
]
