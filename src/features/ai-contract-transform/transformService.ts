/**
 * Product wedding contract transform orchestration (sparse Mode A).
 */

import { writeTransformedDocx } from './docxTransformWriter'
import {
  buildProtectedContractData,
  protectedDataSummary,
} from './protectedContractData'
import {
  isModeALocationIntegrityBlock,
  runPostReconstructionQualityGate,
} from './quality/buildQualityReport'
import { buildExpectationManifest } from './quality/expectationManifest'
import { summarizeRequiredReplacementsForPrompt } from './quality/deterministicRepairs'
import {
  FULL_AI_PROMPT_VERSION,
  FULL_AI_RESPONSE_VERSION,
  type ContractTransformationDataset,
  type TransformDocumentBlock,
  type TransformedBlock,
} from './types'
import { runFullAiRewrite } from './transformApi'

export type SparseProductTransformSuccess = {
  ok: true
  outputBytes: ArrayBuffer
  transformedBlocks: TransformedBlock[]
  sourceBlocks: TransformDocumentBlock[]
  paragraphInsertions: ReturnType<
    typeof runPostReconstructionQualityGate
  >['paragraphInsertions']
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
 * rules (hard financial + location integrity blocks).
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
    const locationBlock = gate.report.blockingIssues.some((i) =>
      isModeALocationIntegrityBlock(i),
    )
    return {
      ok: false,
      reason: 'blocked',
      message: locationBlock
        ? 'Nie udało się przygotować umowy — dokument zawiera niepotwierdzone miejsca (np. przeniesione z innego etapu dnia) lub przykłady z szablonu. Uzupełnij miejsca wesela lub popraw szablon.'
        : 'Nie udało się przygotować umowy z powodu niespójności finansowej. Sprawdź kwoty ślubu i spróbuj ponownie.',
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
      paragraphInsertions: gate.paragraphInsertions,
    })
    return {
      ok: true,
      outputBytes,
      transformedBlocks: gate.blocks,
      sourceBlocks: input.sourceBlocks,
      paragraphInsertions: gate.paragraphInsertions,
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
