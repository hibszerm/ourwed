/**
 * G8 benchmark runner — fixture (default) or injected live interpret.
 * Never mutates Assistant state. Never becomes visible authority.
 */

import { emptyDomainQuery, type DomainQuery } from '../domainQuery/domainQuery'
import { bindGoalSpec, makeGoalBinderContext } from './bindGoalSpec'
import { compileBoundGoalToDomainQuery } from './compileBoundGoalToDomainQuery'
import {
  scoreGoalSpecAgainstExpected,
  normalizeDomainQuerySemantics,
  type GoalSpecDimScore,
} from './compareGoalSpecSemantics'
import {
  G8_GOALSPEC_BENCHMARK_CORPUS,
  type G8BenchmarkCase,
} from './g8BenchmarkCorpus'
import { interpretGoalSpec } from './interpretGoalSpec'
import type { GoalSpec } from './goalSpec'

export type G8CaseResult = {
  id: string
  category: string
  utterance: string
  status: 'success' | 'schema_error' | 'provider_error' | 'unsupported' | 'semantic_mismatch'
  score: GoalSpecDimScore | null
  providerError: boolean
  goalSpec: GoalSpec | null
  boundGoalAgree: boolean | null
  failDims: string[]
}

function dateBindingFromTemporal(
  temporal: string | null | undefined,
): DomainQuery['dateBinding'] {
  if (!temporal) return null
  const t = temporal.toLowerCase()
  const year = t.match(/\b(20\d{2})\b/)
  if (year) {
    const y = year[1]
    return {
      dimension: 'wedding.date',
      range: { from: `${y}-01-01`, to: `${y}-12-31` },
    }
  }
  if (t.includes('sierp')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2026-08-01', to: '2026-08-31' },
    }
  }
  if (t.includes('wrześ') || t.includes('wrzes')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2026-09-01', to: '2026-09-30' },
    }
  }
  if (t.includes('czerw')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2026-06-01', to: '2026-06-30' },
    }
  }
  if (t.includes('lip')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2026-07-01', to: '2026-07-31' },
    }
  }
  if (t.includes('przyszł') || t.includes('przyszl')) {
    return {
      dimension: 'wedding.date',
      range: { from: '2027-01-01', to: '2027-12-31' },
    }
  }
  return null
}

function activeQueryForCase(c: G8BenchmarkCase): DomainQuery | null {
  if (!c.expect.executable || !c.expect.inheritActiveCollection) return null
  const place = c.semanticContext?.previousGoalSummary?.placeName
  const temporal = c.semanticContext?.previousGoalSummary?.temporalExpression
  const relations =
    place
      ? [
          {
            relation: 'place' as const,
            field: 'place.name' as const,
            op: 'contains' as const,
            value: place,
          },
        ]
      : []
  return emptyDomainQuery({
    aggregate: 'count',
    relations,
    dateBinding: dateBindingFromTemporal(temporal),
  })
}

