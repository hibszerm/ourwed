import { documentTemplateService } from '@/lib/api/documents'
import { fieldConfigurationFromMeta } from '@/features/ai-contract-lab/persistTemplateFieldConfiguration'
import {
  buildAutomaticReadyConfiguration,
  evaluateDocumentPreparationState,
  migrateLegacyTemplateConfiguration,
  toPersistedAutomaticMeta,
  USER_FACING_RETRY_MESSAGE,
  type AutomaticConfigurationFailure,
  type AutomaticTemplateReadiness,
} from '@/features/documents/template/automaticTemplateReadiness'
import { isTemplateSummaryStale } from '@/features/documents/performance/analysisVersions'
import { semanticMapFromSlotMap } from '@/features/documents/template/slotMapSemanticBridge'
import { parseSlotMap } from '@/features/documents/template/types'
import type { DocumentTemplateMeta } from '@/types/documents'

export type EnsureAutomaticConfigurationResult = {
  repaired: boolean
  readiness: AutomaticTemplateReadiness
  templateId: string
  templateVersionId: string | null
  failure?: AutomaticConfigurationFailure
}

export { semanticMapFromSlotMap }

function configMatchesVersion(
  configuration: ReturnType<typeof fieldConfigurationFromMeta>,
  templateVersionId: string | null,
): boolean {
  if (!configuration) return false
  if (!templateVersionId) return true
  if (!configuration.templateVersionId) return true
  return configuration.templateVersionId === templateVersionId
}

/**
 * Authoritative identifiers for automatic configuration:
 * - templateId = document_templates.id
 * - templateVersionId = document_template_versions.id (currentVersionId)
 * Configuration is always stored on document_templates.meta keyed by templateId.
 */
