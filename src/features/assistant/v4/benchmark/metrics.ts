/**
 * Benchmark metrics aggregation for V4 TaskSpec interpretation.
 */

import type { MatchResult } from '../expect'

export type CaseScore = {
  id: string
  category: string
  ok: boolean
  latencyMs: number
  schemaOk: boolean
  match: MatchResult | null
  error?: string
  /** For precision/recall */
  expectedCorrection?: boolean
  actualCorrection?: boolean
}

export type AggregateMetrics = {
  total: number
  taskSpecExactMatchRate: number
  operationAccuracy: number
  subjectAccuracy: number
  participantReferenceAccuracy: number
  temporalSemanticAccuracy: number
  correctionDetectionAccuracy: number
  correctionPrecision: number
  correctionRecall: number
  correctionF1: number
  ellipsisDetectionAccuracy: number
  sequenceIntentAccuracy: number
  explicitCurrentTurnOverrideAccuracy: number
  unsupportedClassificationAccuracy: number
  schemaValidationSuccessRate: number
  shadowInterpreterErrorRate: number
  averageInterpreterLatency: number
  p95InterpreterLatency: number
}

function rate(ok: number, n: number): number {
  if (n <= 0) return 1
  return ok / n
}

function p95(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[Math.max(0, idx)] ?? 0
}

export function aggregateCaseScores(scores: CaseScore[]): AggregateMetrics {
  const total = scores.length
  let exact = 0
  let opOk = 0
  let opN = 0
  let subOk = 0
  let subN = 0
  let partOk = 0
  let partN = 0
  let tmpOk = 0
  let tmpN = 0
  let corrOk = 0
  let corrN = 0
  let corrTp = 0
  let corrFp = 0
  let corrFn = 0
  let ellOk = 0
  let ellN = 0
  let seqOk = 0
  let seqN = 0
  let ovOk = 0
  let ovN = 0
  let unOk = 0
  let unN = 0
  let schemaOk = 0
  let errors = 0
  const latencies: number[] = []

  for (const s of scores) {
    latencies.push(s.latencyMs)
    if (s.schemaOk) schemaOk += 1
    if (s.error) errors += 1
    if (s.ok) exact += 1

    if (s.expectedCorrection != null && s.actualCorrection != null) {
      if (s.expectedCorrection && s.actualCorrection) corrTp += 1
      if (!s.expectedCorrection && s.actualCorrection) corrFp += 1
      if (s.expectedCorrection && !s.actualCorrection) corrFn += 1
    }

    const m = s.match
    if (!m) continue

    opN += 1
    if (m.scores.operation) opOk += 1
    subN += 1
    if (m.scores.subject) subOk += 1
    partN += 1
    if (m.scores.participant) partOk += 1
    tmpN += 1
    if (m.scores.temporal) tmpOk += 1

    if (
      s.category === 'corrections' ||
      s.id.includes('corr') ||
      s.id.startsWith('c25-') ||
      s.id.includes('correction')
    ) {
      corrN += 1
      if (m.scores.correction || s.actualCorrection) corrOk += 1
    }
    if (s.category === 'ellipsis' || s.id.startsWith('el-')) {
      ellN += 1
      if (m.scores.ellipsis || m.scores.operation) ellOk += 1
    }
    if (
      s.category === 'sequence' ||
      s.id.includes('potem') ||
      s.id.includes('dalej') ||
      s.id.includes('nastep')
    ) {
      seqN += 1
      if (m.scores.sequence) seqOk += 1
    }
    if (
      s.category === 'explicit_override' ||
      s.id.startsWith('ov-') ||
      s.id.includes('override') ||
      s.id.startsWith('n25-')
    ) {
      ovN += 1
      if (m.scores.operation && (m.scores.subject || s.id.startsWith('n25-'))) {
        ovOk += 1
      }
    }
    if (s.category === 'unsupported' || s.id.includes('unsup')) {
      unN += 1
      if (m.scores.operation) unOk += 1
    }
  }

  const precision = rate(corrTp, corrTp + corrFp)
  const recall = rate(corrTp, corrTp + corrFn)
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  const avg =
    latencies.length === 0
      ? 0
      : latencies.reduce((a, b) => a + b, 0) / latencies.length

  return {
    total,
    taskSpecExactMatchRate: rate(exact, total),
    operationAccuracy: rate(opOk, opN),
    subjectAccuracy: rate(subOk, subN),
    participantReferenceAccuracy: rate(partOk, partN),
    temporalSemanticAccuracy: rate(tmpOk, tmpN),
    correctionDetectionAccuracy: rate(corrOk, corrN || 1),
    correctionPrecision: precision,
    correctionRecall: recall,
    correctionF1: f1,
    ellipsisDetectionAccuracy: rate(ellOk, ellN || 1),
    sequenceIntentAccuracy: rate(seqOk, seqN || 1),
    explicitCurrentTurnOverrideAccuracy: rate(ovOk, ovN || 1),
    unsupportedClassificationAccuracy: rate(unOk, unN || 1),
    schemaValidationSuccessRate: rate(schemaOk, total),
    shadowInterpreterErrorRate: rate(errors, total),
    averageInterpreterLatency: avg,
    p95InterpreterLatency: p95(latencies),
  }
}

export function formatMetrics(m: AggregateMetrics): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  return [
    `total=${m.total}`,
    `exact=${pct(m.taskSpecExactMatchRate)}`,
    `op=${pct(m.operationAccuracy)}`,
    `subject=${pct(m.subjectAccuracy)}`,
    `participant=${pct(m.participantReferenceAccuracy)}`,
    `temporal=${pct(m.temporalSemanticAccuracy)}`,
    `correction=${pct(m.correctionDetectionAccuracy)}`,
    `corrP=${pct(m.correctionPrecision)}`,
    `corrR=${pct(m.correctionRecall)}`,
    `corrF1=${pct(m.correctionF1)}`,
    `ellipsis=${pct(m.ellipsisDetectionAccuracy)}`,
    `sequence=${pct(m.sequenceIntentAccuracy)}`,
    `override=${pct(m.explicitCurrentTurnOverrideAccuracy)}`,
    `unsupported=${pct(m.unsupportedClassificationAccuracy)}`,
    `schema=${pct(m.schemaValidationSuccessRate)}`,
    `errors=${pct(m.shadowInterpreterErrorRate)}`,
    `avgLatencyMs=${m.averageInterpreterLatency.toFixed(0)}`,
    `p95LatencyMs=${m.p95InterpreterLatency.toFixed(0)}`,
  ].join('\n')
}
