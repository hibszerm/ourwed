/**
 * V6-RF1 — Inherited-collection aggregation + internal error leak.
 * Deterministic; no live model.
 *
 *   npx tsx --tsconfig tsconfig.app.json \
 *     src/features/assistant/v6/evals/v6Rf1AggregateInheritedAcceptance.test.ts
 */

import assert from 'node:assert/strict'
import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import { ASSISTANT_API_FAILURE } from '../../copy'
import { decideV6Authority } from '../authority/decide'
import type { V6ShadowTurnResult } from '../agent/loop'
import {
  destroyV6CollectionSession,
  v6CollectionStore,
} from '../collections/store'
import {
  renderV6TurnResult,
  sanitizeUserFacingReason,
} from '../render/renderV6TurnResult'
import {
  executeTurnPlan,
  parseTurnPlanWire,
  validateTurnPlan,
} from '../turnPlan'

function check(cond: unknown, msg: string): asserts cond {
  assert.ok(cond, msg)
}

function row(
  id: string,
  date: string,
  place: string,
  cv: number,
  paid: number,
): CollectionMoneyRow {
  return {
    id,
    displayLabel: id,
    date,
    contractValue: cv,
    paidAmount: paid,
    remainingAmount: Math.max(0, cv - paid),
    locationHaystack: [place],
    locationByRole: {
      reception: [place],
      ceremony: [place],
      preparations: [place],
    },
  }
}

const UNIVERSE: CollectionMoneyRow[] = [
  row('W1', '2026-10-01', 'Villa', 12000, 3000), // rem 9000
  row('W2', '2026-11-15', 'Hotel', 8000, 0), // rem 8000
  row('W3', '2026-12-20', 'Villa', 15000, 5000), // rem 10000
  row('W4', '2027-01-10', 'Villa', 9000, 1000),
  row('W5', '2026-03-01', 'Barn', 11000, 0), // past in 2026
]

function weddings() {
  return UNIVERSE.map((r) => ({
    id: r.id,
    price: r.contractValue,
    payments: [
      {
        id: `p_${r.id}`,
        label: 'p',
        amount: r.paidAmount,
        paid: r.paidAmount > 0,
        type: 'other' as const,
        paidAt: r.paidAmount > 0 ? '2026-01-01' : undefined,
      },
    ],
  }))
}

function searchYear(year: number) {
  return {
    source: 'wedding',
    filters: null,
    concept_filters: null,
    exclude_place: null,
    temporal: {
      kind: 'closed_calendar_year',
      inclusive: null,
      year,
      month: null,
      from_kind: null,
      from_date: null,
      from_year: null,
      from_month: null,
      to_kind: null,
      to_date: null,
      to_year: null,
      to_month: null,
    },
    sort: null,
    slice: null,
  }
}

function padNullStepFields(extra: Record<string, unknown>) {
  return {
    input_from_step: null,
    input_handle: null,
    search: null,
    transform_ops: null,
    aggregation: null,
    measure: null,
    detail_selector: null,
    inspect_concepts: null,
    relation: null,
    relation_limit: null,
    ...extra,
  }
}

async function exec(wire: unknown) {
  const parsed = parseTurnPlanWire(wire)
  check(parsed.ok, `parse: ${JSON.stringify(parsed)}`)
  if (!parsed.ok) throw new Error('parse')
  const v = validateTurnPlan(parsed.plan)
  check(v.ok, `validate: ${JSON.stringify(v)}`)
  return {
    plan: parsed.plan,
    result: await executeTurnPlan({
      plan: parsed.plan,
      turnId: 'rf1',
      todayKey: '2026-09-15',
      universeRows: UNIVERSE,
      weddings: weddings() as never,
    }),
  }
}

