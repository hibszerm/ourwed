/**
 * Authoritative template usability for contract generation.
 *
 * Global Umowy cards, template detail, wedding picker, and generation service
 * MUST all use isTemplateUsableForGeneration — never duplicate filters.
 */

import type { DocumentTemplateSummary } from '@/types/documents'
import { automaticStatusFromTemplate } from './automaticTemplateReadiness'

export type GenerationReadinessOptions = {
  /**
   * Explicit compatibility escape hatch for templates created before field
   * configuration existed. New contract flows should leave this false.
   */
  allowLegacyWithoutFieldConfiguration?: boolean
}

export type TemplateUsabilityInput = Pick<
  DocumentTemplateSummary,
  'status' | 'meta'
> & {
  id?: string
  docType?: DocumentTemplateSummary['docType']
  generationReady?: boolean
  aiAnalyzedAt?: string | null
  sourceDocxPath?: string | null
  currentVersionId?: string | null
  variableCount?: number
  summaryStale?: boolean
}

/**
 * Single readiness rule for whether a contract template can be used to generate.
 *
 * Usable when:
 * - not archived / not stale summary requiring reanalysis,
 * - source DOCX exists,
 * - current version exists,
 * - automatic product readiness is ready (or equivalent healed state),
 * - no fatal analysis/source error.
 *
 * Explicitly does NOT require:
 * - status === 'ready'
 * - slotBindingsReady === true
 * - generationReady === true
 * - configurationCompleted / mappingCompleted legacy flags
 */
export function isTemplateUsableForGeneration(
  template: TemplateUsabilityInput,
  options: GenerationReadinessOptions = {},
): boolean {
  if (template.status === 'archived') return false
  if (template.docType != null && template.docType !== 'contract') return false
  if (template.summaryStale) return false
  if (!template.currentVersionId) return false
  if (!template.sourceDocxPath) return false

  const auto = automaticStatusFromTemplate({
    status: template.status,
    meta: template.meta,
    aiAnalyzedAt: template.aiAnalyzedAt,
    generationReady: template.generationReady ?? template.meta.generationReady,
    variableCount: template.variableCount,
    sourceDocxPath: template.sourceDocxPath,
  })

  if (auto === 'archived' || auto === 'error') return false
  if (auto === 'analyzing') {
    // Explicit legacy escape hatch (tests / pre-config templates only).
    return (
      options.allowLegacyWithoutFieldConfiguration === true &&
      template.meta.fieldConfigurationStatus == null &&
      Boolean(template.aiAnalyzedAt) &&
      Boolean(template.currentVersionId) &&
      Boolean(template.sourceDocxPath)
    )
  }

  // Product "Gotowy" / soft attention that still allows generation.
  if (auto === 'ready') return true

  if (auto === 'attention') {
    const issues = template.meta.automaticAttentionIssues ?? []
    const hasFatal = issues.some(
      (issue) =>
        issue.code === 'analysis_failed' ||
        (issue.code === 'physical_slots' &&
          !template.aiAnalyzedAt &&
          (template.variableCount ?? 0) === 0 &&
          !template.meta.fieldConfiguration),
    )
    if (hasFatal) return false

    // Soft / generation-time issues — still usable.
    if (
      template.meta.fieldConfigurationStatus === 'ready' ||
      Boolean(template.meta.fieldConfiguration) ||
      (template.variableCount ?? 0) > 0 ||
      Boolean(template.aiAnalyzedAt)
    ) {
      return true
    }
    return false
  }

  // Fallback for templates that never wrote automaticReadinessStatus but have
  // a ready field configuration after analysis.
  if (template.meta.fieldConfigurationStatus === 'ready') return true

  return (
    options.allowLegacyWithoutFieldConfiguration === true &&
    template.meta.fieldConfigurationStatus == null &&
    Boolean(template.aiAnalyzedAt)
  )
}

/** @deprecated Prefer isTemplateUsableForGeneration — kept as alias. */
export function isTemplateGenerationReady(
  template: TemplateUsabilityInput,
  options: GenerationReadinessOptions = {},
): boolean {
  return isTemplateUsableForGeneration(template, options)
}
