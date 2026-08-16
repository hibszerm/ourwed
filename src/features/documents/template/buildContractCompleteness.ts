/**
 * Completeness report — VariableResolver only; UI asks solely for unresolved keys.
 */

import { documentStorage, documentTemplateService } from '@/lib/api/documents'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { PackageSnapshot } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import {
  resolveContractVariables,
  sourceLabel,
  type VariableDataSource,
} from './resolveContractVariables'
import {
  isSystemAutoResolvedContractKey,
} from './contractExecutionContext'
import { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
import {
  collapseCompletenessFieldsByRegistryKey,
  logLogicalFieldModel,
  normalizeSlotMap,
} from './logicalContractFields'
import { parseSlotMap, type TemplateSlot, type TemplateSlotMap } from './types'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type CompletenessGroupId =
  | 'company'
  | 'package'
  | 'wedding'
  | 'couple'
  | 'other'

export interface CompletenessField {
  slotId: string
  registryKey: string
  label: string
  group: CompletenessGroupId
  value: string
  missing: boolean
  source: VariableDataSource
  sourceLabel: string
  /** Optional input placeholder for generation review. */
  placeholder?: string
}

export interface CompletenessGroup {
  id: CompletenessGroupId
  label: string
  complete: boolean
  fields: CompletenessField[]
}

export interface ContractCompletenessReport {
  templateId: string
  templateName: string
  slotMap: TemplateSlotMap
  resolved: Record<string, string>
  packageSnapshot: PackageSnapshot
  questionnaireAnswers: Record<string, string>
  /** Canonical source paragraphs from the active template version (for preflight). */
  sourceParagraphs: Array<{ index: number; text: string }>
  groups: CompletenessGroup[]
  /** All template variables with resolution status. */
  fields: CompletenessField[]
  missing: CompletenessField[]
  allComplete: boolean
}

const GROUP_LABEL: Record<CompletenessGroupId, string> = {
  company: 'Firma',
  package: 'Pakiet',
  wedding: 'Ślub',
  couple: 'Para',
  other: 'Inne',
}

function groupForSlot(slot: TemplateSlot): CompletenessGroupId {
  if (slot.sourceHint === 'company') return 'company'
  if (slot.sourceHint === 'package') return 'package'
  if (slot.sourceHint === 'wedding') return 'wedding'
  if (slot.sourceHint === 'couple') return 'couple'
  const key = slot.registryKey ?? ''
  if (key.startsWith('company_') || key.startsWith('studio_')) return 'company'
  if (key.startsWith('package_') || key.startsWith('pkg_')) return 'package'
  if (
    key.startsWith('wedding_') ||
    key.includes('ceremony') ||
    key.includes('reception') ||
    key.includes('preparation')
  ) {
    return 'wedding'
  }
  if (
    key.startsWith('bride_') ||
    key.startsWith('groom_') ||
    key.startsWith('couple_')
  ) {
    return 'couple'
  }
  const def = slot.registryKey
    ? SystemVariableRegistry.get(slot.registryKey)
    : undefined
  if (def?.category === 'company') return 'company'
  if (def?.category === 'package') return 'package'
  if (def?.category === 'wedding') return 'wedding'
  if (def?.category === 'couple') return 'couple'
  return 'other'
}

function labelForSlot(slot: TemplateSlot): string {
  if (slot.label.trim()) return slot.label.trim()
  if (slot.registryKey) {
    return SystemVariableRegistry.label(slot.registryKey)
  }
  return slot.id
}

/** @deprecated Prefer resolveContractVariables — kept for older imports. */
export { weddingValuesFromWedding } from './resolveContractVariables'

export async function buildContractCompletenessReport(input: {
  wedding: Wedding
  templateId: string
  /** Prefer the package-pinned version when present (same as generation). */
  templateVersionId?: string | null
  questionnaireAnswers?: Record<string, string>
  packageSnapshot?: PackageSnapshot
  overrides?: Record<string, string>
  /** Stable generation instant — created once when the user starts generation. */
  generationStartedAt?: Date | string | null
}): Promise<ContractCompletenessReport> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu umowy.')

  const versionId = input.templateVersionId ?? template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')

  const version = await documentTemplateService.getVersion(versionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')

  // Authoritative persisted bindings only — same set generation must consume.
  const slotMap = normalizeSlotMap(parseSlotMap(version.slotMap))
  logLogicalFieldModel('completeness-persisted', slotMap.slots)

  const ctx = await resolveContractVariables({
    wedding: input.wedding,
    overrides: input.overrides,
    questionnaireAnswers: input.questionnaireAnswers,
    generationStartedAt: input.generationStartedAt,
  })

  const enabledSlots = slotMap.slots.filter(
    (s) => s.enabled && Boolean(s.registryKey),
  )

  // One CompletenessField per physical slot first, then collapse to one logical
  // row per registryKey (N physical bindings remain on slotMap for the renderer).
  const fields: CompletenessField[] = collapseCompletenessFieldsByRegistryKey(
    enabledSlots.map((slot) => {
      const registryKey = slot.registryKey!
      const meta = ctx.lookup(registryKey)
      const systemAuto = isSystemAutoResolvedContractKey(registryKey)
      return {
        slotId: slot.id,
        registryKey,
        label: labelForSlot(slot),
        group: groupForSlot(slot),
        value: meta.value,
        // System auto values are never manual-required, even if empty (technical error later)
        missing: systemAuto ? false : meta.missing,
        source: systemAuto ? 'system' : meta.source,
        sourceLabel: sourceLabel(systemAuto ? 'system' : meta.source),
      }
    }),
  )

  const order: CompletenessGroupId[] = [
    'company',
    'package',
    'wedding',
    'couple',
    'other',
  ]
  const groups: CompletenessGroup[] = order
    .map((id) => {
      const groupFields = fields.filter((f) => f.group === id)
      return {
        id,
        label: GROUP_LABEL[id],
        complete:
          groupFields.length === 0 || groupFields.every((f) => !f.missing),
        fields: groupFields,
      }
    })
    .filter((g) => g.fields.length > 0)

  const missing = fields.filter((f) => f.missing)

  let sourceParagraphs: Array<{ index: number; text: string }> = []
  if (version.sourceDocxPath) {
    try {
      const bytes = await documentStorage.download(version.sourceDocxPath)
      const paras = await extractDocxParagraphsIncludingEmpty(bytes)
      sourceParagraphs = paras.map((p) => ({ index: p.index, text: p.text }))
    } catch {
      sourceParagraphs = []
    }
  }
  // Fallback: reconstruct prose cues from bound slots when DOCX download fails.
  if (sourceParagraphs.length === 0) {
    const byIndex = new Map<number, string>()
    for (const slot of slotMap.slots) {
      if (slot.paragraphIndex == null) continue
      const cue =
        slot.sampleContext?.trim() ||
        (slot.originalText
          ? `${slot.leftAnchor ?? ''}${slot.originalText}${slot.rightAnchor ?? ''}`
          : '')
      if (!cue) continue
      const prev = byIndex.get(slot.paragraphIndex) ?? ''
      if (cue.length > prev.length) byIndex.set(slot.paragraphIndex, cue)
    }
    sourceParagraphs = [...byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, text]) => ({ index, text }))
  }

  const DEV =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  if (DEV) {
    devInfoArgs('[contract-execution-date-resolution]', {
      phase: 'completeness',
      generationStartedAt: ctx.generationStartedAt.toISOString(),
      resolvedShort: ctx.resolved.contract_execution_date ?? null,
      resolvedLong: ctx.resolved.contract_execution_date_long ?? null,
      includedInManualFields: fields.some(
        (f) =>
          isSystemAutoResolvedContractKey(f.registryKey) &&
          f.missing,
      ),
      includedInMissingVariables: missing.some((f) =>
        isSystemAutoResolvedContractKey(f.registryKey),
      ),
      source: 'generation_context',
    })
  }

  return {
    templateId: template.id,
    templateName: template.name,
    slotMap,
    resolved: ctx.resolved,
    packageSnapshot: input.packageSnapshot ?? ctx.packageSnapshot,
    questionnaireAnswers: ctx.questionnaireAnswers,
    sourceParagraphs,
    groups,
    fields,
    missing,
    allComplete: missing.length === 0,
  }
}
