/**
 * Rescore frozen GPT-5.6 Sol bake-off answers with corrected harness.
 * No new model calls — uses existing artifact traces only.
 *
 *   npx tsx --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/rescoreV7SolBakeOff.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7_FALSIFICATION_CORPUS } from './v7FalsificationCorpus'
import {
  classifyGeneralFailure,
  emptyHardSafety,
  scoreV7Turn,
} from './v7FalsificationScore'
import type { V7TurnResult } from '../agent/loop'

type BakeFail = {
  id: string
  t: number
  general?: string
  harness?: string
  user: string
  answer: string
  tools: string[]
}

function toResult(answer: string, tools: string[]): V7TurnResult {
  return {
    ok: true,
    userText: answer,
    toolCalls: tools.map((name) => ({
      name,
      args: {},
      result: { ok: true },
    })),
    toolCallCount: tools.length,
    stoppedReason: 'final',
    latency: {
      firstModelMs: null,
      toolExecutionMs: [],
      subsequentModelMs: [],
      finalResponseMs: null,
      totalMs: 0,
    },
    model: 'gpt-5.6-sol',
  }
}

function main() {
  const artifactPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../v4/benchmark/artifacts/phase-v7-model-bakeoff.json',
  )
  const bake = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
    models: Array<{
      model: string
      correct: number
      supported: number
      successPct: number
      safety: Record<string, number>
      hardSafetyZero: boolean
    }>
    failuresByModel: Record<string, BakeFail[]>
  }

  const sol = bake.models.find((m) => m.model === 'gpt-5.6-sol')
  if (!sol) throw new Error('missing sol model row')
  const original = {
    correct: sol.correct,
    supported: sol.supported,
    successPct: sol.successPct,
    safety: sol.safety,
  }

  const fails = bake.failuresByModel['gpt-5.6-sol'] ?? []
  const safety = emptyHardSafety()
  const rescoredFails: Array<{
    id: string
    t: number
    supportedUnambiguous: boolean
    originalHarness?: string
    corrected: boolean | null
    failureClass?: string
    general?: string
    user: string
    answer: string
    falseNegativeRemoved: boolean
    reason?: string
  }> = []

  let supportedFlipToPass = 0
  let unsupportedFlipToPass = 0

  for (const f of fails) {
    const convo = V7_FALSIFICATION_CORPUS.find((c) => c.id === f.id)
    const turn = convo?.turns[f.t]
    if (!turn) throw new Error(`missing corpus turn ${f.id} T${f.t}`)

    const scored = scoreV7Turn(
      turn.expect,
      toResult(f.answer, f.tools),
      safety,
    )
    const wasFail = true
    const nowPass = scored.correct === true
    const fnRemoved = wasFail && nowPass
    if (fnRemoved && turn.expect.supportedUnambiguous) supportedFlipToPass += 1
    if (fnRemoved && !turn.expect.supportedUnambiguous) unsupportedFlipToPass += 1

    rescoredFails.push({
      id: f.id,
      t: f.t,
      supportedUnambiguous: turn.expect.supportedUnambiguous,
      originalHarness: f.harness,
      corrected: scored.correct,
      failureClass: scored.failureClass,
      general:
        scored.correct === false
          ? classifyGeneralFailure({
              conversationId: f.id,
              user: f.user,
              failureClass: scored.failureClass,
              tools: f.tools,
              answer: f.answer,
            })
          : undefined,
      user: f.user,
      answer: f.answer,
      falseNegativeRemoved: fnRemoved,
      reason: fnRemoved
        ? turn.expect.supportedUnambiguous
          ? turn.expect.expect?.acceptReceptionUnfilled
            ? 'reception_unfilled_gold'
            : 'polish_name_inflection'
          : 'clarification_without_question_mark'
        : undefined,
    })
  }

  // Non-failed supported turns from original remain correct (scorer only loosened).
  const correctedCorrect = original.correct + supportedFlipToPass
  const correctedSupported = original.supported
  const correctedPct =
    correctedSupported === 0
      ? 0
      : Number(((100 * correctedCorrect) / correctedSupported).toFixed(2))

  const remainingReal = rescoredFails.filter(
    (f) => f.supportedUnambiguous && f.corrected === false,
  )

  const hardZero = Object.values(original.safety).every((n) => n === 0)
  const gatePass = correctedPct >= 95 && hardZero

  const report = {
    experiment: 'V7_SOL_FROZEN_RESCORE',
    productV7Changes: 'NONE',
    original,
    corrected: {
      correct: correctedCorrect,
      supported: correctedSupported,
      successPct: correctedPct,
      safety: original.safety,
      hardSafetyZero: hardZero,
    },
    supportedFlipToPass,
    unsupportedFlipToPass,
    rescoredFormerFailures: rescoredFails,
    remainingSupportedFailures: remainingReal,
    gate: {
      successPctAtLeast95: correctedPct >= 95,
      hardSafetyZero: hardZero,
      verdict: gatePass ? 'V7 SOL FALSIFICATION PASS' : 'V7 SOL FALSIFICATION NO-GO',
    },
  }

  const outPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../v4/benchmark/artifacts/phase-v7-sol-rescore.json',
  )
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log('wrote', outPath)
  process.exit(gatePass ? 0 : 2)
}

main()
