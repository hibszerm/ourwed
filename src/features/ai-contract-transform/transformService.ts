/**
 * Orchestrate Mode A + Mode B comparison for one uploaded contract.
 */

import { buildModeADiagnostics } from './modeADiagnostics'
import { writeTransformedDocx } from './docxTransformWriter'
import { verifyGuardedTransformation } from './guardedVerifier'
import {
  buildProtectedContractData,
  protectedDataSummary,
} from './protectedContractData'
import { runPostReconstructionQualityGate } from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import { summarizeRequiredReplacementsForPrompt } from './quality/deterministicRepairs'
import {
  FULL_AI_PROMPT_VERSION,
  FULL_AI_RESPONSE_VERSION,
  GUARDED_AI_PROMPT_VERSION,
  TRANSFORM_PIPELINE_SCHEMA_VERSION,
  type ContractTransformationDataset,
  type TransformComparisonRun,
  type TransformDocumentBlock,
  type TransformModeResult,
  type TransformedBlock,
} from './types'
import { runFullAiRewrite, runGuardedAiTransform } from './transformApi'
import { saveTransformRun, setInMemoryDocxBytes } from './transformStorage'
import { isAllowedChange } from './changeClassifier'

function emptyModeResult(
  mode: TransformModeResult['mode'],
  promptVersion: string,
): TransformModeResult {
  return {
    mode,
    status: 'idle',
    promptVersion,
    diffs: [],
    downloadAvailable: false,
    changedBlockCount: 0,
    totalTextChanges: 0,
    expectedChanges: 0,
    unexpectedChanges: 0,
    protectedChanges: 0,
    structureChanges: 0,
  }
}

function summarizeDiffs(
  diffs: TransformModeResult['diffs'],
): Pick<
  TransformModeResult,
  | 'changedBlockCount'
  | 'totalTextChanges'
  | 'expectedChanges'
  | 'unexpectedChanges'
  | 'protectedChanges'
  | 'structureChanges'
> {
  let totalTextChanges = 0
  let expectedChanges = 0
  let unexpectedChanges = 0
  let protectedChanges = 0
  let structureChanges = 0
  for (const d of diffs) {
    for (const c of d.changes) {
      totalTextChanges += 1
      if (isAllowedChange(c) || c.exceptionApproved) expectedChanges += 1
      else unexpectedChanges += 1
      if (c.classification === 'protected_value_change') protectedChanges += 1
      if (c.classification === 'block_structure_change') structureChanges += 1
    }
  }
  return {
    changedBlockCount: diffs.length,
    totalTextChanges,
    expectedChanges,
    unexpectedChanges,
    protectedChanges,
    structureChanges,
  }
}

export function createComparisonRunShell(input: {
  runId: string
  sourceFileName: string
  blocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
}): TransformComparisonRun {
  const protectedData = buildProtectedContractData({
    blocks: input.blocks,
    blockTexts: input.blocks.map((b) => b.text),
  })
  return {
    runId: input.runId,
    createdAt: new Date().toISOString(),
    schemaVersion: TRANSFORM_PIPELINE_SCHEMA_VERSION,
    sourceFileName: input.sourceFileName,
    blockCount: input.blocks.length,
    dataset: input.dataset,
    protectedSummary: protectedDataSummary(protectedData),
    modeA: emptyModeResult('full_ai_trusted_rewrite', FULL_AI_PROMPT_VERSION),
    modeB: emptyModeResult('guarded_ai_transform', GUARDED_AI_PROMPT_VERSION),
    evaluations: [],
    approvedExceptions: {},
  }
}

