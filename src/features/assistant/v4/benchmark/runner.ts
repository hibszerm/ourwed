/**
 * Benchmark runner — deterministic expectation checks + optional live Edge.
 */

import { matchTaskSpecExpectation } from '../expect'
import { interpretTaskSpec } from '../interpreter'
import type { AssistantTaskSpec } from '../taskSpec'
import {
  ASSISTANT_V4_BENCHMARK_CORPUS,
  type AssistantBenchmarkCase,
} from './corpus'
import { aggregateCaseScores, formatMetrics, type CaseScore } from './metrics'

export type RunnerOptions = {
  cases?: AssistantBenchmarkCase[]
  /** Provide TaskSpec without Edge (deterministic / fixture mode). */
  interpret?: (
    c: AssistantBenchmarkCase,
  ) => Promise<{ taskSpec: AssistantTaskSpec | null; latencyMs: number; error?: string }>
  ids?: string[]
  limit?: number
  onCase?: (score: CaseScore, c: AssistantBenchmarkCase) => void
}

export async function runAssistantV4Benchmark(
  options: RunnerOptions = {},
): Promise<{
  scores: CaseScore[]
  metrics: ReturnType<typeof aggregateCaseScores>
  failures: Array<{
    id: string
    input: string
    expected: unknown
    actual: AssistantTaskSpec | null
    diffs: CaseScore['match'] extends infer M
      ? M extends { diffs: infer D }
        ? D
        : never
      : never
  }>
  report: string
}> {
  let cases = options.cases ?? ASSISTANT_V4_BENCHMARK_CORPUS
  if (options.ids?.length) {
    const set = new Set(options.ids)
    cases = cases.filter((c) => set.has(c.id))
  }
  if (options.limit && options.limit > 0) {
    cases = cases.slice(0, options.limit)
  }

  const scores: CaseScore[] = []
  const failures: Array<{
    id: string
    input: string
    expected: unknown
    actual: AssistantTaskSpec | null
    diffs: NonNullable<CaseScore['match']>['diffs']
  }> = []

  for (const c of cases) {
    let taskSpec: AssistantTaskSpec | null
    let latencyMs: number
    let error: string | undefined

    if (options.interpret) {
      const r = await options.interpret(c)
      taskSpec = r.taskSpec
      latencyMs = r.latencyMs
      error = r.error
    } else {
      const r = await interpretTaskSpec({
        userText: c.input.userText,
        semanticContext: c.input.semanticContext,
      })
      latencyMs = r.latencyMs
      if (r.ok) {
        taskSpec = r.taskSpec
        error = undefined
      } else {
        taskSpec = null
        error = r.error
      }
    }

    const schemaOk = taskSpec != null
    const match = taskSpec
      ? matchTaskSpecExpectation(taskSpec, c.expected.taskSpec)
      : null
    const ok = Boolean(match?.ok)

    const expectedCorrection =
      c.expected.taskSpec.requireCorrection === true ||
      c.expected.taskSpec.op === 'correction' ||
      (Array.isArray(c.expected.taskSpec.op) &&
        c.expected.taskSpec.op.includes('correction'))
    const actualCorrection = taskSpec?.op === 'correction'

    const score: CaseScore = {
      id: c.id,
      category: c.category,
      ok,
      latencyMs,
      schemaOk,
      match,
      error,
      expectedCorrection,
      actualCorrection: Boolean(actualCorrection),
    }
    scores.push(score)
    options.onCase?.(score, c)

    if (!ok) {
      failures.push({
        id: c.id,
        input: c.input.userText,
        expected: c.expected.taskSpec,
        actual: taskSpec,
        diffs: match?.diffs ?? [
          { field: 'taskSpec', expected: 'valid', actual: error ?? 'null' },
        ],
      })
    }
  }

  const metrics = aggregateCaseScores(scores)
  const report = [
    '=== Assistant V4 Benchmark ===',
    formatMetrics(metrics),
    `failures=${failures.length}`,
    ...failures.slice(0, 40).map(
      (f) =>
        `- ${f.id}: ${f.input} | diffs=${f.diffs.map((d) => `${d.field}:${d.expected}≠${d.actual}`).join('; ')}`,
    ),
  ].join('\n')

  return { scores, metrics, failures, report }
}

export function corpusStats(cases = ASSISTANT_V4_BENCHMARK_CORPUS): {
  total: number
  singleTurn: number
  multiTurnTurns: number
  conversations: number
  byCategory: Record<string, number>
} {
  const byCategory: Record<string, number> = {}
  let multiTurnTurns = 0
  const convos = new Set<string>()
  for (const c of cases) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1
    if (c.conversationId) {
      multiTurnTurns += 1
      convos.add(c.conversationId)
    }
  }
  return {
    total: cases.length,
    singleTurn: cases.length - multiTurnTurns,
    multiTurnTurns,
    conversations: convos.size,
    byCategory,
  }
}
