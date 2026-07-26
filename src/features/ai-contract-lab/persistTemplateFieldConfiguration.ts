import type { DocumentTemplateMeta } from '@/types/documents'
import {
  computeTemplateConfigurationReadiness,
  type ContractTemplateConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { documentTemplateService } from '@/lib/api/documents'
import {
  computeAutomaticTemplateReadiness,
  evaluateDocumentPreparationState,
  toPersistedAutomaticMeta,
} from '@/features/documents/template/automaticTemplateReadiness'

/**
 * Persist / load ContractTemplateConfiguration on document_templates.meta.
 */

export function parseFieldConfiguration(
  raw: unknown,
): ContractTemplateConfiguration | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<ContractTemplateConfiguration>
  if (!obj.templateId || !Array.isArray(obj.fields)) return null
  if (
    obj.paymentMode !== 'fixed' &&
    obj.paymentMode !== 'variable'
  ) {
    return null
  }
  if (
    obj.deliveryTermMode !== 'fixed' &&
    obj.deliveryTermMode !== 'variable'
  ) {
    return null
  }
  return obj as ContractTemplateConfiguration
}

export function fieldConfigurationFromMeta(
  meta: DocumentTemplateMeta | null | undefined,
): ContractTemplateConfiguration | null {
  return parseFieldConfiguration(meta?.fieldConfiguration)
}

export async function saveTemplateFieldConfiguration(input: {
  templateId: string
  configuration: ContractTemplateConfiguration
  /** When true (default for primary product), finalize + mark ready automatically. */
  automatic?: boolean
}): Promise<{
  configuration: ContractTemplateConfiguration
  readiness: ReturnType<typeof computeTemplateConfigurationReadiness>
}> {
  const automatic = input.automatic !== false
  const template = await documentTemplateService.get(input.templateId)
  if (!template) {
    throw new Error('Nie znaleziono szablonu.')
  }

  if (automatic) {
    const detectedCount =
      input.configuration.fields.length ||
      template.meta.slotCounters?.detectedSlotCount ||
      0
    const preparation = evaluateDocumentPreparationState({
      hasSourceDocx: true,
      aiAnalyzedAt: template.aiAnalyzedAt ?? 'present',
      analysisVersion: template.meta.analysisVersion,
      detectedFieldCount: detectedCount,
      slotBindingsReady: template.meta.slotBindingsReady,
      generationReady: template.meta.generationReady,
      status: template.status,
      automaticAttentionIssues: template.meta.automaticAttentionIssues,
    })
    const auto = computeAutomaticTemplateReadiness({
      configuration: input.configuration,
      preparation,
    })
    const autoMeta = toPersistedAutomaticMeta(auto)
    const nextMeta: DocumentTemplateMeta = {
      ...template.meta,
      version: 1,
      ...autoMeta,
    }
    try {
      await documentTemplateService.update(input.templateId, {
        meta: nextMeta,
        ...(auto.status === 'ready' && template.status !== 'archived'
          ? { status: 'ready' }
          : {}),
      })
    } catch (error) {
      const failure = {
        stage: 'persist_configuration' as const,
        templateId: input.templateId,
        templateVersionId: input.configuration.templateVersionId ?? null,
        cause: error instanceof Error ? error.message : String(error),
        diagnosticCode: 'automatic_configuration_persist_failed' as const,
      }
      console.error('[automatic-config]', failure)
      throw Object.assign(
        new Error('Nie udało się dokończyć przygotowania szablonu. Spróbuj ponownie.'),
        { failure },
      )
    }
    const classic = computeTemplateConfigurationReadiness(auto.configuration)
    return {
      configuration: auto.configuration ?? input.configuration,
      readiness: {
        ...classic,
        status: auto.status === 'ready' ? 'ready' : classic.status,
      },
    }
  }

  const readiness = computeTemplateConfigurationReadiness(input.configuration)
  const nextMeta: DocumentTemplateMeta = {
    ...template.meta,
    version: 1,
    fieldConfiguration: input.configuration as unknown as Record<string, unknown>,
    fieldConfigurationStatus: readiness.status,
    fieldConfigurationSummary: {
      variableCount: readiness.variableCount,
      fixedCount: readiness.fixedCount,
      ignoredCount: readiness.ignoredCount,
      reviewCount: readiness.reviewCount,
      updatedAt: input.configuration.updatedAt,
    },
  }
  await documentTemplateService.update(input.templateId, { meta: nextMeta })
  return { configuration: input.configuration, readiness }
}

const LAB_STORAGE_PREFIX = 'ourwed:ai-contract-lab:field-config:'

export function loadLabFieldConfiguration(
  sessionKey: string,
): ContractTemplateConfiguration | null {
  try {
    const raw = sessionStorage.getItem(LAB_STORAGE_PREFIX + sessionKey)
    if (!raw) return null
    return parseFieldConfiguration(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveLabFieldConfiguration(
  sessionKey: string,
  configuration: ContractTemplateConfiguration,
): void {
  try {
    sessionStorage.setItem(
      LAB_STORAGE_PREFIX + sessionKey,
      JSON.stringify(configuration),
    )
  } catch {
    // quota / private mode — ignore
  }
}