/** Apply locally supplied transformed blocks (tests / mocks). */
export async function applyLocalModeA(input: {
  run: TransformComparisonRun
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  durationMs?: number
  model?: string
  responseVersion?: string
  responseSizeDiagnostics?: import('./types').ResponseSizeDiagnostics
}): Promise<TransformComparisonRun> {
  const protectedData = buildProtectedContractData({
    blocks: input.sourceBlocks,
    blockTexts: input.sourceBlocks.map((b) => b.text),
  })

  const gate = runPostReconstructionQualityGate({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    dataset: input.dataset,
    protectedData,
    mode: 'full_ai',
  })

  const { diagnostics, diffs } = buildModeADiagnostics({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: gate.blocks,
    dataset: input.dataset,
    protectedData,
  })

  let outputBytes: ArrayBuffer | undefined
  let downloadAvailable = false
  if (gate.downloadAllowed) {
    try {
      const aligned = input.sourceBlocks.map((src) => {
        const found = gate.blocks.find((t) => t.blockId === src.blockId)
        return { blockId: src.blockId, text: found?.text ?? src.text }
      })
      outputBytes = await writeTransformedDocx({
        sourceBytes: input.sourceBytes,
        sourceBlocks: input.sourceBlocks,
        transformedBlocks: aligned,
      })
      downloadAvailable = true
    } catch {
      downloadAvailable = false
    }
  }

  const stats = summarizeDiffs(diffs)
  const modeA: TransformModeResult = {
    mode: 'full_ai_trusted_rewrite',
    status: 'success',
    durationMs: input.durationMs,
    model: input.model ?? 'local',
    promptVersion: FULL_AI_PROMPT_VERSION,
    responseVersion: input.responseVersion ?? FULL_AI_PROMPT_VERSION,
    transformedBlocks: gate.blocks,
    responseSizeDiagnostics: input.responseSizeDiagnostics,
    diffs,
    modeADiagnostics: diagnostics,
    qualityReport: gate.report,
    outputBytes,
    downloadAvailable,
    ...stats,
  }

  const run = { ...input.run, modeA }
  if (outputBytes) setInMemoryDocxBytes(run.runId, 'a', outputBytes)
  saveTransformRun(run)
  return run
}

export type GuardedProductTransformSuccess = {
  ok: true
  outputBytes: ArrayBuffer
  transformedBlocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  promptVersion: string
  responseVersion: string
  model?: string
  durationMs?: number
  blockingIssues: string[]
  reviewIssues: string[]
  qualityReport: ReturnType<typeof runPostReconstructionQualityGate>['report']
}

export type GuardedProductTransformFailure = {
  ok: false
  reason: 'edge_error' | 'blocked' | 'write_failed'
  message: string
  blockingIssues: string[]
  reviewIssues: string[]
  promptVersion: string
  responseVersion?: string
  model?: string
  durationMs?: number
}

export type GuardedProductTransformResult =
  | GuardedProductTransformSuccess
  | GuardedProductTransformFailure

export type SparseProductTransformSuccess = {
  ok: true
  outputBytes: ArrayBuffer
  transformedBlocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  promptVersion: string
  responseVersion: string
  model?: string
  durationMs?: number
  blockingIssues: string[]
  reviewIssues: string[]
  qualityReport: ReturnType<typeof runPostReconstructionQualityGate>['report']
  engine: 'sparse_full_ai'
}

export type SparseProductTransformFailure = {
  ok: false
  reason: 'edge_error' | 'blocked' | 'write_failed'
  message: string
  blockingIssues: string[]
  reviewIssues: string[]
  promptVersion: string
  responseVersion?: string
  model?: string
  durationMs?: number
  engine: 'sparse_full_ai'
}

export type SparseProductTransformResult =
  | SparseProductTransformSuccess
  | SparseProductTransformFailure

/**
 * Product wedding generation — sparse changedBlocks pipeline (Mode A policy).
 *
 * Uses Full AI Edge + post-reconstruction quality gate with Mode A download
 * rules (hard financial blocks only). Does NOT run Comparison Lab Mode B
 * `verifyGuardedTransformation` / completeness-blocking guarded policy.
 */
