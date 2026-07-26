/**
 * Persist template slots + fillable DOCX after import / re-analysis.
 * Ready only when every required detected slot has a physical binding.
 */

import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import { documentStorage } from '@/lib/api/documents/storage'
import { documentTemplateService } from '@/lib/api/documents'
import { requireStudioUserId } from '@/lib/api/ownership'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import type { DocumentTemplateStatus } from '@/types/documents'
import {
  CONTRACT_ANALYSIS_VERSION,
  CONTRACT_READINESS_VERSION,
} from '@/features/documents/performance/analysisVersions'
import { insertPlaceholdersInDocx } from './insertPlaceholders'
import {
  finalizeSlotMapClassification,
  stripNonDetectedSlots,
  validateTemplateSlotBindings,
} from './templateReadiness'
import type { TemplateSlotMap } from './types'

export interface SaveTemplateSlotsInput {
  templateId: string
  templateVersionId: string
  versionNumber: number
  sourceBytes: ArrayBuffer
  slotMap: TemplateSlotMap
  documentTitle?: string
  /** When true, skip re-classify (config edits already classified). */
  skipReclassify?: boolean
}

export interface SaveTemplateSlotsResult {
  slotMap: TemplateSlotMap
  templateDocxPath: string | null
  insertedCount: number
  status: DocumentTemplateStatus
  unresolvedKeys: string[]
}