// ---------------------------------------------------------------------------
// RF1 exact live failure shape: good sum on handle + unreachable padded aggregate
// ---------------------------------------------------------------------------
{
  destroyV6CollectionSession()
  const seeded = await exec({
    steps: [
      padNullStepFields({
        id: 'search_year',
        kind: 'SEARCH_COLLECTION',
        search: searchYear(2026),
      }),
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 'search_year',
      reason: null,
      slot: null,
      text: null,
    },
  })
  const handle = seeded.result.executed[0]!.outputHandle!
  const activeBefore = v6CollectionStore.getActive()?.handle
  check(activeBefore === handle, 'R1/R2 active collection seeded')

  // Exact live-shaped wire: valid sum on col + padded AGGREGATE with null aggregation
  const liveShaped = {
    steps: [
      padNullStepFields({
        id: 'step_1',
        kind: 'AGGREGATE_COLLECTION',
        input_handle: handle,
        aggregation: 'sum',
        measure: 'FIN.REMAINING_TO_PAY',
      }),
      padNullStepFields({
        id: 'output_total_remaining',
        kind: 'AGGREGATE_COLLECTION',
        input_from_step: 'step_1',
        aggregation: null,
        measure: null,
      }),
    ],
    output: {
      kind: 'AGGREGATE',
      from_step: 'step_1',
      reason: null,
      slot: 'remaining_to_pay_total',
      text: null,
    },
  }

  // Before prune this failed as step_output_total_remaining_aggregation_required
  const parsed = parseTurnPlanWire(liveShaped)
  check(parsed.ok, 'RF1 prune: padded null-aggregation step ignored')
  if (!parsed.ok) throw new Error('rf1 parse')
  check(parsed.plan.steps.length === 1, 'RF1 only reachable aggregate kept')
  check(parsed.plan.steps[0]!.id === 'step_1', 'RF1 keeps authorizing step')

  const v = validateTurnPlan(parsed.plan)
  check(v.ok, 'RF1 validate after prune')
  const result = await executeTurnPlan({
    plan: parsed.plan,
    turnId: 'rf1-exact',
    todayKey: '2026-09-15',
    universeRows: UNIVERSE,
    weddings: weddings() as never,
  })
  check(result.completeness.ok, 'RF1 completeness')
  const obs = result.completeness.authorizingObservation
  check(obs?.kind === 'money_aggregate', 'RF1 money aggregate')
  if (obs?.kind === 'money_aggregate') {
    // W1+W2+W3+W5 in 2026: 9000+8000+10000+11000 = 38000
    check(obs.value === 38000, `RF1 sum=${obs.value}`)
    check(
      obs.measure === 'FIN.REMAINING_TO_PAY' ||
        obs.measure === 'remaining_amount',
      `RF1 measure=${obs.measure}`,
    )
  }
  check(result.executed.length === 1, 'RF1 single executed aggregate step')
  check(result.executed[0]?.ok === true, 'RF1 aggregate ok')
  check(
    (result.executed[0]?.toolArgs as { measure?: string } | undefined)
      ?.measure === 'FIN.REMAINING_TO_PAY',
    'RF1 executed FIN.REMAINING_TO_PAY',
  )
  check(
    v6CollectionStore.getActive()?.handle === handle,
    'RF1 active collection unchanged after aggregate',
  )
  console.log('  OK RF1 exact-sequence (prune + sum on inherited handle)')
}