export async function runG8GoalSpecBenchmark(options?: {
  cases?: G8BenchmarkCase[]
  mode?: 'fixture' | 'live'
  interpretLive?: (c: G8BenchmarkCase) => Promise<{
    ok: boolean
    goalSpec?: GoalSpec
    error?: string
    /** Harness: distinguish provider vs schema parse failures. */
    errorKind?: 'provider' | 'schema'
  }>
}): Promise<{
  results: G8CaseResult[]
  metrics: {
    n: number
    schemaValidPct: number
    providerErrorPct: number
    requestKindPct: number
    aggregationPct: number
    measurePct: number
    sourcePct: number
    temporalPct: number
    relationPct: number
    ambiguityPct: number
    correctionPct: number
    ellipsisPct: number
    boundGoalAgreePct: number | null
    domainQueryAgreePct: number | null
    failedCount: number
  }
  report: string
}> {
  const cases = options?.cases ?? G8_GOALSPEC_BENCHMARK_CORPUS
  const results: G8CaseResult[] = []

  for (const c of cases) {
    let goal: GoalSpec | null
    let status: G8CaseResult['status'] = 'success'

    if (options?.mode === 'live' && options.interpretLive) {
      const live = await options.interpretLive(c)
      if (!live.ok || !live.goalSpec) {
        const failStatus =
          live.errorKind === 'schema' ? 'schema_error' : 'provider_error'
        results.push({
          id: c.id,
          category: c.category,
          utterance: c.utterance,
          status: failStatus,
          score: null,
          providerError: failStatus === 'provider_error',
          goalSpec: null,
          boundGoalAgree: null,
          failDims: [],
        })
        continue
      }
      goal = live.goalSpec
    } else {
      const interpreted = await interpretGoalSpec({
        userText: c.utterance,
        semanticContext: c.semanticContext ?? null,
        fixturePayload: c.fixtureFlat,
        todayLocalDateKey: '2026-09-13',
      })
      if (!interpreted.ok) {
        const failStatus =
          interpreted.code === 'schema_error' ? 'schema_error' : 'provider_error'
        results.push({
          id: c.id,
          category: c.category,
          utterance: c.utterance,
          status: failStatus,
          score: null,
          providerError: failStatus === 'provider_error',
          goalSpec: null,
          boundGoalAgree: null,
          failDims: [],
        })
        continue
      }
      goal = interpreted.goalSpec
    }

    const score = scoreGoalSpecAgainstExpected(goal, c.expect as Parameters<
      typeof scoreGoalSpecAgainstExpected
    >[1])

    let boundGoalAgree: boolean | null = null
    if (c.expect.executable) {
      const ctxQ = activeQueryForCase(c)
      const bound = bindGoalSpec(
        goal,
        makeGoalBinderContext({ activeCollectionQuery: ctxQ }),
      )
      if (bound.status === 'bound') {
        boundGoalAgree = true
        const compiled = compileBoundGoalToDomainQuery(bound.goal)
        score.domainQueryAgree = compiled.status === 'success'
        // Soft structural check: place inherited when delta omitted place
        if (
          compiled.status === 'success' &&
          c.expect.inheritActiveCollection &&
          c.semanticContext?.previousGoalSummary?.placeName &&
          c.expect.placeName == null
        ) {
          const n = normalizeDomainQuerySemantics(compiled.query)
          const expectedPlace =
            c.semanticContext.previousGoalSummary.placeName
          score.domainQueryAgree =
            n.placeName === expectedPlace ||
            (typeof n.placeName === 'string' &&
              (n.placeName.includes(expectedPlace) ||
                expectedPlace.includes(n.placeName)))
        }
        // Aggregation / measure when explicitly expected
        if (compiled.status === 'success' && score.domainQueryAgree) {
          const n = normalizeDomainQuerySemantics(compiled.query)
          if (c.expect.aggregation != null) {
            score.domainQueryAgree =
              n.aggregate === c.expect.aggregation ||
              (c.expect.aggregation === 'list' && n.aggregate === null)
          }
          if (score.domainQueryAgree && c.expect.measure !== undefined) {
            score.domainQueryAgree = n.measure === c.expect.measure
          }
        }
      } else if (bound.status === 'needs_clarification') {
        boundGoalAgree = false
        score.domainQueryAgree = false
      } else {
        boundGoalAgree = false
        score.domainQueryAgree = false
      }
    }

    const dimEntries: Array<[string, boolean]> = [
      ['requestKind', score.requestKind],
      ['aggregation', score.aggregation],
      ['measure', score.measure],
      ['source', score.source],
      ['temporal', score.temporal],
      ['relation', score.relation],
      ['ambiguity', score.ambiguity],
      ['correction', score.correction],
      ['ellipsis', score.ellipsis],
    ]
    const failDims = dimEntries.filter(([, ok]) => !ok).map(([k]) => k)
    if (failDims.length > 0) status = 'semantic_mismatch'
    if (score.domainQueryAgree === false) {
      failDims.push('domainQuery')
      if (status === 'success') status = 'semantic_mismatch'
    }

    results.push({
      id: c.id,
      category: c.category,
      utterance: c.utterance,
      status,
      score,
      providerError: false,
      goalSpec: goal,
      boundGoalAgree,
      failDims,
    })
  }

  const scored = results.filter((r) => r.score)
  const pct = (pred: (s: GoalSpecDimScore) => boolean) =>
    scored.length === 0
      ? 0
      : (100 * scored.filter((r) => pred(r.score!)).length) / scored.length

  const dqScored = scored.filter((r) => r.score!.domainQueryAgree !== null)
  const bgScored = results.filter((r) => r.boundGoalAgree !== null)
  const metrics = {
    n: results.length,
    schemaValidPct: pct((s) => s.schemaValid),
    providerErrorPct:
      results.length === 0
        ? 0
        : (100 * results.filter((r) => r.providerError).length) / results.length,
    requestKindPct: pct((s) => s.requestKind),
    aggregationPct: pct((s) => s.aggregation),
    measurePct: pct((s) => s.measure),
    sourcePct: pct((s) => s.source),
    temporalPct: pct((s) => s.temporal),
    relationPct: pct((s) => s.relation),
    ambiguityPct: pct((s) => s.ambiguity),
    correctionPct: pct((s) => s.correction),
    ellipsisPct: pct((s) => s.ellipsis),
    boundGoalAgreePct:
      bgScored.length === 0
        ? null
        : (100 * bgScored.filter((r) => r.boundGoalAgree === true).length) /
          bgScored.length,
    domainQueryAgreePct:
      dqScored.length === 0
        ? null
        : (100 *
            dqScored.filter((r) => r.score!.domainQueryAgree === true).length) /
          dqScored.length,
    failedCount: results.filter((r) => r.status !== 'success').length,
  }

  const report = [
    `G8 GoalSpec benchmark n=${metrics.n}`,
    `schema=${metrics.schemaValidPct.toFixed(1)}% provider_err=${metrics.providerErrorPct.toFixed(1)}%`,
    `requestKind=${metrics.requestKindPct.toFixed(1)}% aggregation=${metrics.aggregationPct.toFixed(1)}% measure=${metrics.measurePct.toFixed(1)}%`,
    `source=${metrics.sourcePct.toFixed(1)}% temporal=${metrics.temporalPct.toFixed(1)}% relation=${metrics.relationPct.toFixed(1)}%`,
    `ambiguity=${metrics.ambiguityPct.toFixed(1)}% correction=${metrics.correctionPct.toFixed(1)}% ellipsis=${metrics.ellipsisPct.toFixed(1)}%`,
    `boundGoalAgree=${metrics.boundGoalAgreePct == null ? 'n/a' : metrics.boundGoalAgreePct.toFixed(1) + '%'} domainQueryAgree=${metrics.domainQueryAgreePct == null ? 'n/a' : metrics.domainQueryAgreePct.toFixed(1) + '%'}`,
    `failed=${metrics.failedCount}`,
  ].join('\n')

  return { results, metrics, report }
}