export async function runSparseProductTransform(input: {
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  invoke?: Parameters<typeof runFullAiRewrite>[0]['invoke']
}): Promise<SparseProductTransformResult> {
  const protectedData = buildProtectedContractData({
    blocks: input.sourceBlocks,
    blockTexts: input.sourceBlocks.map((b) => b.text),
  })
  const summary = protectedDataSummary(protectedData)
  const manifest = buildExpectationManifest({
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    protectedData,
  })
  const requiredReplacements = summarizeRequiredReplacementsForPrompt(
    manifest.requiredReplacements,
  )

  const edge = await runFullAiRewrite({
    runId: `product-${Date.now().toString(36)}`,
    documentBlocks: input.sourceBlocks,
    transformationDataset: input.dataset,
    protectedDataSummary: summary,
    requiredReplacements,
    invoke: input.invoke,
  })

  if (!edge.ok) {
    return {
      ok: false,
      reason: 'edge_error',
      message: edge.error.message,
      blockingIssues: [edge.error.code],
      reviewIssues: [],
      promptVersion: FULL_AI_PROMPT_VERSION,
      durationMs: edge.durationMs,
      engine: 'sparse_full_ai',
    }
  }

  const gate = runPostReconstructionQualityGate({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: edge.transformedBlocks,
    dataset: input.dataset,
    protectedData,
    mode: 'full_ai',
  })

  const blockingIssues = gate.report.blockingIssues.map(
    (i) => `${i.code}:${i.canonicalField ?? i.blockId ?? 'doc'}`,
  )
  const reviewIssues = gate.report.reviewIssues.map(
    (i) => `${i.code}:${i.canonicalField ?? i.blockId ?? 'doc'}`,
  )

  if (!gate.downloadAllowed) {
    return {
      ok: false,
      reason: 'blocked',
      message:
        'Nie udało się przygotować umowy z powodu niespójności finansowej. Sprawdź kwoty ślubu i spróbuj ponownie.',
      blockingIssues,
      reviewIssues,
      promptVersion: FULL_AI_PROMPT_VERSION,
      responseVersion: edge.responseVersion,
      model: edge.model,
      durationMs: edge.durationMs,
      engine: 'sparse_full_ai',
    }
  }

  try {
    const aligned = input.sourceBlocks.map((src) => {
      const found = gate.blocks.find((t) => t.blockId === src.blockId)
      return { blockId: src.blockId, text: found?.text ?? src.text }
    })
    const outputBytes = await writeTransformedDocx({
      sourceBytes: input.sourceBytes,
      sourceBlocks: input.sourceBlocks,
      transformedBlocks: aligned,
    })
    return {
      ok: true,
      outputBytes,
      transformedBlocks: gate.blocks,
      sourceBlocks: input.sourceBlocks,
      promptVersion: FULL_AI_PROMPT_VERSION,
      responseVersion: edge.responseVersion ?? FULL_AI_RESPONSE_VERSION,
      model: edge.model,
      durationMs: edge.durationMs,
      blockingIssues,
      reviewIssues,
      qualityReport: gate.report,
      engine: 'sparse_full_ai',
    }
  } catch (e) {
    return {
      ok: false,
      reason: 'write_failed',
      message:
        e instanceof Error
          ? e.message
          : 'Nie udało się zapisać wygenerowanego DOCX.',
      blockingIssues,
      reviewIssues,
      promptVersion: FULL_AI_PROMPT_VERSION,
      responseVersion: edge.responseVersion,
      model: edge.model,
      durationMs: edge.durationMs,
      engine: 'sparse_full_ai',
    }
  }
}

/**
 * @deprecated Comparison Lab Mode B product experiment — stricter completeness
 * blocking. Wedding product uses `runSparseProductTransform` instead.
 */
