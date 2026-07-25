/**
 * User actions on template slot configuration (required/optional / not present).
 * Does not re-run AI — updates persisted slot_map atomically and recalculates readiness.
 */

import { documentStorage } from '@/lib/api/documents/storage'
import { documentTemplateService } from '@/lib/api/documents'
import { supabase } from '@/lib/supabase'
import { throwOnError } from '@/lib/supabase/helpers'
import {
  CONTRACT_ANALYSIS_VERSION,
  CONTRACT_READINESS_VERSION,
} from '@/features/documents/performance/analysisVersions'
import { saveTemplateSlots } from './saveTemplateSlots'
import {
  computeSlotCounters,
  validateTemplateSlotBindings,
} from './templateReadiness'
import {
  parseSlotMap,
  type TemplateSlot,
  type TemplateSlotMap,
  type TemplateSlotRequirement,
} from './types'

export type SlotConfigAction =
  | { type: 'set_requirement'; requirement: TemplateSlotRequirement }
  | { type: 'mark_not_present' }
  | { type: 'mark_optional' }
  | { type: 'confirm' }
  | { type: 'link_to_company' }
  | { type: 'keep_immutable' }

export interface UpdateTemplateSlotConfigResult {
  slotMap: TemplateSlotMap
  status: 'ready' | 'incomplete' | 'draft'
  unresolvedKeys: string[]
}

function applyAction(slot: TemplateSlot, action: SlotConfigAction): TemplateSlot {
  if (action.type === 'mark_not_present') {
    return {
      ...slot,
      dismissedAsNotPresent: true,
      detectionStatus: 'not_present',
      enabled: false,
      detectionReason: 'Marked as not present in this contract by the user.',
      requirement: 'optional',
      needsConfirmation: false,
    }
  }
  if (action.type === 'keep_immutable') {
    return {
      ...slot,
      variableClassification: 'template_constant',
      enabled: false,
      physicallyBound: false,
      needsConfirmation: false,
      requirement: 'optional',
      detectionStatus: 'optional_unbound',
      detectionReason:
        'Dane usługodawcy pozostają tekstem szablonu (bez podmiany).',
      canLinkToCompany:
        slot.physicalSpanSafety === 'safe' && slot.sourceHint === 'company',
    }
  }
  if (action.type === 'link_to_company') {
    if (
      slot.physicalSpanSafety === 'unsafe' ||
      (slot.spanSafetyReasons && slot.spanSafetyReasons.length > 0) ||
      slot.canLinkToCompany === false
    ) {
      return {
        ...slot,
        variableClassification: 'template_constant',
        enabled: false,
        physicallyBound: false,
        needsConfirmation: false,
        detectionReason:
          slot.spanSafetyMessage ??
          'Nie można powiązać niebezpiecznego zakresu z danymi firmy.',
      }
    }
    return {
      ...slot,
      variableClassification: 'dynamic_candidate',
      enabled: true,
      physicallyBound: Boolean(
        slot.originalText ||
          slot.allowedRange ||
          (slot.startOffset != null && slot.endOffset != null),
      ),
      needsConfirmation: false,
      requirement: slot.requirement ?? 'optional',
      detectionStatus: 'bound',
      detectionReason:
        'Powiązano z danymi firmy OurWed — wartość będzie podmieniana przy generacji.',
      canLinkToCompany: false,
    }
  }
  if (action.type === 'confirm') {
    if (
      slot.physicalSpanSafety === 'unsafe' ||
      (slot.spanSafetyReasons && slot.spanSafetyReasons.length > 0)
    ) {
      return {
        ...slot,
        needsConfirmation: true,
        physicallyBound: false,
        detectionStatus: 'ambiguous',
        detectionReason:
          slot.spanSafetyMessage ??
          'Zakres jest zbyt szeroki — nie można potwierdzić niebezpiecznego slotu.',
      }
    }
    return {
      ...slot,
      needsConfirmation: false,
      physicallyBound:
        slot.physicallyBound ||
        Boolean(
          slot.originalText ||
            slot.allowedRange ||
            (slot.startOffset != null && slot.endOffset != null),
        ),
      detectionStatus:
        slot.physicallyBound || slot.originalText
          ? 'bound'
          : slot.requirement === 'required'
            ? 'required_unbound'
            : 'optional_unbound',
      detectionReason: 'Confirmed by the user during configuration.',
      confidence: Math.max(slot.confidence ?? 0, 0.9),
    }
  }
  if (action.type === 'mark_optional' || action.type === 'set_requirement') {
    const requirement =
      action.type === 'mark_optional' ? 'optional' : action.requirement
    const bound = slot.physicallyBound === true
    return {
      ...slot,
      requirement,
      dismissedAsNotPresent: false,
      needsConfirmation: false,
      detectionStatus: bound
        ? 'bound'
        : requirement === 'required'
          ? 'required_unbound'
          : 'optional_unbound',
      enabled: true,
      detectionReason:
        requirement === 'optional'
          ? 'Marked optional by the user — does not block readiness while unbound.'
          : bound
            ? 'Physical paragraph span is bound.'
            : 'Marked required by the user — must be physically bound.',
    }
  }
  return slot
}

