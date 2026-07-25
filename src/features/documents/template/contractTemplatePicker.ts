/**
 * Shared classification for the Generate Contract template picker.
 * Every template must be selectable, incomplete-with-reason, archived, or reported.
 */

import { parseSlotMap } from '@/features/documents/template/types'
import type {
  DocumentTemplateStatus,
  DocumentTemplateSummary,
} from '@/types/documents'

/** Single source of truth for contract template lifecycle status. */
export type ContractTemplateStatus = DocumentTemplateStatus

export type TemplatePickerBucket =
  | 'selectable'
  | 'incomplete'
  | 'archived'
  | 'other'

export interface TemplatePickerDiagnosis {
  template: DocumentTemplateSummary
  bucket: TemplatePickerBucket
  /** Human-readable reason for include/exclude. */
  reason: string
  unresolvedSlotCount: number
  boundSlotCount: number
  requiredSlotCount: number
  detectedSlotCount: number
  hasSource: boolean
}

export interface TemplatePickerClassification {
  selectable: TemplatePickerDiagnosis[]
  incomplete: TemplatePickerDiagnosis[]
  archived: TemplatePickerDiagnosis[]
  other: TemplatePickerDiagnosis[]
  diagnoses: TemplatePickerDiagnosis[]
}

function unresolvedRequiredCount(template: DocumentTemplateSummary): number {
  const fromCounters = template.meta?.slotCounters?.unresolvedRequiredSlotCount
  if (typeof fromCounters === 'number') return fromCounters
  const fromMeta = template.meta?.unresolvedSlotKeys?.length
  if (typeof fromMeta === 'number') return fromMeta
  return 0
}

function requiredSlotCount(template: DocumentTemplateSummary): number {
  const fromCounters = template.meta?.slotCounters?.requiredSlotCount
  if (typeof fromCounters === 'number') return fromCounters
  return (
    (template.meta?.slotCounters?.boundRequiredSlotCount ?? 0) +
    unresolvedRequiredCount(template)
  )
}

function detectedSlotCount(template: DocumentTemplateSummary): number {
  const fromCounters = template.meta?.slotCounters?.detectedSlotCount
  if (typeof fromCounters === 'number') return fromCounters
  return template.variableCount
}

function boundCount(template: DocumentTemplateSummary): number {
  if (typeof template.safeBindingCount === 'number' && template.safeBindingCount > 0) {
    return template.safeBindingCount
  }
  const meta = template.meta
  if (!meta) return 0
  if (typeof meta.safeBindingCount === 'number' && meta.safeBindingCount > 0) {
    return meta.safeBindingCount
  }
  const fromCounters = meta.slotCounters?.safeBindingsCount
  if (typeof fromCounters === 'number' && fromCounters > 0) return fromCounters
  const rows = [
    ...(meta.coupleVariables ?? []),
    ...(meta.studioVariables ?? []),
    ...(meta.packageVariables ?? []),
  ]
  const bound = rows.filter((r) => r.physicallyBound === true).length
  if (bound > 0) return bound
  return meta.slotCounters?.boundRequiredSlotCount ?? 0
}