export async function runGuardedProductTransform(input: {
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  invoke?: Parameters<typeof runGuardedAiTransform>[0]['invoke']
  approvedExceptions?: Record<string, boolean>
}): Promise<GuardedProductTransformResult> {
  const protectedData = buildProtectedContractData({
    blocks: input.sourceBlocks,
    blockTexts: input.sourceBlocks.map((b) => b.text),
  })
  const summary = protectedDataSummary(protectedData)
  const manifest = buildExpectationManifest({
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    protectedData,
  })
  const requiredReplacements = summarizeRequiredReplacementsForPrompt(
    manifest.requiredReplacements,
  )

  const edge = await runGuardedAiTransform({
    runId: `product-${Date.now().toString(36)}`,
    documentBlocks: input.sourceBlocks,
    transformationDataset: input.dataset,
    protectedDataSummary: summary,
    requiredReplacements,
    invoke: input.invoke,
  })

  if (!edge.ok) {
    return {
      ok: false,
      reason: 'edge_error',
      message: edge.error.message,
      blockingIssues: [edge.error.code],
      reviewIssues: [],
      promptVersion: GUARDED_AI_PROMPT_VERSION,
      durationMs: edge.durationMs,
    }
  }

  const gate = runPostReconstructionQualityGate({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: edge.transformedBlocks,
    dataset: input.dataset,
    protectedData,
    mode: 'guarded',
  })

  const verification = verifyGuardedTransformation({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: gate.blocks,
    dataset: input.dataset,
    protectedData,
    approvedExceptions: input.approvedExceptions,
  })

  const qualityBlocks = !gate.downloadAllowed
  const safeToGenerate =
    verification.status === 'safe_to_generate' && !qualityBlocks

  const blockingIssues = [
    ...verification.blockingIssues,
    ...gate.report.blockingIssues.map(
      (i) => `${i.code}:${i.canonicalField ?? i.blockId ?? 'doc'}`,
    ),
  ]
  const reviewIssues = [
    ...verification.reviewIssues,
    ...gate.report.reviewIssues.map(
      (i) => `${i.code}:${i.canonicalField ?? i.blockId ?? 'doc'}`,
    ),
  ]

  if (!safeToGenerate) {
    return {
      ok: false,
      reason: 'blocked',
      message:
        'Umowa wymaga przeglądu przed zapisem. Sprawdź dane ślubu i spróbuj ponownie.',
      blockingIssues,
      reviewIssues,
      promptVersion: GUARDED_AI_PROMPT_VERSION,
      responseVersion: edge.responseVersion,
      model: edge.model,
      durationMs: edge.durationMs,
    }
  }

  try {
    const outputBytes = await writeTransformedDocx({
      sourceBytes: input.sourceBytes,
      sourceBlocks: input.sourceBlocks,
      transformedBlocks: gate.blocks,
    })
    return {
      ok: true,
      outputBytes,
      transformedBlocks: gate.blocks,
      sourceBlocks: input.sourceBlocks,
      promptVersion: GUARDED_AI_PROMPT_VERSION,
      responseVersion: edge.responseVersion ?? GUARDED_AI_PROMPT_VERSION,
      model: edge.model,
      durationMs: edge.durationMs,
      blockingIssues,
      reviewIssues,
      qualityReport: gate.report,
    }
  } catch (e) {
    return {
      ok: false,
      reason: 'write_failed',
      message:
        e instanceof Error
          ? e.message
          : 'Nie udało się zapisać wygenerowanego DOCX.',
      blockingIssues,
      reviewIssues,
      promptVersion: GUARDED_AI_PROMPT_VERSION,
      responseVersion: edge.responseVersion,
      model: edge.model,
      durationMs: edge.durationMs,
    }
  }
}

