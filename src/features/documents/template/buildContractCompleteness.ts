/**
 * Completeness report — VariableResolver only; UI asks solely for unresolved keys.
 */

import { documentTemplateService } from '@/lib/api/documents'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import type { PackageSnapshot } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import {
  resolveContractVariables,
  sourceLabel,
  type VariableDataSource,
} from './resolveContractVariables'
import { parseSlotMap, type TemplateSlot, type TemplateSlotMap } from './types'

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
  questionnaireAnswers?: Record<string, string>
  packageSnapshot?: PackageSnapshot
  overrides?: Record<string, string>
}): Promise<ContractCompletenessReport> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu umowy.')

  const versionId = template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')

  const version = await documentTemplateService.getVersion(versionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')

  const slotMap = parseSlotMap(version.slotMap)

  const ctx = await resolveContractVariables({
    wedding: input.wedding,
    overrides: input.overrides,
    questionnaireAnswers: input.questionnaireAnswers,
  })

  const enabledSlots = slotMap.slots.filter(
    (s) => s.enabled && Boolean(s.registryKey),
  )

  const fields: CompletenessField[] = enabledSlots.map((slot) => {
    const registryKey = slot.registryKey!
    const meta = ctx.lookup(registryKey)
    return {
      slotId: slot.id,
      registryKey,
      label: labelForSlot(slot),
      group: groupForSlot(slot),
      value: meta.value,
      missing: meta.missing,
      source: meta.source,
      sourceLabel: sourceLabel(meta.source),
    }
  })

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

  return {
    templateId: template.id,
    templateName: template.name,
    slotMap,
    resolved: ctx.resolved,
    packageSnapshot: input.packageSnapshot ?? ctx.packageSnapshot,
    questionnaireAnswers: ctx.questionnaireAnswers,
    groups,
    fields,
    missing,
    allComplete: missing.length === 0,
  }
}
