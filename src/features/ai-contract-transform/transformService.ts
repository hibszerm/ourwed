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
import { classifyFactOwner } from './quality/partyOwnership'
import { isProviderIdentityBlock } from './quality/partyFilledIdentity'
import { classifyAdditionalServicesPlacement } from './additionalServicesPlacement'
import { findSignatureStartIndex } from './packageDeliverablesDetection'
import { assertsContractExecutionDate } from './quality/dateFieldEvidence'
import { classifyRowLabel } from './tableRowOwnership'
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
  const roleByBlock = new Map<string, Set<string>>()
  for (const replacement of manifest.requiredReplacements) {
    for (const blockId of replacement.sourceBlockIds) {
      const roles = roleByBlock.get(blockId) ?? new Set<string>()
      roles.add(replacement.canonicalField)
      roleByBlock.set(blockId, roles)
    }
  }
  for (const field of manifest.requiredFields) {
    if (field.canonicalField !== 'wedding.date' && field.canonicalField !== 'contract.executionDate') continue
    for (const context of field.expectedContexts ?? []) {
      for (const blockId of context.blockIds) {
        const roles = roleByBlock.get(blockId) ?? new Set<string>()
        roles.add(field.canonicalField)
        roleByBlock.set(blockId, roles)
      }
    }
  }
  for (const evidence of manifest.sourceSpecificValues) {
    if (evidence.canonicalField !== 'wedding.date' && evidence.canonicalField !== 'contract.executionDate') continue
    for (const blockId of evidence.sourceBlockIds) {
      const roles = roleByBlock.get(blockId) ?? new Set<string>()
      roles.add(evidence.canonicalField)
      roleByBlock.set(blockId, roles)
    }
  }
  for (const block of input.sourceBlocks) {
    const header = block.tableContext?.columnHeaderText?.trim() ?? ''
    if (!header) continue
    const role = assertsContractExecutionDate(header)
      ? 'contract.executionDate'
      : classifyRowLabel(header) === 'wedding_date'
        ? 'wedding.date'
        : null
    if (!role) continue
    const roles = roleByBlock.get(block.blockId) ?? new Set<string>()
    roles.add(role)
    roleByBlock.set(block.blockId, roles)
  }
  const signatureStart = findSignatureStartIndex(input.sourceBlocks)
  const placement = classifyAdditionalServicesPlacement(input.sourceBlocks)
  const extrasTarget = placement.targetBlockId
  const protectedSourceValues = manifest.protectedFields.flatMap((field) => field.sourceValues)
  const sourceBlocksWithContext = input.sourceBlocks.map((block, index) => {
    const owner = block.tableContext?.ownershipFamily
      ? block.tableContext.ownershipFamily === 'customer'
        ? 'customer'
        : block.tableContext.ownershipFamily === 'provider'
          ? 'provider'
          : 'unknown'
      : classifyFactOwner(block.text) === 'MIXED'
        ? 'mixed'
        : isProviderIdentityBlock(block.text)
          ? 'provider'
          : 'unknown'
    const protectedByEvidence = protectedSourceValues.some((value) =>
      value.trim().length > 0 && block.text.includes(value),
    )
    const protectedBlock =
      (owner === 'provider' && isProviderIdentityBlock(block.text)) ||
      protectedByEvidence ||
      block.blockId === extrasTarget
    return {
      ...block,
      modelContext: {
        semanticRoles: [...(roleByBlock.get(block.blockId) ?? [])],
        ownership: owner as 'customer' | 'provider' | 'mixed' | 'unknown',
        modelEditable: !protectedBlock,
      signatureRegion:
          (index < signatureStart ? 'before' : index === signatureStart ? 'signature' : 'after') as
            'before' | 'signature' | 'after',
      },
    }
  })

  const edge = await runFullAiRewrite({
    runId: `product-${Date.now().toString(36)}`,
    documentBlocks: sourceBlocksWithContext,
    transformationDataset: input.dataset,
    protectedDataSummary: summary,
    requiredReplacements,
    structuralContext: {
      extras: {
        deterministicOnly: true,
        destinationBlockId: placement.targetBlockId,
        anchorType: placement.anchorType,
      },
      signatureStartIndex: signatureStart,
      editableBlockIds: sourceBlocksWithContext
        .filter((block) => block.modelContext?.modelEditable !== false)
        .map((block) => block.blockId),
    },
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
