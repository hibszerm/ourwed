/**
 * Merge freshly detected physical bindings into a persisted slot_map.
 * Used when binder logic advances but a template version still has stale bindings.
 */

import {
  candidatesToTemplateSlots,
  detectContractCandidates,
} from './candidateDetection'
import { dedupeSlotsByCanonicalKey } from './slotClassification'
import {
  isSlotPhysicallyBound,
  type TemplateSlot,
  type TemplateSlotMap,
} from './types'

export type BindingRemovalReason =
  | 'duplicate_same_span'
  | 'weaker_than_existing'
  | 'not_physically_bound'
  | 'disabled'

export type BindingSyncDiagnostic = {
  inputCount: number
  outputCount: number
  added: Array<{
    registryKey: string
    paragraphIndex: number | null
    startOffset: number | null
    endOffset: number | null
    originalSpan: string | null
  }>
  removed: Array<{
    registryKey: string
    paragraphIndex: number | null
    reason: BindingRemovalReason
  }>
  paragraph36: Array<{
    registryKey: string
    paragraphIndex: number | null
    startOffset: number | null
    endOffset: number | null
    originalSpan: string | null
    leftAnchor: string | null
    rightAnchor: string | null
    enabled: boolean
    physicallyBound: boolean
  }>
}

function spanIdentity(slot: TemplateSlot): string | null {
  if (!slot.registryKey || slot.paragraphIndex == null) return null
  const start = slot.startOffset ?? slot.allowedRange?.start
  const end = slot.endOffset ?? slot.allowedRange?.end
  if (start == null || end == null) return null
  return `${slot.registryKey}@${slot.paragraphIndex}:${start}:${end}`
}

function describePara36(slots: TemplateSlot[]) {
  return slots
    .filter((s) => s.paragraphIndex === 36)
    .map((s) => ({
      registryKey: s.registryKey ?? '',
      paragraphIndex: s.paragraphIndex ?? null,
      startOffset: s.startOffset ?? s.allowedRange?.start ?? null,
      endOffset: s.endOffset ?? s.allowedRange?.end ?? null,
      originalSpan: s.originalText ?? null,
      leftAnchor: s.leftAnchor ?? null,
      rightAnchor: s.rightAnchor ?? null,
      enabled: s.enabled !== false,
      physicallyBound: isSlotPhysicallyBound(s),
    }))
}

/**
 * Log finalized physical bindings for a paragraph before dedupe/filter.
 */
export function logContractLoadedBindings(input: {
  templateVersionId?: string | null
  phase: string
  slots: TemplateSlot[]
  paragraphIndex?: number
}) {
  const para = input.paragraphIndex ?? 36
  const bindings = input.slots
    .filter((s) => s.paragraphIndex === para)
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
    }))
  console.info('[contract-loaded-bindings]', {
    phase: input.phase,
    templateVersionId: input.templateVersionId ?? null,
    paragraphIndex: para,
    bindingCount: bindings.length,
    bindings,
  })
}

/**
 * Ensure physical candidate bindings from the live source paragraphs are present
 * on the slot map used for generation. Does not invent values — only spans.
 */
export function syncPhysicalBindingsFromSource(input: {
  slotMap: TemplateSlotMap
  paragraphs: Array<{ index: number; text: string }>
}): { slotMap: TemplateSlotMap; diagnostic: BindingSyncDiagnostic } {
  const existing = input.slotMap.slots
  const inputCount = existing.length
  const existingIds = new Set(
    existing.map(spanIdentity).filter((id): id is string => Boolean(id)),
  )

  const fresh = candidatesToTemplateSlots(
    detectContractCandidates(input.paragraphs),
  ).filter((s) => isSlotPhysicallyBound(s))

  const added: BindingSyncDiagnostic['added'] = []
  const removed: BindingSyncDiagnostic['removed'] = []
  const toMerge: TemplateSlot[] = []

  for (const slot of fresh) {
    const id = spanIdentity(slot)
    if (!id) {
      removed.push({
        registryKey: slot.registryKey ?? '',
        paragraphIndex: slot.paragraphIndex ?? null,
        reason: 'not_physically_bound',
      })
      continue
    }
    if (existingIds.has(id)) {
      removed.push({
        registryKey: slot.registryKey ?? '',
        paragraphIndex: slot.paragraphIndex ?? null,
        reason: 'duplicate_same_span',
      })
      continue
    }
    // Same key+paragraph already physically bound at a different span — keep both
    // (dedupeSlotsByCanonicalKey preserves distinct offsets).
    toMerge.push(slot)
    added.push({
      registryKey: slot.registryKey ?? '',
      paragraphIndex: slot.paragraphIndex ?? null,
      startOffset: slot.startOffset ?? slot.allowedRange?.start ?? null,
      endOffset: slot.endOffset ?? slot.allowedRange?.end ?? null,
      originalSpan: slot.originalText ?? null,
    })
    console.info('[binding-sync]', {
      event: 'added',
      registryKey: slot.registryKey,
      paragraphIndex: slot.paragraphIndex,
      startOffset: slot.startOffset,
      endOffset: slot.endOffset,
      originalSpan: slot.originalText,
      reason: 'fresh_physical_candidate_missing_from_persisted_map',
    })
  }

  const merged = dedupeSlotsByCanonicalKey([...existing, ...toMerge])
  const output = merged.filter((s) => {
    if (s.detectionStatus === 'duplicate_alias') {
      removed.push({
        registryKey: s.registryKey ?? '',
        paragraphIndex: s.paragraphIndex ?? null,
        reason: 'duplicate_same_span',
      })
      console.info('[binding-sync]', {
        event: 'removed',
        registryKey: s.registryKey,
        paragraphIndex: s.paragraphIndex,
        reason: 'duplicate_alias',
      })
      return false
    }
    return true
  })

  const diagnostic: BindingSyncDiagnostic = {
    inputCount,
    outputCount: output.length,
    added,
    removed,
    paragraph36: describePara36(output),
  }

  console.info('[binding-sync-summary]', {
    bindingInputCount: diagnostic.inputCount,
    bindingOutputCount: diagnostic.outputCount,
    addedCount: diagnostic.added.length,
    removedCount: diagnostic.removed.length,
    paragraph36: diagnostic.paragraph36,
  })

  return {
    slotMap: {
      ...input.slotMap,
      slots: output,
    },
    diagnostic,
  }
}