export async function saveTemplateSlots(
  input: SaveTemplateSlotsInput,
): Promise<SaveTemplateSlotsResult> {
  const userId = await requireStudioUserId()

  let workingMap: TemplateSlotMap = input.skipReclassify
    ? input.slotMap
    : stripNonDetectedSlots(finalizeSlotMapClassification(input.slotMap))

  workingMap = {
    ...workingMap,
    documentTitle: input.documentTitle ?? workingMap.documentTitle,
    slots: workingMap.slots.filter((s) => s.enabled !== false || s.physicallyBound),
  }

  let templateDocxPath: string | null = null
  let finalMap = workingMap
  let insertedCount = 0

  const sourceCopy = cloneArrayBuffer(input.sourceBytes)
  const built = await insertPlaceholdersInDocx(sourceCopy, workingMap)
  finalMap = built.slotMap
  insertedCount = built.insertedCount

  // Re-attach counters after placeholder pass
  const readinessPre = validateTemplateSlotBindings(finalMap)
  finalMap = {
    ...finalMap,
    counters: readinessPre.counters,
    unboundRegistryKeys: readinessPre.unresolvedKeys,
  }

  templateDocxPath = documentStorage.paths.templateFillable(
    userId,
    input.templateId,
    input.versionNumber,
  )
  const blob = new Blob([cloneArrayBuffer(built.bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  try {
    await documentStorage.remove(templateDocxPath)
  } catch {
    /* first upload */
  }
  await documentStorage.upload(
    templateDocxPath,
    blob,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )

  const readiness = validateTemplateSlotBindings({
    ...finalMap,
    analysisWarnings: workingMap.analysisWarnings ?? finalMap.analysisWarnings,
    analysisStatus: workingMap.analysisStatus ?? finalMap.analysisStatus,
  })
  finalMap = {
    ...finalMap,
    counters: readiness.counters,
    unboundRegistryKeys: readiness.unresolvedKeys,
    analysisWarnings: readiness.analysisWarnings,
    analysisStatus: readiness.needsReview ? 'needs_review' : 'complete',
    lifecycleStatus: readiness.lifecycleStatus,
  }

  let status: DocumentTemplateStatus = readiness.ready
    ? 'ready'
    : readiness.needsReview
      ? 'needs_review'
      : 'incomplete'

  console.info('[contract-loaded-bindings]', {
    phase: 'saveTemplateSlots-before-db-write',
    templateVersionId: input.templateVersionId,
    paragraphIndex: 36,
    bindingInputCount: input.slotMap.slots.length,
    bindingOutputCount: finalMap.slots.length,
    bindings: finalMap.slots
      .filter((s) => s.paragraphIndex === 36)
      .map((s) => ({
        registryKey: s.registryKey,
        paragraphIndex: s.paragraphIndex,
        startOffset: s.startOffset ?? s.allowedRange?.start ?? null,
        endOffset: s.endOffset ?? s.allowedRange?.end ?? null,
        originalSpan: s.originalText ?? null,
        leftAnchor: s.leftAnchor ?? null,
        rightAnchor: s.rightAnchor ?? null,
        enabled: s.enabled !== false,
        physicallyBound: s.physicallyBound,
        detectionStatus: s.detectionStatus,
      })),
  })

  const { error } = await supabase
    .from('document_template_versions')
    .update({
      template_docx_path: templateDocxPath,
      slot_map: finalMap,
    })
    .eq('id', input.templateVersionId)
  throwOnError(error)

  const previous = await documentTemplateService.get(input.templateId)
  const meta = {
    ...(previous?.meta ?? { version: 1 as const }),
    version: 1 as const,
    slotBindingsReady: readiness.ready,
    unresolvedSlotKeys: readiness.unresolvedKeys,
    unresolvedSlotReasons: readiness.issues
      .filter((i) => readiness.unresolvedKeys.includes(i.registryKey))
      .map((i) => ({
        key: i.registryKey,
        reason: i.reason,
      })),
    slotCounters: readiness.counters,
    analysisWarnings: readiness.analysisWarnings,
    analysisStatus: (readiness.needsReview ? 'needs_review' : 'complete') as
      | 'needs_review'
      | 'complete',
    generationReady: readiness.ready,
    safeBindingCount: readiness.counters.safeBindingsCount ?? 0,
    unsafeBindingCount: readiness.counters.unsafeBindingsCount ?? 0,
    unresolvedCount: readiness.counters.unresolvedRequiredSlotCount,
    requiredMissingCount: readiness.counters.unresolvedRequiredSlotCount,
    emptyPlaceholderCount: finalMap.slots.filter(
      (s) =>
        s.needsConfirmation === true &&
        !(s.originalText ?? '').trim() &&
        (s.registryKey?.includes('phone') ||
          s.registryKey?.includes('email') ||
          s.evidenceType === 'blank_between_anchors'),
    ).length,
    lastAnalyzedAt: new Date().toISOString(),
    analysisVersion: CONTRACT_ANALYSIS_VERSION,
    readinessVersion: CONTRACT_READINESS_VERSION,
    lifecycleStatus: readiness.lifecycleStatus,
    coupleVariables: finalMap.slots
      .filter((s) => s.sourceHint === 'couple' || s.sourceHint === 'wedding')
      .map((s) => ({
        id: s.id,
        registryKey: s.registryKey,
        label: s.label,
        enabled: s.enabled,
        physicallyBound: s.physicallyBound === true,
        requirement: s.requirement,
        detectionStatus: s.detectionStatus,
        needsConfirmation: s.needsConfirmation,
        confidence: s.confidence,
      })),
    studioVariables: finalMap.slots
      .filter((s) => s.sourceHint === 'company')
      .map((s) => ({
        id: s.id,
        registryKey: s.registryKey,
        label: s.label,
        enabled: s.enabled,
        physicallyBound: s.physicallyBound === true,
        requirement: s.requirement,
        detectionStatus: s.detectionStatus,
        needsConfirmation: s.needsConfirmation,
        confidence: s.confidence,
      })),
    packageVariables: finalMap.slots
      .filter((s) => s.sourceHint === 'package' && s.registryKey)
      .map((s) => ({
        id: s.id,
        registryKey: s.registryKey!,
        label: s.label,
        enabled: s.enabled,
        physicallyBound: s.physicallyBound === true,
        requirement: s.requirement,
        detectionStatus: s.detectionStatus,
        needsConfirmation: s.needsConfirmation,
        confidence: s.confidence,
      })),
  }

  try {
    await documentTemplateService.update(input.templateId, {
      status,
      aiAnalyzedAt: new Date().toISOString(),
      meta,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      (status === 'incomplete' || status === 'needs_review') &&
      /incomplete|needs_review|check|violat/i.test(message)
    ) {
      console.warn(
        `[saveTemplateSlots] status "${status}" rejected by DB, falling back to draft`,
        message,
      )
      status = 'draft'
      await documentTemplateService.update(input.templateId, {
        status: 'draft',
        aiAnalyzedAt: new Date().toISOString(),
        meta,
      })
    } else {
      console.error('[saveTemplateSlots] template update failed', {
        templateId: input.templateId,
        status,
        message,
      })
      throw err
    }
  }

  return {
    slotMap: finalMap,
    templateDocxPath,
    insertedCount,
    status,
    unresolvedKeys: readiness.unresolvedKeys,
  }
}