export async function applyLocalModeB(input: {
  run: TransformComparisonRun
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  durationMs?: number
  model?: string
  responseVersion?: string
  responseSizeDiagnostics?: import('./types').ResponseSizeDiagnostics
  approvedExceptions?: Record<string, boolean>
}): Promise<TransformComparisonRun> {
  const protectedData = buildProtectedContractData({
    blocks: input.sourceBlocks,
    blockTexts: input.sourceBlocks.map((b) => b.text),
  })

  const gate = runPostReconstructionQualityGate({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    dataset: input.dataset,
    protectedData,
    mode: 'guarded',
  })

  const verification = verifyGuardedTransformation({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: gate.blocks,
    dataset: input.dataset,
    protectedData,
    approvedExceptions: input.approvedExceptions ?? input.run.approvedExceptions,
  })

  // Mode B: block on guarded verifier OR quality-gate blocking issues
  const qualityBlocks = !gate.downloadAllowed
  const safeToGenerate =
    verification.status === 'safe_to_generate' && !qualityBlocks

  let outputBytes: ArrayBuffer | undefined
  let downloadAvailable = false
  if (safeToGenerate) {
    try {
      outputBytes = await writeTransformedDocx({
        sourceBytes: input.sourceBytes,
        sourceBlocks: input.sourceBlocks,
        transformedBlocks: gate.blocks,
      })
      downloadAvailable = true
    } catch {
      downloadAvailable = false
    }
  }

  const mergedVerification = {
    ...verification,
    status: safeToGenerate
      ? ('safe_to_generate' as const)
      : ('blocked' as const),
    blockingIssues: [
      ...verification.blockingIssues,
      ...gate.report.blockingIssues.map(
        (i) => `${i.code}:${i.canonicalField ?? i.blockId ?? 'doc'}`,
      ),
    ],
    reviewIssues: [
      ...verification.reviewIssues,
      ...gate.report.reviewIssues.map(
        (i) => `${i.code}:${i.canonicalField ?? i.blockId ?? 'doc'}`,
      ),
    ],
  }

  const stats = summarizeDiffs(verification.diffs)
  const modeB: TransformModeResult = {
    mode: 'guarded_ai_transform',
    status: 'success',
    durationMs: input.durationMs,
    model: input.model ?? 'local',
    promptVersion: GUARDED_AI_PROMPT_VERSION,
    responseVersion: input.responseVersion ?? GUARDED_AI_PROMPT_VERSION,
    transformedBlocks: gate.blocks,
    responseSizeDiagnostics: input.responseSizeDiagnostics,
    diffs: verification.diffs,
    modeBVerification: mergedVerification,
    qualityReport: gate.report,
    outputBytes,
    downloadAvailable,
    ...stats,
    structureChanges: verification.structureChangeCount,
    protectedChanges: verification.protectedChangeCount,
    unexpectedChanges: verification.unexpectedChangeCount,
    expectedChanges: verification.expectedChangeCount,
  }

  const run = { ...input.run, modeB }
  if (outputBytes) setInMemoryDocxBytes(run.runId, 'b', outputBytes)
  saveTransformRun(run)
  return run
}