async function persistSlotMapOnly(input: {
  templateId: string
  templateVersionId: string
  slotMap: TemplateSlotMap
}): Promise<UpdateTemplateSlotConfigResult> {
  const readiness = validateTemplateSlotBindings(input.slotMap)
  const finalMap: TemplateSlotMap = {
    ...input.slotMap,
    counters: readiness.counters,
    unboundRegistryKeys: readiness.unresolvedKeys,
    slots: input.slotMap.slots.filter(
      (s) =>
        !s.dismissedAsNotPresent &&
        s.detectionStatus !== 'not_present' &&
        s.detectionStatus !== 'false_positive' &&
        s.detectionStatus !== 'duplicate_alias',
    ),
  }
  finalMap.counters = computeSlotCounters(finalMap.slots)

  const { error } = await supabase
    .from('document_template_versions')
    .update({ slot_map: finalMap })
    .eq('id', input.templateVersionId)
  throwOnError(error)

  let status: 'ready' | 'incomplete' | 'draft' = readiness.ready
    ? 'ready'
    : 'incomplete'

  const meta = {
    version: 1 as const,
    slotBindingsReady: readiness.ready,
    unresolvedSlotKeys: readiness.unresolvedKeys,
    unresolvedSlotReasons: readiness.issues
      .filter((i) => readiness.unresolvedKeys.includes(i.registryKey))
      .map((i) => ({ key: i.registryKey, reason: i.reason })),
    slotCounters: readiness.counters,
    generationReady: readiness.ready,
    safeBindingCount:
      readiness.counters.safeBindingsCount ??
      finalMap.counters?.safeBindingsCount ??
      0,
    unsafeBindingCount: readiness.counters.unsafeBindingsCount ?? 0,
    unresolvedCount: readiness.counters.unresolvedRequiredSlotCount,
    requiredMissingCount: readiness.counters.unresolvedRequiredSlotCount,
    emptyPlaceholderCount: finalMap.slots.filter(
      (s) =>
        s.needsConfirmation === true && !(s.originalText ?? '').trim(),
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
      })),
  }

  try {
    await documentTemplateService.update(input.templateId, {
      status,
      meta,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (status === 'incomplete' && /incomplete|check|violat/i.test(message)) {
      status = 'draft'
      await documentTemplateService.update(input.templateId, {
        status: 'draft',
        meta,
      })
    } else {
      throw err
    }
  }

  return {
    slotMap: finalMap,
    status,
    unresolvedKeys: readiness.unresolvedKeys,
  }
}

export async function updateTemplateSlotConfig(input: {
  templateId: string
  slotId: string
  action: SlotConfigAction
}): Promise<UpdateTemplateSlotConfigResult> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu.')
  const versionId = template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')
  const version = await documentTemplateService.getVersion(versionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')

  const map = parseSlotMap(version.slotMap)
  const slots = map.slots.map((s) =>
    s.id === input.slotId ? applyAction(s, input.action) : s,
  )
  const next: TemplateSlotMap = { ...map, slots }

  return persistSlotMapOnly({
    templateId: input.templateId,
    templateVersionId: version.id,
    slotMap: next,
  })
}

/**
 * Re-save with full DOCX placeholder pass after binding changes.
 */
export async function resaveTemplateSlotsFromVersion(input: {
  templateId: string
  slotMap: TemplateSlotMap
}): Promise<UpdateTemplateSlotConfigResult> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu.')
  const versionId = template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')
  const version = await documentTemplateService.getVersion(versionId)
  if (!version?.sourceDocxPath) {
    throw new Error('Brak oryginalnego pliku umowy.')
  }
  const sourceBytes = await documentStorage.download(version.sourceDocxPath)
  const saved = await saveTemplateSlots({
    templateId: input.templateId,
    templateVersionId: version.id,
    versionNumber: version.versionNumber,
    sourceBytes,
    slotMap: input.slotMap,
    documentTitle: template.name,
    skipReclassify: true,
  })
  return {
    slotMap: saved.slotMap,
    status: saved.status === 'ready' ? 'ready' : 'incomplete',
    unresolvedKeys: saved.unresolvedKeys,
  }
}

/** Slots that need user attention in the configuration UI. */
export function slotsNeedingConfiguration(slotMap: TemplateSlotMap): TemplateSlot[] {
  return slotMap.slots.filter((s) => {
    if (!s.registryKey) return false
    if (s.dismissedAsNotPresent) return false
    if (s.detectionStatus === 'false_positive') return false
    if (s.detectionStatus === 'duplicate_alias') return false
    // Immutable provider text is shown in a separate info section
    if (
      s.variableClassification === 'template_constant' ||
      s.variableClassification === 'ignored_non_variable'
    ) {
      return false
    }
    if (!s.enabled) return false
    if (s.physicalSpanSafety === 'unsafe') return true
    if (s.needsConfirmation || s.detectionStatus === 'ambiguous') return true
    if (s.physicallyBound || s.detectionStatus === 'bound') return false
    return (
      s.detectionStatus === 'required_unbound' ||
      s.detectionStatus === 'optional_unbound' ||
      (s.requirement === 'required' && !s.physicallyBound)
    )
  })
}

/** Provider-side immutable detections for the config info panel. */
export function providerImmutableSlots(slotMap: TemplateSlotMap): TemplateSlot[] {
  return slotMap.slots.filter(
    (s) =>
      s.sourceHint === 'company' &&
      (s.variableClassification === 'template_constant' ||
        s.variableClassification === 'ignored_non_variable'),
  )
}
