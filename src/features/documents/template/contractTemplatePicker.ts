/**
 * Shared classification for the Generate Contract template picker.
 * Every template must be selectable, incomplete-with-reason, archived, or reported.
 *
 * Usability is delegated to isTemplateUsableForGeneration — the same rule as
 * global Umowy cards / detail. Package/type matching only ranks, never hides.
 */

import { parseSlotMap } from '@/features/documents/template/types'
import { isTemplateUsableForGeneration } from './templateGenerationReadiness'
import { automaticStatusFromTemplate } from './automaticTemplateReadiness'
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
  const productStatus = automaticStatusFromTemplate(template)

  const finish = (
    bucket: TemplatePickerBucket,
    reason: string,
  ): TemplatePickerDiagnosis => ({
    template,
    bucket,
    reason,
    unresolvedSlotCount,
    boundSlotCount,
    requiredSlotCount: required,
    detectedSlotCount: detected,
    hasSource,
  })

  if (template.status === 'archived') {
    return finish('archived', 'status is "archived"')
  }

  if (template.docType !== 'contract') {
    return finish(
      'other',
      `docType is "${template.docType}" (picker shows contracts only)`,
    )
  }

  if (template.summaryStale) {
    return finish(
      'incomplete',
      'Persisted analysis summary is stale — requires explicit reanalysis',
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

  if (productStatus === 'error') {
    return finish('incomplete', 'Błąd analizy — szablon nie może być użyty.')
  }

  if (productStatus === 'analyzing') {
    return finish('incomplete', 'Szablon jest jeszcze analizowany.')
  }

  // Authoritative product rule — same as global "Gotowy".
  // Does NOT require status===ready, slotBindingsReady, or generationReady.
  if (isTemplateUsableForGeneration(template)) {
    return finish(
      'selectable',
      productStatus === 'ready'
        ? 'Szablon jest gotowy do generowania (isTemplateUsableForGeneration).'
        : 'Szablon użyteczny mimo miękkich uwag generacyjnych (isTemplateUsableForGeneration).',
    )
  }

  if (
    template.meta.fieldConfigurationStatus == null &&
    !template.meta.fieldConfiguration &&
    !template.aiAnalyzedAt
  ) {
    return finish(
      'incomplete',
      'Szablon wymaga analizy przed generowaniem umowy.',
    )
  }

  return finish(
    'incomplete',
    'Szablon nie spełnia warunków użyteczności do generowania (isTemplateUsableForGeneration=false).',
  )
}

/**
 * Classify all templates for the Generate Contract picker.
 * Never silently drops a row — every template gets a logged reason.
 */
export function classifyTemplatesForGeneration(
  templates: DocumentTemplateSummary[],
): TemplatePickerClassification {
  const diagnoses = templates.map(diagnose)
  const selectable = diagnoses.filter((d) => d.bucket === 'selectable')
  const incomplete = diagnoses.filter((d) => d.bucket === 'incomplete')
  const archived = diagnoses.filter((d) => d.bucket === 'archived')
  const other = diagnoses.filter((d) => d.bucket === 'other')

  return { selectable, incomplete, archived, other, diagnoses }
}

export type TemplateRecommendationContext = {
  packageName?: string | null
  packageId?: string | null
  /** foto | video | foto_video | other */
  serviceType?: string | null
}

function scoreTemplateRecommendation(
  template: DocumentTemplateSummary,
  ctx: TemplateRecommendationContext,
): number {
  let score = 0
  const packageId = ctx.packageId?.trim()
  if (
    packageId &&
    template.meta.associatedPackageId &&
    template.meta.associatedPackageId === packageId
  ) {
    score += 1000
  }
  const needle = ctx.packageName?.trim().toLowerCase()
  const cat = template.category?.trim().toLowerCase() ?? ''
  const name = template.name.trim().toLowerCase()
  if (needle) {
    if (cat && (needle.includes(cat) || cat.includes(needle))) score += 400
    if (name.includes(needle) || needle.includes(name)) score += 200
  }
  const wanted = ctx.serviceType?.trim().toLowerCase()
  const type = template.meta.templateServiceType
  if (wanted && type) {
    if (wanted === type) score += 300
    else if (
      (wanted === 'foto' || wanted === 'video') &&
      type === 'foto_video'
    ) {
      score += 120
    }
  }
  const updated = Date.parse(template.updatedAt)
  if (Number.isFinite(updated)) {
    score += Math.min(80, Math.floor((updated - 1_700_000_000_000) / 86_400_000))
  }
  score += Math.min(40, template.usageCount ?? 0)
  return score
}

/**
 * Rank selectable templates for a wedding.
 * Order: exact package → type match → recently used → general.
 * Never hides templates.
 */
export function splitRecommended(
  selectable: TemplatePickerDiagnosis[],
  weddingPackageName: string | null | undefined,
  context?: TemplateRecommendationContext,
): {
  recommended: TemplatePickerDiagnosis[]
  other: TemplatePickerDiagnosis[]
} {
  const ctx: TemplateRecommendationContext = {
    packageName: context?.packageName ?? weddingPackageName,
    packageId: context?.packageId ?? null,
    serviceType: context?.serviceType ?? null,
  }
  if (selectable.length === 0) {
    return { recommended: [], other: [] }
  }
  const ranked = [...selectable].sort(
    (a, b) =>
      scoreTemplateRecommendation(b.template, ctx) -
      scoreTemplateRecommendation(a.template, ctx),
  )
  const hasSignal = Boolean(
    ctx.packageId?.trim() ||
      ctx.packageName?.trim() ||
      ctx.serviceType?.trim(),
  )
  if (!hasSignal) {
    return { recommended: [], other: ranked }
  }
  const bestScore = scoreTemplateRecommendation(ranked[0]!.template, ctx)
  if (bestScore < 100) {
    return { recommended: [], other: ranked }
  }
  const recommended = ranked.filter(
    (row) => scoreTemplateRecommendation(row.template, ctx) >= bestScore * 0.85,
  )
  const recommendedIds = new Set(recommended.map((r) => r.template.id))
  const other = ranked.filter((row) => !recommendedIds.has(row.template.id))
  return { recommended, other }
}

/** Bound slot count from a raw slot_map (for tests / diagnostics). */
export function countBoundSlotsFromSlotMap(raw: unknown): number {
  const map = parseSlotMap(raw)
  return map.slots.filter((s) => s.enabled && s.physicallyBound).length
}