export async function runBothTransformModes(input: {
  run: TransformComparisonRun
  sourceBytes: ArrayBuffer
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  invoke?: Parameters<typeof runFullAiRewrite>[0]['invoke']
}): Promise<TransformComparisonRun> {
  const protectedData = buildProtectedContractData({
    blocks: input.sourceBlocks,
    blockTexts: input.sourceBlocks.map((b) => b.text),
  })
  const summary = protectedDataSummary(protectedData)
  const manifest = buildExpectationManifest({
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    protectedData,
  })
  const requiredReplacements = summarizeRequiredReplacementsForPrompt(
    manifest.requiredReplacements,
  )

  let run: TransformComparisonRun = {
    ...input.run,
    modeA: { ...input.run.modeA, status: 'running', edgeError: undefined, errorCode: undefined, errorMessage: undefined },
    modeB: { ...input.run.modeB, status: 'running', edgeError: undefined, errorCode: undefined, errorMessage: undefined },
  }
  saveTransformRun(run)

  const settled = await Promise.allSettled([
    runFullAiRewrite({
      runId: run.runId,
      documentBlocks: input.sourceBlocks,
      transformationDataset: input.dataset,
      protectedDataSummary: summary,
      requiredReplacements,
      invoke: input.invoke,
    }),
    runGuardedAiTransform({
      runId: run.runId,
      documentBlocks: input.sourceBlocks,
      transformationDataset: input.dataset,
      protectedDataSummary: summary,
      requiredReplacements,
      invoke: input.invoke,
    }),
  ])

  const fullSettled = settled[0]!
  const guardedSettled = settled[1]!

  // Mode A — independent of Mode B
  try {
    if (fullSettled.status === 'fulfilled' && fullSettled.value.ok) {
      run = await applyLocalModeA({
        run,
        sourceBytes: input.sourceBytes,
        sourceBlocks: input.sourceBlocks,
        transformedBlocks: fullSettled.value.transformedBlocks,
        dataset: input.dataset,
        durationMs: fullSettled.value.durationMs,
        model: fullSettled.value.model,
        responseVersion: fullSettled.value.responseVersion,
        responseSizeDiagnostics: fullSettled.value.responseSizeDiagnostics,
      })
    } else if (fullSettled.status === 'fulfilled' && !fullSettled.value.ok) {
      const err = fullSettled.value.error
      run = {
        ...run,
        modeA: {
          ...run.modeA,
          status: 'error',
          errorCode: err.code,
          errorMessage: err.message,
          edgeError: err.detail,
          responseSizeDiagnostics: {
            incompleteReason: err.reason ?? err.detail.incompleteReason,
            configuredMaxOutputTokens:
              err.configuredMaxOutputTokens ??
              err.detail.configuredMaxOutputTokens,
            attemptCount: err.detail.attemptCount,
            responseStatus: err.detail.responseStatus,
          },
          durationMs: fullSettled.value.durationMs,
          downloadAvailable: false,
        },
      }
    } else if (fullSettled.status === 'rejected') {
      const detail = {
        mode: 'full_ai_trusted_rewrite' as const,
        functionName: 'ai-contract-full-rewrite',
        errorType: 'unknown_error' as const,
        message:
          fullSettled.reason instanceof Error
            ? fullSettled.reason.message
            : String(fullSettled.reason ?? 'unknown'),
      }
      run = {
        ...run,
        modeA: {
          ...run.modeA,
          status: 'error',
          errorCode: detail.errorType,
          errorMessage: detail.message,
          edgeError: detail,
          downloadAvailable: false,
        },
      }
    }
  } catch (e) {
    run = {
      ...run,
      modeA: {
        ...run.modeA,
        status: 'error',
        errorCode: 'unknown_error',
        errorMessage: e instanceof Error ? e.message : String(e),
        edgeError: {
          mode: 'full_ai_trusted_rewrite',
          functionName: 'ai-contract-full-rewrite',
          errorType: 'unknown_error',
          message: e instanceof Error ? e.message : String(e),
        },
        downloadAvailable: false,
      },
    }
  }

  // Mode B — independent of Mode A
  try {
    if (guardedSettled.status === 'fulfilled' && guardedSettled.value.ok) {
      run = await applyLocalModeB({
        run,
        sourceBytes: input.sourceBytes,
        sourceBlocks: input.sourceBlocks,
        transformedBlocks: guardedSettled.value.transformedBlocks,
        dataset: input.dataset,
        durationMs: guardedSettled.value.durationMs,
        model: guardedSettled.value.model,
        responseVersion: guardedSettled.value.responseVersion,
        responseSizeDiagnostics: guardedSettled.value.responseSizeDiagnostics,
      })
    } else if (guardedSettled.status === 'fulfilled' && !guardedSettled.value.ok) {
      const err = guardedSettled.value.error
      run = {
        ...run,
        modeB: {
          ...run.modeB,
          status: 'error',
          errorCode: err.code,
          errorMessage: err.message,
          edgeError: err.detail,
          responseSizeDiagnostics: {
            incompleteReason: err.reason ?? err.detail.incompleteReason,
            configuredMaxOutputTokens:
              err.configuredMaxOutputTokens ??
              err.detail.configuredMaxOutputTokens,
            attemptCount: err.detail.attemptCount,
            responseStatus: err.detail.responseStatus,
          },
          durationMs: guardedSettled.value.durationMs,
          downloadAvailable: false,
        },
      }
    } else if (guardedSettled.status === 'rejected') {
      const detail = {
        mode: 'guarded_ai_transform' as const,
        functionName: 'ai-contract-guarded-transform',
        errorType: 'unknown_error' as const,
        message:
          guardedSettled.reason instanceof Error
            ? guardedSettled.reason.message
            : String(guardedSettled.reason ?? 'unknown'),
      }
      run = {
        ...run,
        modeB: {
          ...run.modeB,
          status: 'error',
          errorCode: detail.errorType,
          errorMessage: detail.message,
          edgeError: detail,
          downloadAvailable: false,
        },
      }
    }
  } catch (e) {
    run = {
      ...run,
      modeB: {
        ...run.modeB,
        status: 'error',
        errorCode: 'unknown_error',
        errorMessage: e instanceof Error ? e.message : String(e),
        edgeError: {
          mode: 'guarded_ai_transform',
          functionName: 'ai-contract-guarded-transform',
          errorType: 'unknown_error',
          message: e instanceof Error ? e.message : String(e),
        },
        downloadAvailable: false,
      },
    }
  }

  saveTransformRun(run)
  return run
}

export function approveGuardedException(
  run: TransformComparisonRun,
  changeKey: string,
): TransformComparisonRun {
  return {
    ...run,
    approvedExceptions: { ...run.approvedExceptions, [changeKey]: true },
  }
}