function diagnose(template: DocumentTemplateSummary): TemplatePickerDiagnosis {
  const hasSource = Boolean(template.sourceDocxPath)
  const unresolvedSlotCount = unresolvedRequiredCount(template)
  const boundSlotCount = boundCount(template)
  const required = requiredSlotCount(template)
  const detected = detectedSlotCount(template)
  const bindingsReady = template.meta?.slotBindingsReady

  const logBase = {
    id: template.id,
    name: template.name,
    status: template.status,
    isActive: template.status !== 'archived',
    userId: template.userId,
    organizationId: null,
    packageType: template.category,
    sourceFileType: template.sourceFileName?.split('.').pop() ?? null,
    detectedSlotCount: detected,
    requiredSlotCount: required,
    boundSlots: boundSlotCount,
    unresolvedRequiredSlots: unresolvedSlotCount,
    createdAt: template.createdAt,
    docType: template.docType,
    variableCount: template.variableCount,
    currentVersionId: template.currentVersionId,
    sourceDocxPath: template.sourceDocxPath,
    slotBindingsReady: bindingsReady ?? null,
  }

  const finish = (
    bucket: TemplatePickerBucket,
    reason: string,
  ): TemplatePickerDiagnosis => {
    const result =
      bucket === 'selectable'
        ? 'INCLUDED'
        : bucket === 'incomplete'
          ? 'INCOMPLETE'
          : bucket === 'archived'
            ? 'ARCHIVED'
            : 'EXCLUDED'
    console.info('[contract-template-picker]', {
      ...logBase,
      result,
      reason,
    })
    return {
      template,
      bucket,
      reason,
      unresolvedSlotCount,
      boundSlotCount,
      requiredSlotCount: required,
      detectedSlotCount: detected,
      hasSource,
    }
  }

  if (template.summaryStale) {
    return finish(
      'incomplete',
      'Persisted analysis summary is stale — requires explicit reanalysis (Wymaga ponownej analizy)',
    )
  }

  if (template.status === 'archived') {
    return finish('archived', 'status is "archived"')
  }

  if (template.docType !== 'contract') {
    return finish(
      'other',
      `docType is "${template.docType}" (picker shows contracts only)`,
    )
  }

  if (!template.currentVersionId) {
    return finish(
      'incomplete',
      'current_version_id is null — active version was not assigned',
    )
  }

  if (!hasSource) {
    return finish(
      'incomplete',
      'original source file path is missing (sourceDocxPath)',
    )
  }

  if (template.status === 'needs_review') {
    return finish(
      'incomplete',
      template.meta?.analysisWarnings?.[0] ??
        'status is "needs_review" — party identity or analysis completeness requires review',
    )
  }

  if (template.status === 'incomplete') {
    return finish(
      'incomplete',
      unresolvedSlotCount > 0
        ? `status is "incomplete" because ${unresolvedSlotCount} required detected slot${
            unresolvedSlotCount === 1 ? ' is' : 's are'
          } unbound`
        : 'status is "incomplete"',
    )
  }

  if (template.status === 'draft') {
    if (bindingsReady === true && boundSlotCount > 0) {
      return finish(
        'selectable',
        'status is "draft" but slotBindingsReady=true — treating as selectable',
      )
    }
    if (template.aiAnalyzedAt) {
      return finish(
        'incomplete',
        bindingsReady === false
          ? `status is "draft" after analysis; ${unresolvedSlotCount} required detected slots unbound`
          : 'status is "draft" after analysis — not marked ready',
      )
    }
    return finish('incomplete', 'status is "draft" (not analyzed yet)')
  }

  if (template.status !== 'ready') {
    return finish(
      'other',
      `status is "${template.status}" (not ready/incomplete/draft/archived)`,
    )
  }

  if (bindingsReady === false) {
    return finish(
      'incomplete',
      unresolvedSlotCount > 0
        ? `status is "ready" but ${unresolvedSlotCount} required detected slots are unbound`
        : 'status is "ready" but meta.slotBindingsReady is false',
    )
  }

  if (boundSlotCount <= 0 && detected <= 0) {
    return finish(
      'incomplete',
      'status is "ready" but no bound slots / detected slots is 0',
    )
  }

  return finish(
    'selectable',
    'status is "ready", source exists, required slots bound',
  )
}

/**
 * Classify all templates for the Generate Contract picker.
 * Never silently drops a row — every template gets a logged reason.
 */
export function classifyTemplatesForGeneration(
  templates: DocumentTemplateSummary[],
): TemplatePickerClassification {
  console.info(
    '[contract-template-picker] classifying',
    templates.length,
    'templates from query',
  )

  const diagnoses = templates.map(diagnose)
  const selectable = diagnoses.filter((d) => d.bucket === 'selectable')
  const incomplete = diagnoses.filter((d) => d.bucket === 'incomplete')
  const archived = diagnoses.filter((d) => d.bucket === 'archived')
  const other = diagnoses.filter((d) => d.bucket === 'other')

  console.info('[contract-template-picker] summary', {
    selectable: selectable.length,
    incomplete: incomplete.length,
    archived: archived.length,
    other: other.length,
  })

  return { selectable, incomplete, archived, other, diagnoses }
}

/** Optional package/category recommendation — never hides templates. */
export function splitRecommended(
  selectable: TemplatePickerDiagnosis[],
  weddingPackageName: string | null | undefined,
): {
  recommended: TemplatePickerDiagnosis[]
  other: TemplatePickerDiagnosis[]
} {
  const needle = weddingPackageName?.trim().toLowerCase()
  if (!needle) {
    return { recommended: [], other: selectable }
  }
  const recommended: TemplatePickerDiagnosis[] = []
  const other: TemplatePickerDiagnosis[] = []
  for (const row of selectable) {
    const cat = row.template.category?.trim().toLowerCase() ?? ''
    if (cat && (needle.includes(cat) || cat.includes(needle))) {
      recommended.push(row)
    } else {
      other.push(row)
    }
  }
  if (recommended.length === 0) {
    return { recommended: [], other: selectable }
  }
  return { recommended, other }
}

/** Bound slot count from a raw slot_map (for tests / diagnostics). */
export function countBoundSlotsFromSlotMap(raw: unknown): number {
  const map = parseSlotMap(raw)
  return map.slots.filter((s) => s.enabled && s.physicallyBound).length
}
