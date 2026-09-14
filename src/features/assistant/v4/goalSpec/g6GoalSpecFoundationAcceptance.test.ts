/**
 * G6 — GoalSpec semantic boundary foundation acceptance.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/g6GoalSpecFoundationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveAggregateDateRange } from '../../dates'
import { makeTaskSpec } from '../expect'
import { resolveTaskSpec } from '../resolver/resolve'
import {
  emptyV4ShadowContext,
  type ResolvedTask,
  type V4ShadowContext,
} from '../resolver/types'
import { compileResolvedSemanticsToDomainQuery } from '../domainQuery/compileResolvedSemantics'
import { emptyGoalSpec, type GoalSpec } from './goalSpec'
import { adaptResolvedTaskToGoalSpec } from './adaptResolvedTaskToGoalSpec'
import { compileGoalSpecToDomainQuery } from './compileGoalSpecToDomainQuery'
import { compareResolvedTaskViaGoalSpec } from './compareGoalSpecDomainQuery'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const TODAY = '2026-09-13'
const AUGUST = resolveAggregateDateRange('sierpień', TODAY)!
const YEAR_2027 = { from: '2027-01-01', to: '2027-12-31' }

function mustResolved(result: ReturnType<typeof resolveTaskSpec>): ResolvedTask {
  assert(result.status === 'resolved', `resolved got ${result.status}`)
  return result as ResolvedTask
}

function ctxWithFilters(
  filters: NonNullable<V4ShadowContext['activeCollection']>['filters'],
): V4ShadowContext {
  return {
    ...emptyV4ShadowContext(),
    activeCollection: {
      resource: 'weddings',
      filters,
      resultCount: 0,
    },
  }
}

console.log('G6 GoalSpec foundation acceptance')

// --- Gate: no NL heuristics in GoalSpec modules ---
{
  for (const file of [
    'goalSpec.ts',
    'adaptResolvedTaskToGoalSpec.ts',
    'compileGoalSpecToDomainQuery.ts',
    'compareGoalSpecDomainQuery.ts',
  ]) {
    const src = readFileSync(
      resolve(process.cwd(), `src/features/assistant/v4/goalSpec/${file}`),
      'utf8',
    )
    assert(!/new RegExp|\.match\(\//.test(src), `${file}: no regex`)
    assert(!/przyszł|Villa Love|Premium|ile mam/.test(src), `${file}: no phrases`)
  }
  const taskSpecSrc = readFileSync(
    resolve(process.cwd(), 'src/features/assistant/v4/taskSpec.ts'),
    'utf8',
  )
  // TaskSpec must not have been expanded with GoalSpec-specific ops
  assert(!taskSpecSrc.includes('GoalSpec'), 'TaskSpec not coupled to GoalSpec')
  assert(!taskSpecSrc.includes('goal_plan'), 'TaskSpec not expanded with goal_plan')
  assert(!taskSpecSrc.includes('product_help'), 'TaskSpec not expanded with product_help')
}

// ========== Equivalence: ResolvedTask → GoalSpec → DomainQuery ≈ G3 ==========
{
  const cases: Array<{ name: string; resolved: ResolvedTask }> = []

  cases.push({
    name: 'count august',
    resolved: mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'count',
          subject: 'wedding',
          temporal: { phrase: 'sierpień', kind: 'range' },
        }),
        emptyV4ShadowContext(),
      ),
    ),
  })

  cases.push({
    name: 'sum remaining inherit august',
    resolved: mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'sum',
          subject: 'remaining',
          resource: { kind: 'active_collection' },
          fieldSource: {
            op: 'explicit',
            subject: 'explicit',
            resource: 'inherit',
            participant: 'omitted',
            temporal: 'omitted',
          },
        }),
        ctxWithFilters({ dateRange: { from: AUGUST.from, to: AUGUST.to } }),
      ),
    ),
  })

  cases.push({
    name: 'list villa love',
    resolved: mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'list',
          subject: 'wedding',
          qualifiers: {
            aspect: null,
            rank: null,
            destination: null,
            titleHint: 'Villa Love',
            unsupportedReason: null,
          },
        }),
        emptyV4ShadowContext(),
      ),
    ),
  })

  cases.push({
    name: 'sum paid venue+year',
    resolved: mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'sum',
          subject: 'paid',
          temporal: { phrase: '2027', kind: 'range' },
          qualifiers: {
            aspect: null,
            rank: null,
            destination: null,
            titleHint: 'Hotel Stary',
            unsupportedReason: null,
          },
        }),
        emptyV4ShadowContext(),
      ),
    ),
  })

  cases.push({
    name: 'count with venue role reception',
    resolved: mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'count',
          subject: 'wedding',
          qualifiers: {
            aspect: null,
            rank: null,
            destination: 'reception',
            titleHint: 'Villa Love',
            unsupportedReason: null,
          },
        }),
        emptyV4ShadowContext(),
      ),
    ),
  })

  for (const c of cases) {
    const cmp = compareResolvedTaskViaGoalSpec(c.resolved)
    assert(cmp.agree, `equiv ${c.name}: ${cmp.reasons.join(',')}`)
    const goal = adaptResolvedTaskToGoalSpec(c.resolved)
    assert(goal.version === 1, `${c.name} version`)
    assert(goal.requestKind === 'domain_query', `${c.name} kind`)
    // Adapter does not invent NL
    assert(
      !goal.relations.some(
        (r) => typeof r.value === 'string' && /ile |które /.test(r.value),
      ),
      `${c.name} no utterance dump`,
    )
  }

  // Rank remains honestly unsupported on both paths
  const rank = mustResolved(
    resolveTaskSpec(
      makeTaskSpec({
        op: 'rank',
        subject: 'contract_value',
        qualifiers: {
          aspect: null,
          rank: 'max',
          destination: null,
          titleHint: null,
          unsupportedReason: null,
        },
      }),
      emptyV4ShadowContext(),
    ),
  )
  const rankCmp = compareResolvedTaskViaGoalSpec(rank)
  assert(rankCmp.agree, `rank both unsupported: ${rankCmp.reasons.join(',')}`)
  console.log('  equivalence ok')
}

// ========== Representability A–J (hand-authored GoalSpec — no NL parse) ==========
{
  function checkRepresentable(name: string, goal: GoalSpec, expect: {
    kind: GoalSpec['requestKind']
    hasAmbiguity?: boolean
    ambiguitySlot?: string
  }) {
    assert(goal.version === 1, `${name} version`)
    assert(goal.requestKind === expect.kind, `${name} kind=${goal.requestKind}`)
    if (expect.hasAmbiguity) {
      assert(goal.ambiguities.length > 0, `${name} has ambiguity`)
      if (expect.ambiguitySlot) {
        assert(
          goal.ambiguities.some((a) => a.slot === expect.ambiguitySlot),
          `${name} slot ${expect.ambiguitySlot}`,
        )
      }
    }
  }

  // A — count weddings next year with package Premium AND extra VHS
  const A = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    temporal: {
      expression: 'w przyszłym roku',
      resolvedRange: YEAR_2027,
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
    relations: [
      {
        relation: 'package',
        field: 'package.name',
        op: 'contains',
        value: { text: 'Premium', kindHint: 'package' },
      },
      {
        relation: 'extra',
        field: 'extra.name',
        op: 'contains',
        value: { text: 'VHS', kindHint: 'extra' },
      },
    ],
  })
  checkRepresentable('A', A, { kind: 'domain_query' })
  assert(A.relations.length === 2, 'A compositional package+extra')
  assert(
    compileGoalSpecToDomainQuery(A).status === 'unsupported',
    'A not executable yet (honest)',
  )

  // B — venues with highest average contract value
  const B = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'avg',
    measure: 'wedding.contract_value',
    groupBy: ['place.name'],
    orderBy: [{ field: 'wedding.contract_value', direction: 'desc' }],
    aspects: ['place.name'],
  })
  checkRepresentable('B', B, { kind: 'domain_query' })
  assert(B.groupBy[0] === 'place.name', 'B groupBy place')
  assert(B.aggregation === 'avg', 'B avg')

  // C — remaining to pay for August weddings
  const C = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: 'wedding.remaining_amount',
    temporal: {
      expression: 'sierpień',
      resolvedRange: { from: AUGUST.from, to: AUGUST.to },
      dateDimension: 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  })
  checkRepresentable('C', C, { kind: 'domain_query' })
  const cExec = compileGoalSpecToDomainQuery(C)
  assert(cExec.status === 'success', 'C compiles in current slice')
  const cDirect = compileResolvedSemanticsToDomainQuery(
    mustResolved(
      resolveTaskSpec(
        makeTaskSpec({
          op: 'sum',
          subject: 'remaining',
          temporal: { phrase: 'sierpień', kind: 'range' },
        }),
        emptyV4ShadowContext(),
      ),
    ),
  )
  assert(
    cDirect.status === 'success' &&
      cExec.status === 'success' &&
      cDirect.query.measure === cExec.query.measure &&
      cDirect.query.dateBinding?.range.from === cExec.query.dateBinding?.range.from,
    'C matches G3 semantics',
  )

  // D — signed contract but unpaid deposit
  const D = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
    relations: [
      {
        relation: 'contract',
        field: 'contract.status',
        op: 'eq',
        value: 'signed',
      },
      {
        relation: 'payment',
        field: 'payment.deposit_status',
        op: 'eq',
        value: 'unpaid',
      },
    ],
  })
  checkRepresentable('D', D, { kind: 'domain_query' })
  assert(D.relations.length === 2, 'D contract+payment compositional')

  // E — ceremony after 16:00
  const E = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'list',
    relations: [
      {
        relation: 'place',
        field: 'place.role',
        op: 'eq',
        value: 'ceremony',
      },
    ],
    aspects: ['ceremony.time'],
    // time constraint as compositional aspect+relation extension point
    // (field reserved for future registry — not a special intent)
  })
  // Represent time threshold via relation on a future field id without new root
  E.relations.push({
    relation: 'unknown',
    field: 'ceremony.time',
    op: 'gt',
    value: '16:00',
  })
  checkRepresentable('E', E, { kind: 'domain_query' })
  assert(
    E.relations.some((r) => r.field === 'ceremony.time' && r.op === 'gt'),
    'E time constraint compositional',
  )

  // F — most frequently sold package
  const F = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'package',
    aggregation: 'rank',
    groupBy: ['package.name'],
    orderBy: [{ field: 'package.sale_count', direction: 'desc' }],
    aspects: ['package.name'],
  })
  checkRepresentable('F', F, { kind: 'domain_query' })
  assert(F.source === 'package', 'F package source')
  assert(F.aggregation === 'rank', 'F rank')

  // G — earnings next week → ambiguous measure + date dimension
  const G = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'sum',
    measure: null,
    temporal: {
      expression: 'w przyszłym tygodniu',
      resolvedRange: null,
      dateDimension: null,
      dateDimensionAmbiguous: true,
    },
    ambiguities: [
      { slot: 'measure', reason: 'earnings_measure_unspecified' },
      { slot: 'date_dimension', reason: 'week_binds_multiple_date_fields' },
    ],
  })
  checkRepresentable('G', G, {
    kind: 'domain_query',
    hasAmbiguity: true,
    ambiguitySlot: 'measure',
  })
  assert(G.temporal?.dateDimensionAmbiguous === true, 'G date dim ambiguous')
  assert(
    compileGoalSpecToDomainQuery(G).status === 'needs_clarification',
    'G no guess compile',
  )

  // H — route feasibility between two weddings → goal_plan
  const H = emptyGoalSpec({
    requestKind: 'goal_plan',
    source: null,
    topicKey: 'travel_between_weddings',
    targets: [
      { kind: 'named', ref: { text: 'wedding_a', kindHint: 'wedding' } },
      { kind: 'named', ref: { text: 'wedding_b', kindHint: 'wedding' } },
    ],
    aspects: ['return_home_between', 'feasibility'],
  })
  checkRepresentable('H', H, { kind: 'goal_plan' })
  assert(H.topicKey === 'travel_between_weddings', 'H topic')
  assert(
    compileGoalSpecToDomainQuery(H).status === 'unsupported',
    'H not DomainQuery',
  )

  // I — how to change payment due date → product_help
  const I = emptyGoalSpec({
    requestKind: 'product_help',
    topicKey: 'change_payment_due_date',
    aspects: ['payment.due_date', 'settings'],
  })
  checkRepresentable('I', I, { kind: 'product_help' })

  // J — prepare create task call them tomorrow → prepare_action
  const J = emptyGoalSpec({
    requestKind: 'prepare_action',
    topicKey: 'create_task',
    temporal: {
      expression: 'jutro',
      resolvedRange: null,
      dateDimension: null,
      dateDimensionAmbiguous: true,
    },
    targets: [{ kind: 'named', ref: { text: 'them', kindHint: 'participant' } }],
    aspects: ['call'],
  })
  checkRepresentable('J', J, { kind: 'prepare_action' })
  assert(J.requestKind === 'prepare_action', 'J prepare_action')

  console.log('  representability A–J ok')
}

// Ambiguity package vs extra
{
  const amb = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
    relations: [
      {
        relation: 'unknown',
        field: null,
        op: 'contains',
        value: { text: 'Premium', kindHint: 'unknown' },
        ambiguousKinds: ['package', 'extra'],
      },
    ],
    ambiguities: [
      {
        slot: 'entity_kind',
        reason: 'premium_matches_package_and_extra',
        candidates: [
          { id: 'package', label: 'package' },
          { id: 'extra', label: 'extra' },
        ],
      },
    ],
  })
  assert(amb.ambiguities[0]?.slot === 'entity_kind', 'entity kind ambiguity')
  assert(
    amb.relations[0]?.ambiguousKinds?.includes('package'),
    'ambiguousKinds on relation',
  )
}

console.log('G6 GoalSpec foundation acceptance: PASS')