export async function ensureAutomaticTemplateConfiguration(
  templateId: string,
): Promise<EnsureAutomaticConfigurationResult> {
  const template = await documentTemplateService.get(templateId)
  if (!template) {
    return {
      repaired: false,
      templateId,
      templateVersionId: null,
      readiness: {
        status: 'error',
        blockingIssues: [
          {
            code: 'analysis_failed',
            message: USER_FACING_RETRY_MESSAGE,
          },
        ],
        attentionIssues: [],
        configuration: null,
        preparationKind: 'fatal_analysis_error',
      },
      failure: {
        stage: 'load_template',
        templateId,
        cause: 'Template not found',
        diagnosticCode: 'automatic_configuration_repair_failed',
      },
    }
  }

  const templateVersionId = template.currentVersionId
  const existing = fieldConfigurationFromMeta(template.meta)
  const stalePhysical = (template.meta.automaticAttentionIssues ?? []).some(
    (issue) => issue.code === 'physical_slots',
  )
  const versionMismatch =
    existing != null && !configMatchesVersion(existing, templateVersionId)

  // Fast path: healthy ready config for the current version AND current analysis.
  if (
    existing &&
    !stalePhysical &&
    !versionMismatch &&
    !isTemplateSummaryStale(template.meta) &&
    template.meta.fieldConfigurationStatus === 'ready' &&
    template.meta.automaticReadinessStatus === 'ready'
  ) {
    return {
      repaired: false,
      templateId,
      templateVersionId,
      readiness: {
        status: 'ready',
        blockingIssues: [],
        attentionIssues: [],
        configuration: existing,
        preparationKind: 'ok',
      },
    }
  }

  // Existing config but stale readiness → recalculate without rebuilding fields.
  if (existing && !versionMismatch) {
    const migrated = migrateLegacyTemplateConfiguration({
      id: template.id,
      status: template.status,
      meta: template.meta,
      aiAnalyzedAt: template.aiAnalyzedAt,
      generationReady: template.meta.generationReady,
      sourceDocxPath: null,
      variableCount:
        template.meta.slotCounters?.detectedSlotCount ?? existing.fields.length,
    })
    if (migrated.needsPersist) {
      try {
        await documentTemplateService.update(templateId, {
          meta: migrated.meta,
          ...(migrated.readiness.status === 'ready' &&
          template.status !== 'archived'
            ? { status: 'ready' as const }
            : {}),
        })
      } catch (error) {
        return {
          repaired: false,
          templateId,
          templateVersionId,
          readiness: migrated.readiness,
          failure: {
            stage: 'persist_configuration',
            templateId,
            templateVersionId,
            cause: error instanceof Error ? error.message : String(error),
            diagnosticCode: 'automatic_configuration_persist_failed',
          },
        }
      }
      return {
        repaired: true,
        templateId,
        templateVersionId,
        readiness: migrated.readiness,
      }
    }
    return {
      repaired: false,
      templateId,
      templateVersionId,
      readiness: migrated.readiness,
    }
  }

  // Missing config — rebuild from current version slot_map.
  if (!templateVersionId) {
    return {
      repaired: false,
      templateId,
      templateVersionId: null,
      readiness: {
        status: 'attention',
        blockingIssues: [],
        attentionIssues: [
          {
            code: 'missing_configuration',
            message: USER_FACING_RETRY_MESSAGE,
          },
        ],
        configuration: null,
        preparationKind: 'recoverable_internal_state',
      },
      failure: {
        stage: 'load_analysis',
        templateId,
        cause: 'Missing currentVersionId',
        diagnosticCode: 'automatic_configuration_version_mismatch',
      },
    }
  }

  try {
    const version = await documentTemplateService.getAnalysis(templateId)
    const slotMap = parseSlotMap(version?.slotMap ?? null)
    const detected = slotMap.slots.filter((slot) => slot.registryKey).length
    if (detected === 0 && !template.aiAnalyzedAt) {
      return {
        repaired: false,
        templateId,
        templateVersionId,
        readiness: {
          status: 'attention',
          blockingIssues: [],
          attentionIssues: [
            {
              code: 'missing_configuration',
              message: USER_FACING_RETRY_MESSAGE,
            },
          ],
          configuration: null,
          preparationKind: 'fatal_analysis_error',
        },
        failure: {
          stage: 'load_analysis',
          templateId,
          templateVersionId,
          cause: 'No slot_map fields to rebuild from',
          diagnosticCode: 'automatic_configuration_not_found',
        },
      }
    }

    const semanticMap = semanticMapFromSlotMap({
      templateId,
      templateVersionId,
      slotMap,
    })
    const preparation = evaluateDocumentPreparationState({
      hasSourceDocx: true,
      aiAnalyzedAt: template.aiAnalyzedAt,
      analysisVersion: template.meta.analysisVersion,
      detectedFieldCount: detected || semanticMap.semanticAnchors.length,
      slotBindingsReady: template.meta.slotBindingsReady,
      generationReady: template.meta.generationReady,
      status: template.status,
      automaticAttentionIssues: template.meta.automaticAttentionIssues,
    })

    const readiness = buildAutomaticReadyConfiguration({
      templateId,
      templateVersionId,
      semanticMap,
      existing,
      preparation,
    })

    // Idempotency: same templateId + templateVersionId overwrite a single meta blob.
    const autoMeta = toPersistedAutomaticMeta(readiness)
    const nextMeta: DocumentTemplateMeta = {
      ...template.meta,
      version: 1,
      ...autoMeta,
    }

    await documentTemplateService.update(templateId, {
      meta: nextMeta,
      ...(readiness.status === 'ready' && template.status !== 'archived'
        ? { status: 'ready' }
        : {}),
    })

    return {
      repaired: true,
      templateId,
      templateVersionId,
      readiness,
    }
  } catch (error) {
    return {
      repaired: false,
      templateId,
      templateVersionId,
      readiness: {
        status: 'error',
        blockingIssues: [
          {
            code: 'automatic_configuration_repair_failed',
            message: USER_FACING_RETRY_MESSAGE,
          },
        ],
        attentionIssues: [],
        configuration: existing,
        preparationKind: 'fatal_analysis_error',
      },
      failure: {
        stage: 'repair',
        templateId,
        templateVersionId,
        cause: error instanceof Error ? error.message : String(error),
        diagnosticCode: 'automatic_configuration_repair_failed',
      },
    }
  }
}
