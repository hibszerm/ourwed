/**
 * Extended Phase 2.6 aggregate metrics (relational + end-state + usage).
 */

import type { MatchResult } from '../expect'
import type { AggregateMetrics, CaseScore } from './metrics'
import { aggregateCaseScores } from './metrics'

export type Phase26CaseScore = CaseScore & {
  corpusSplit?: 'development' | 'holdout' | 'multiturn' | 'repeatability'
  correctionCategory?:
    | 'participant'
    | 'metric'
    | 'temporal'
    | 'subject'
    | 'resource'
    | 'rank'
    | 'other'
    | 'negative'
  relationOk?: boolean
  patchOk?: boolean
  endStateOk?: boolean
  functionalEquivalent?: boolean
  resourceOk?: boolean
  qualifierOk?: boolean
  inputTokens?: number | null
  outputTokens?: number | null
  model?: string
  actualOp?: string
  expectedOp?: string
  diffs?: MatchResult['diffs']
}

export type Phase26Aggregate = AggregateMetrics & {
  correctionPatchAccuracy: number
  correctedEndStateAccuracy: number
  functionalEquivalenceRate: number
  resourceReferenceAccuracy: number
  qualifierAccuracy: number
  medianInterpreterLatency: number
  avgInputTokens: number | null
  avgOutputTokens: number | null
  byCorrectionCategory: Record<
    string,
    { n: number; detection: number; patch: number; endState: number }
  >
}

function rate(ok: number, n: number): number {
  if (n <= 0) return 1
  return ok / n
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? 0
}

export function aggregatePhase26(scores: Phase26CaseScore[]): Phase26Aggregate {
  const base = aggregateCaseScores(scores)
  let patchOk = 0
  let patchN = 0
  let endOk = 0
  let endN = 0
  let funcN = 0
  let funcOk = 0
  let resourceOk = 0
  let resourceN = 0
  let qualOk = 0
  let qualN = 0
  let inTok = 0
  let outTok = 0
  let tokN = 0
  const byCat: Record<
    string,
    { n: number; detOk: number; patchOk: number; endOk: number }
  > = {}

  for (const s of scores) {
    if (s.resourceOk != null) {
      resourceN += 1
      if (s.resourceOk) resourceOk += 1
    }
    if (s.qualifierOk != null) {
      qualN += 1
      if (s.qualifierOk) qualOk += 1
    }
    if (s.inputTokens != null || s.outputTokens != null) {
      tokN += 1
      inTok += s.inputTokens ?? 0
      outTok += s.outputTokens ?? 0
    }

    if (s.expectedCorrection) {
      patchN += 1
      if (s.patchOk) patchOk += 1
      endN += 1
      if (s.endStateOk) endOk += 1
      if (s.functionalEquivalent) {
        funcN += 1
        funcOk += 1
      } else if (s.endStateOk && !s.relationOk) {
        funcN += 1
      }

      const cat = s.correctionCategory ?? 'other'
      if (!byCat[cat]) byCat[cat] = { n: 0, detOk: 0, patchOk: 0, endOk: 0 }
      byCat[cat]!.n += 1
      if (s.actualCorrection) byCat[cat]!.detOk += 1
      if (s.patchOk) byCat[cat]!.patchOk += 1
      if (s.endStateOk) byCat[cat]!.endOk += 1
    }
  }

  const byCorrectionCategory: Phase26Aggregate['byCorrectionCategory'] = {}
  for (const [k, v] of Object.entries(byCat)) {
    byCorrectionCategory[k] = {
      n: v.n,
      detection: rate(v.detOk, v.n),
      patch: rate(v.patchOk, v.n),
      endState: rate(v.endOk, v.n),
    }
  }

  return {
    ...base,
    correctionPatchAccuracy: rate(patchOk, patchN),
    correctedEndStateAccuracy: rate(endOk, endN),
    functionalEquivalenceRate: rate(funcOk, Math.max(funcN, 1)),
    resourceReferenceAccuracy: rate(resourceOk, resourceN || 1),
    qualifierAccuracy: rate(qualOk, qualN || 1),
    medianInterpreterLatency: median(scores.map((s) => s.latencyMs)),
    avgInputTokens: tokN ? inTok / tokN : null,
    avgOutputTokens: tokN ? outTok / tokN : null,
    byCorrectionCategory,
  }
}

export function formatPhase26(m: Phase26Aggregate): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  return [
    `total=${m.total}`,
    `exact=${pct(m.taskSpecExactMatchRate)}`,
    `op=${pct(m.operationAccuracy)}`,
    `subject=${pct(m.subjectAccuracy)}`,
    `resource=${pct(m.resourceReferenceAccuracy)}`,
    `participant=${pct(m.participantReferenceAccuracy)}`,
    `temporal=${pct(m.temporalSemanticAccuracy)}`,
    `qualifier=${pct(m.qualifierAccuracy)}`,
    `correctionDet=${pct(m.correctionDetectionAccuracy)}`,
    `corrP=${pct(m.correctionPrecision)}`,
    `corrR=${pct(m.correctionRecall)}`,
    `corrF1=${pct(m.correctionF1)}`,
    `corrPatch=${pct(m.correctionPatchAccuracy)}`,
    `corrEndState=${pct(m.correctedEndStateAccuracy)}`,
    `ellipsis=${pct(m.ellipsisDetectionAccuracy)}`,
    `sequence=${pct(m.sequenceIntentAccuracy)}`,
    `override=${pct(m.explicitCurrentTurnOverrideAccuracy)}`,
    `unsupported=${pct(m.unsupportedClassificationAccuracy)}`,
    `schema=${pct(m.schemaValidationSuccessRate)}`,
    `errors=${pct(m.shadowInterpreterErrorRate)}`,
    `avgLatencyMs=${m.averageInterpreterLatency.toFixed(0)}`,
    `medianLatencyMs=${m.medianInterpreterLatency.toFixed(0)}`,
    `p95LatencyMs=${m.p95InterpreterLatency.toFixed(0)}`,
    `avgInTok=${m.avgInputTokens?.toFixed(0) ?? 'n/a'}`,
    `avgOutTok=${m.avgOutputTokens?.toFixed(0) ?? 'n/a'}`,
  ].join('\n')
}
