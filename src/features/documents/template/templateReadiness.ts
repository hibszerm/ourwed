/**
 * Template readiness — only REQUIRED unbound detections block readiness.
 * Registry size and optional/false-positive slots must not drive status.
 */

import {
  classifySlotDetection,
  patternMatchedInDocument,
} from './slotClassification'
import {
  analyzeMoneyPairs,
  moneyPairsBlockReadiness,
} from './contractMoneyPairs'
import { collectUnsafeBoundSlots, isSlotPhysicallyUnsafe } from './contractSlotSafety'
import { runSyntheticTestGenerationGate } from './syntheticTestGenerationGate'
import type { IndexedParagraph } from './extractDocxParagraphs'
import {
  isSlotPhysicallyBound,
  type ContractTemplateLifecycleStatus,
  type TemplateSlot,
  type TemplateSlotCounters,
  type TemplateSlotMap,
} from './types'

export interface UnresolvedSlotIssue {
  registryKey: string
  slotId?: string
  reason: string
  detectionStatus?: string
}

export interface TemplateReadinessReport {
  ready: boolean
  boundCount: number
  unboundCount: number
  issues: UnresolvedSlotIssue[]
  /** Only required unbound keys — used by picker / meta. */
  unresolvedKeys: string[]
  counters: TemplateSlotCounters
  /** Structural review required (e.g. missing party identity). */
  needsReview: boolean
  analysisWarnings: string[]
  /** Fine-grained analysis → generation lifecycle. */
  lifecycleStatus: ContractTemplateLifecycleStatus
  /** Synthetic test-generation gate failure reasons (when run). */
  testGenerationReasons?: string[]
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function isActiveLogicalSlot(slot: TemplateSlot): boolean {
  if (!slot.enabled || !slot.registryKey) return false
  if (slot.dismissedAsNotPresent) return false
  if (slot.variableClassification === 'template_constant') return false
  if (slot.variableClassification === 'ignored_non_variable') return false
  if (slot.detectionStatus === 'duplicate_alias') return false
  if (slot.detectionStatus === 'false_positive') return false
  if (slot.detectionStatus === 'not_present') return false
  // Ambiguous / needs confirmation counts as detected but not bound-required
  return true
}

export function computeSlotCounters(
  slots: TemplateSlot[],
): TemplateSlotCounters {
  const logical = slots.filter(isActiveLogicalSlot)
  let requiredSlotCount = 0
  let optionalSlotCount = 0
  let boundRequiredSlotCount = 0
  let unresolvedRequiredSlotCount = 0
  let ambiguousSlotCount = 0
  let falsePositiveCount = 0
  let safeBindingsCount = 0
  let unsafeBindingsCount = 0
  let itemsRequiringReviewCount = 0
  let needsConfirmationCount = 0

  for (const slot of slots) {
    if (slot.detectionStatus === 'false_positive') falsePositiveCount += 1
    if (slot.detectionStatus === 'ambiguous') ambiguousSlotCount += 1
    if (slot.needsConfirmation || slot.detectionStatus === 'ambiguous') {
      needsConfirmationCount += 1
    }
    if (slot.physicalSpanSafety === 'unsafe' || isSlotPhysicallyUnsafe(slot)) {
      unsafeBindingsCount += 1
      itemsRequiringReviewCount += 1
    } else if (
      slot.needsConfirmation ||
      slot.detectionStatus === 'ambiguous'
    ) {
      itemsRequiringReviewCount += 1
    }
    if (
      (isSlotPhysicallyBound(slot) || slot.detectionStatus === 'bound') &&
      slot.physicalSpanSafety !== 'unsafe' &&
      !isSlotPhysicallyUnsafe(slot)
    ) {
      safeBindingsCount += 1
    }
  }

  for (const slot of logical) {
    const req = slot.requirement ?? 'optional'
    if (req === 'required') requiredSlotCount += 1
    else optionalSlotCount += 1

    if (req !== 'required') continue

    if (isSlotPhysicallyBound(slot) || slot.detectionStatus === 'bound') {
      if (slot.physicalSpanSafety === 'unsafe' || isSlotPhysicallyUnsafe(slot)) {
        unresolvedRequiredSlotCount += 1
      } else {
        boundRequiredSlotCount += 1
      }
    } else {
      unresolvedRequiredSlotCount += 1
    }
  }

  return {
    detectedSlotCount: logical.length,
    requiredSlotCount,
    optionalSlotCount,
    boundRequiredSlotCount,
    unresolvedRequiredSlotCount,
    ambiguousSlotCount,
    falsePositiveCount,
    needsConfirmationCount,
    safeBindingsCount,
    unsafeBindingsCount,
    itemsRequiringReviewCount,
    unresolvedRequiredConceptsCount: unresolvedRequiredSlotCount,
  }
}

/**
 * Apply classification to every slot and attach counters.
 * False positives are kept (disabled) for audit until stripped on save.
 */
export function finalizeSlotMapClassification(
  slotMap: TemplateSlotMap,
  joinedDocumentText = '',
): TemplateSlotMap {
  const slots = slotMap.slots.map((slot) => {
    const classified = classifySlotDetection(slot, {
      patternMatchedInText: slot.registryKey
        ? patternMatchedInDocument(slot.registryKey, joinedDocumentText)
        : false,
    })
    return {
      ...slot,
      requirement: classified.requirement,
      detectionStatus: classified.detectionStatus,
      detectionReason: classified.detectionReason,
      physicallyBound:
        slot.variableClassification === 'template_constant' ||
        slot.variableClassification === 'ignored_non_variable'
          ? false
          : classified.detectionStatus === 'bound'
            ? true
            : slot.physicallyBound === true,
      enabled:
        slot.variableClassification === 'template_constant' ||
        slot.variableClassification === 'ignored_non_variable'
          ? false
          : classified.detectionStatus === 'false_positive' ||
              classified.detectionStatus === 'duplicate_alias' ||
              classified.detectionStatus === 'not_present'
            ? false
            : slot.enabled,
    }
  })

  const counters = computeSlotCounters(slots)
  const unboundRegistryKeys = slots
    .filter(
      (s) =>
        s.registryKey &&
        s.detectionStatus === 'required_unbound' &&
        !s.dismissedAsNotPresent,
    )
    .map((s) => s.registryKey!)

  return {
    ...slotMap,
    slots,
    counters,
    unboundRegistryKeys: [...new Set(unboundRegistryKeys)],
  }
}

/** Drop false-positive / duplicate / dismissed rows before persist. */
export function stripNonDetectedSlots(slotMap: TemplateSlotMap): TemplateSlotMap {
  const slots = slotMap.slots.filter((s) => {
    if (s.dismissedAsNotPresent) return false
    if (s.detectionStatus === 'false_positive') return false
    if (s.detectionStatus === 'duplicate_alias') return false
    if (s.detectionStatus === 'not_present') return false
    return true
  })
  const counters = computeSlotCounters(slots)
  const unboundRegistryKeys = slots
    .filter((s) => s.detectionStatus === 'required_unbound' && s.registryKey)
    .map((s) => s.registryKey!)
  return {
    ...slotMap,
    slots,
    counters,
    unboundRegistryKeys: [...new Set(unboundRegistryKeys)],
  }
}

export function validateTemplateSlotBindings(
  slotMap: TemplateSlotMap,
  options?: {
    paragraphs?: IndexedParagraph[]
    sourceKind?: string
  },
): TemplateReadinessReport {
  const finalized =
    slotMap.counters != null
      ? slotMap
      : finalizeSlotMapClassification(slotMap)
  const counters = finalized.counters ?? computeSlotCounters(finalized.slots)
  const issues: UnresolvedSlotIssue[] = []
  const bound: TemplateSlot[] = []
  const unresolvedKeys: string[] = []
  const sourceKind = options?.sourceKind ?? finalized.sourceKind

  for (const slot of finalized.slots) {
    if (!isActiveLogicalSlot(slot) && slot.detectionStatus !== 'bound') {
      if (!slot.enabled || !slot.registryKey) continue
      if (
        slot.detectionStatus === 'false_positive' ||
        slot.detectionStatus === 'duplicate_alias' ||
        slot.detectionStatus === 'not_present' ||
        slot.dismissedAsNotPresent
      ) {
        continue
      }
    }

    if (!slot.registryKey) continue
    if (
      slot.dismissedAsNotPresent ||
      slot.detectionStatus === 'false_positive' ||
      slot.detectionStatus === 'duplicate_alias' ||
      slot.detectionStatus === 'not_present'
    ) {
      continue
    }
    if (!slot.enabled && slot.detectionStatus !== 'bound') continue

    if (isSlotPhysicallyBound(slot) || slot.detectionStatus === 'bound') {
      if (
        slot.physicalSpanSafety === 'unsafe' ||
        isSlotPhysicallyUnsafe(slot)
      ) {
        unresolvedKeys.push(slot.registryKey)
        issues.push({
          registryKey: slot.registryKey,
          slotId: slot.id,
          detectionStatus: slot.detectionStatus,
          reason:
            slot.spanSafetyMessage ??
            'Physical span is too broad — contains legal wording or multiple entities.',
        })
        continue
      }
      bound.push(slot)
      continue
    }

    if (
      slot.requirement === 'optional' ||
      slot.detectionStatus === 'optional_unbound' ||
      slot.detectionStatus === 'ambiguous'
    ) {
      continue
    }

    if (
      slot.requirement === 'required' ||
      slot.detectionStatus === 'required_unbound'
    ) {
      unresolvedKeys.push(slot.registryKey)
      issues.push({
        registryKey: slot.registryKey,
        slotId: slot.id,
        detectionStatus: slot.detectionStatus,
        reason:
          slot.detectionReason ??
          (slot.paragraphIndex == null
            ? 'Required slot missing paragraph index / physical binding.'
            : 'Required slot has no persisted physical binding.'),
      })
    }
  }

  const byPara = new Map<number, TemplateSlot[]>()
  for (const slot of bound) {
    if (slot.paragraphIndex == null) continue
    const list = byPara.get(slot.paragraphIndex) ?? []
    list.push(slot)
    byPara.set(slot.paragraphIndex, list)
  }
  for (const [para, list] of byPara) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        const ar =
          a.allowedRange ??
          (a.startOffset != null && a.endOffset != null
            ? { start: a.startOffset, end: a.endOffset }
            : null)
        const br =
          b.allowedRange ??
          (b.startOffset != null && b.endOffset != null
            ? { start: b.startOffset, end: b.endOffset }
            : null)
        if (ar && br && rangesOverlap(ar, br)) {
          issues.push({
            registryKey: a.registryKey!,
            slotId: a.id,
            reason: `Overlaps ${b.registryKey} in paragraph ${para}.`,
          })
        }
      }
    }
  }

  const overlapBlocks = issues.some((i) => i.reason.startsWith('Overlaps'))
  const moneyReports = analyzeMoneyPairs({
    slots: finalized.slots,
    paragraphs: options?.paragraphs ?? [],
  })
  const moneyBlocked = moneyPairsBlockReadiness(moneyReports)
  for (const key of moneyBlocked) {
    unresolvedKeys.push(key)
    issues.push({
      registryKey: key,
      reason: `Unsafe financial pair — ${key} must be bound when both numeric and words spans exist.`,
    })
  }

  const unsafeSlots = finalized.slots.filter(
    (s) =>
      s.enabled !== false &&
      s.registryKey &&
      s.variableClassification !== 'template_constant' &&
      s.variableClassification !== 'ignored_non_variable' &&
      (s.physicalSpanSafety === 'unsafe' || isSlotPhysicallyUnsafe(s)),
  )
  for (const s of unsafeSlots) {
    if (issues.some((i) => i.slotId === s.id)) continue
    issues.push({
      registryKey: s.registryKey!,
      slotId: s.id,
      reason:
        s.spanSafetyMessage ??
        'Physical span is too broad — contains legal wording or multiple entities.',
    })
  }
  void collectUnsafeBoundSlots

  const testGenerationReasons: string[] = []
  if (sourceKind === 'pdf') {
    testGenerationReasons.push(
      'PDF analysis is evidence-only — generationReady requires a reviewed DOCX with physical bindings.',
    )
  } else if (
    options?.paragraphs &&
    options.paragraphs.length > 0 &&
    !overlapBlocks &&
    moneyBlocked.length === 0 &&
    unsafeSlots.length === 0 &&
    unresolvedKeys.length === 0 &&
    bound.length > 0
  ) {
    // Only gate when other readiness conditions would otherwise pass
    const gate = runSyntheticTestGenerationGate({
      paragraphs: options.paragraphs,
      slots: finalized.slots,
      sourceKind: sourceKind ?? 'docx',
    })
    if (!gate.ok) {
      testGenerationReasons.push(...gate.reasons)
      for (const reason of gate.reasons.slice(0, 5)) {
        issues.push({
          registryKey: '_test_generation',
          reason,
        })
      }
    }
  }

  const unresolvedRequired = [...new Set(unresolvedKeys)]
  const analysisWarnings = finalized.analysisWarnings ?? []
  const needsReview =
    finalized.analysisStatus === 'needs_review' ||
    analysisWarnings.length > 0 ||
    unsafeSlots.length > 0 ||
    testGenerationReasons.length > 0 ||
    sourceKind === 'pdf'

  const safetyCounters = computeSlotCounters(finalized.slots)

  const ready =
    !overlapBlocks &&
    unresolvedRequired.length === 0 &&
    counters.unresolvedRequiredSlotCount === 0 &&
    bound.length > 0 &&
    !needsReview &&
    moneyBlocked.length === 0 &&
    unsafeSlots.length === 0 &&
    testGenerationReasons.length === 0 &&
    sourceKind !== 'pdf'

  const lifecycleStatus = deriveLifecycleStatus({
    ready,
    needsReview,
    unsafeCount: safetyCounters.unsafeBindingsCount ?? 0,
    reviewCount: safetyCounters.itemsRequiringReviewCount ?? 0,
    unresolvedRequired: unresolvedRequired.length,
    boundCount: bound.length,
    sourceKind,
    analysisWarnings,
  })

  return {
    ready,
    boundCount: bound.length,
    unboundCount: unresolvedRequired.length,
    issues,
    unresolvedKeys: unresolvedRequired,
    needsReview,
    analysisWarnings,
    lifecycleStatus,
    testGenerationReasons:
      testGenerationReasons.length > 0 ? testGenerationReasons : undefined,
    counters: {
      ...counters,
      ...safetyCounters,
      detectedAutomatically:
        counters.detectedAutomatically ?? safetyCounters.detectedSlotCount,
      unresolvedRequiredSlotCount: Math.max(
        counters.unresolvedRequiredSlotCount,
        unresolvedRequired.length,
      ),
      boundRequiredSlotCount: Math.max(
        counters.boundRequiredSlotCount,
        bound.filter((s) => (s.requirement ?? 'optional') === 'required')
          .length,
      ),
      unresolvedRequiredConceptsCount: Math.max(
        safetyCounters.unresolvedRequiredConceptsCount ?? 0,
        unresolvedRequired.length,
      ),
    },
  }
}

export function deriveLifecycleStatus(input: {
  ready: boolean
  needsReview: boolean
  unsafeCount: number
  reviewCount: number
  unresolvedRequired: number
  boundCount: number
  sourceKind?: string
  analysisWarnings: string[]
}): ContractTemplateLifecycleStatus {
  if (input.sourceKind === 'pdf') return 'generation_blocked'
  if (input.unsafeCount > 0 || input.analysisWarnings.length > 0) {
    return 'analysis_requires_review'
  }
  if (input.ready) return 'generation_ready'
  if (input.needsReview || input.reviewCount > 0) {
    return input.boundCount === 0
      ? 'analysis_requires_review'
      : 'generation_requires_configuration'
  }
  if (input.unresolvedRequired > 0) {
    return 'generation_requires_configuration'
  }
  if (input.boundCount === 0) return 'analysis_requires_review'
  return 'analysis_ready'
}