// ---------------------------------------------------------------------------
// Aggregate input matrix: same-turn root / refine / cross-turn / restore / zero
// ---------------------------------------------------------------------------
{
  destroyV6CollectionSession()

  // A. same-turn root SEARCH → SUM
  {
    const { result } = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2026),
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 's1',
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(result.completeness.ok, 'A sum completeness')
    const obs = result.completeness.authorizingObservation
    check(obs?.kind === 'money_aggregate' && obs.value === 38000, 'A sum')
  }

  // A2. same-turn COUNT
  {
    const { result } = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2026),
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 's1',
          aggregation: 'count',
          measure: null,
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    const obs = result.completeness.authorizingObservation
    check(obs?.kind === 'count_result' && obs.value === 4, 'A2 count')
  }

  // B. same-turn refined collection → SUM (place refine stays offline-friendly)
  {
    const { result } = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2026),
        }),
        padNullStepFields({
          id: 't1',
          kind: 'TRANSFORM_COLLECTION',
          input_from_step: 's1',
          transform_ops: [
            {
              op: 'Filter',
              place: {
                field: 'place.name',
                op: 'contains',
                value: 'Villa',
                role: null,
              },
              temporal: null,
              sort: null,
              slice: null,
              exclude: null,
              concept_filter: null,
            },
          ],
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 't1',
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    const obs = result.completeness.authorizingObservation
    // W1 Villa rem 9000 + W3 Villa rem 10000 = 19000
    check(obs?.kind === 'money_aggregate' && obs.value === 19000, 'B refined sum')
  }

  // C. cross-turn: existing active handle
  {
    destroyV6CollectionSession()
    const seeded = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2026),
        }),
      ],
      output: {
        kind: 'COLLECTION',
        from_step: 's1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    const handle = seeded.result.executed[0]!.outputHandle!
    const { result } = await exec({
      steps: [
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_handle: handle,
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    const obs = result.completeness.authorizingObservation
    check(obs?.kind === 'money_aggregate' && obs.value === 38000, 'C cross-turn sum')
    check(v6CollectionStore.getActive()?.handle === handle, 'C active unchanged')
  }

  // D. restored historical collection → SUM
  {
    destroyV6CollectionSession()
    const seeded = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2026),
        }),
      ],
      output: {
        kind: 'COLLECTION',
        from_step: 's1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    const handle = seeded.result.executed[0]!.outputHandle!
    // Activate something else first
    await exec({
      steps: [
        padNullStepFields({
          id: 's2',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2027),
        }),
      ],
      output: {
        kind: 'COLLECTION',
        from_step: 's2',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(v6CollectionStore.getActive()?.handle !== handle, 'D switched active')
    const { result } = await exec({
      steps: [
        padNullStepFields({
          id: 'r1',
          kind: 'RESTORE_COLLECTION',
          input_handle: handle,
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 'r1',
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    const obs = result.completeness.authorizingObservation
    check(obs?.kind === 'money_aggregate' && obs.value === 38000, 'D restore sum')
    check(v6CollectionStore.getActive()?.handle === handle, 'D restored active')
  }

  // E. zero-result valid collection → count 0 / sum 0
  {
    destroyV6CollectionSession()
    const { result: countR } = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2035),
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 's1',
          aggregation: 'count',
          measure: null,
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(
      countR.completeness.authorizingObservation?.kind === 'count_result' &&
        countR.completeness.authorizingObservation.value === 0,
      'E zero count',
    )

    destroyV6CollectionSession()
    const { result: sumR } = await exec({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2035),
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 's1',
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(
      sumR.completeness.authorizingObservation?.kind === 'money_aggregate' &&
        sumR.completeness.authorizingObservation.value === 0,
      'E zero sum',
    )
  }

  console.log('  OK aggregate input matrix A–E')
}

// ---------------------------------------------------------------------------
// Follow-up after aggregate: rank same collection
// ---------------------------------------------------------------------------
{
  destroyV6CollectionSession()
  const seeded = await exec({
    steps: [
      padNullStepFields({
        id: 's1',
        kind: 'SEARCH_COLLECTION',
        search: searchYear(2026),
      }),
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 's1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  const handle = seeded.result.executed[0]!.outputHandle!
  await exec({
    steps: [
      padNullStepFields({
        id: 'a1',
        kind: 'AGGREGATE_COLLECTION',
        input_handle: handle,
        aggregation: 'sum',
        measure: 'FIN.REMAINING_TO_PAY',
      }),
    ],
    output: {
      kind: 'AGGREGATE',
      from_step: 'a1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  check(v6CollectionStore.getActive()?.handle === handle, 'post-agg active')

  const { result } = await exec({
    steps: [
      padNullStepFields({
        id: 't1',
        kind: 'TRANSFORM_COLLECTION',
        input_handle: handle,
        transform_ops: [
          {
            op: 'Sort',
            place: null,
            temporal: null,
            concept_filter: null,
            exclude: null,
            sort: { field: 'wedding.date', direction: 'desc' },
            slice: null,
          },
          {
            op: 'Slice',
            place: null,
            temporal: null,
            concept_filter: null,
            exclude: null,
            sort: null,
            slice: { limit: 1, offset: null },
          },
        ],
      }),
    ],
    output: {
      kind: 'COLLECTION',
      from_step: 't1',
      reason: null,
      slot: null,
      text: null,
    },
  })
  check(result.completeness.ok, 'follow-up rank completeness')
  const obs = result.completeness.authorizingObservation
  check(obs?.kind === 'collection_result', 'follow-up collection result')
  if (obs?.kind === 'collection_result') {
    check(obs.totalCount === 1, `follow-up top1 count=${obs.totalCount}`)
  }
  check(!!v6CollectionStore.get(handle), 'original collection identity retained')
  check(
    v6CollectionStore.getActive()?.handle !== undefined,
    'active collection still present after follow-up',
  )
  console.log('  OK follow-up-after-aggregate')
}

// ---------------------------------------------------------------------------
// Negative controls
// ---------------------------------------------------------------------------
{
  destroyV6CollectionSession()

  {
    const { result } = await exec({
      steps: [
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_handle: 'col_does_not_exist',
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(!result.completeness.ok, 'neg nonexistent handle fails closed')
  }

  {
    const parsed = parseTurnPlanWire({
      steps: [
        padNullStepFields({
          id: 's1',
          kind: 'SEARCH_COLLECTION',
          search: searchYear(2026),
        }),
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 's1',
          aggregation: 'sum',
          measure: 'FIN.REMAINING_TO_PAY',
        }),
        padNullStepFields({
          id: 'a2',
          kind: 'AGGREGATE_COLLECTION',
          input_from_step: 'a1',
          aggregation: 'count',
          measure: null,
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a2',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(parsed.ok, 'neg parse chain')
    if (!parsed.ok) throw new Error('x')
    const result = await executeTurnPlan({
      plan: parsed.plan,
      turnId: 'neg',
      todayKey: '2026-09-15',
      universeRows: UNIVERSE,
      weddings: weddings() as never,
    })
    // a2 input_from_step → aggregate step has no stepHandleById entry
    check(!result.completeness.ok, 'neg aggregate-from-aggregate unresolved')
  }

  {
    const parsed = parseTurnPlanWire({
      steps: [
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_handle: 'col_x',
          aggregation: 'sum',
          measure: 'NOT.A.CONCEPT',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    // measure not resolvable → sum_requires_measure at parse
    check(!parsed.ok, 'neg unsupported measure fail-closed at parse')
  }

  {
    const parsed = parseTurnPlanWire({
      steps: [
        padNullStepFields({
          id: 'a1',
          kind: 'AGGREGATE_COLLECTION',
          input_handle: 'col_x',
          aggregation: null,
          measure: 'FIN.REMAINING_TO_PAY',
        }),
      ],
      output: {
        kind: 'AGGREGATE',
        from_step: 'a1',
        reason: null,
        slot: null,
        text: null,
      },
    })
    check(!parsed.ok, 'neg malformed aggregation fail-closed')
    if (!parsed.ok) {
      check(
        parsed.detail.includes('aggregation_required'),
        'neg detail is machine token',
      )
    }
  }

  console.log('  OK negative controls')
}

// ---------------------------------------------------------------------------
// Sanitization regression
// ---------------------------------------------------------------------------
{
  const INTERNAL = [
    'step_output_total_remaining_aggregation_required',
    'step_step_2_aggregation_required',
    'step_output_missing',
    'input_handle_required',
    'aggregate_measure_invalid',
    'search.conceptFilters[0]:eq',
    'NOT_FAITHFUL: internal reason',
    'missing_or_failed_steps:a1',
    'aggregate_collection_unresolved',
  ]
  for (const raw of INTERNAL) {
    check(
      sanitizeUserFacingReason(raw) === null,
      `sanitize null for ${raw}`,
    )
  }

  function errorResult(message: string | null): V6ShadowTurnResult {
    return {
      turnId: 't',
      rounds: 1,
      response: {
        status: 'error',
        code: 'PLAN_VALIDATION_ERROR',
        message,
      },
      toolTrace: [],
      authority: decideV6Authority({}),
      errorCode: 'PLAN_VALIDATION_ERROR',
      verificationBlockReason:
        message ?? 'step_output_total_remaining_aggregation_required',
    }
  }

  for (const raw of INTERNAL) {
    const rendered = renderV6TurnResult(errorResult(raw))
    check(rendered.kind === 'error', `render kind ${raw}`)
    check(
      rendered.kind === 'error' &&
        rendered.message === ASSISTANT_API_FAILURE &&
        !rendered.message.includes(raw) &&
        !/step_|aggregation_required|NOT_FAITHFUL|conceptFilters/i.test(
          rendered.message,
        ),
      `no leak for ${raw}`,
    )
  }

  // Developer diagnostic path retains exact token
  const diag = errorResult(null)
  check(
    diag.verificationBlockReason ===
      'step_output_total_remaining_aggregation_required',
    'developer diagnostic retains exact token',
  )

  const product = sanitizeUserFacingReason(
    'Nie udało mi się teraz odpowiedzieć na to pytanie.',
  )
  check(
    product === 'Nie udało mi się teraz odpowiedzieć na to pytanie.',
    'product Polish preserved',
  )

  console.log('  OK sanitization regression')
}

// Canonical finance authority marker
{
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(
      new URL('../tools/aggregateCollection.ts', import.meta.url),
      'utf8',
    ),
  )
  check(src.includes('getRemainingToPay'), 'FIN uses getRemainingToPay')
  check(!/contractValue\s*-/.test(src), 'no inline CV-paid arithmetic')
  console.log('  OK FIN.REMAINING_TO_PAY authority')
}

console.log('v6Rf1AggregateInheritedAcceptance PASS')
