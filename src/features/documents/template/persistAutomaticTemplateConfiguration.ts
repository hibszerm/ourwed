/**
 * Persist automatic field configuration after analysis / legacy migration.
 * Users never approve modes — configuration is infrastructure.
 */

import { documentTemplateService } from '@/lib/api/documents'
import type { DocumentTemplateMeta } from '@/types/documents'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import { fieldConfigurationFromMeta } from '@/features/ai-contract-lab/persistTemplateFieldConfiguration'
import {
  buildAutomaticReadyConfiguration,
  migrateLegacyTemplateConfiguration,
  toPersistedAutomaticMeta,
  type AutomaticTemplateReadiness,
} from '@/features/documents/template/automaticTemplateReadiness'

export { migrateLegacyTemplateConfiguration }

export async function persistAutomaticTemplateConfiguration(input: {
  templateId: string
  semanticMap: DocumentSemanticMap
  templateVersionId?: string
  physicalReady?: boolean
}): Promise<AutomaticTemplateReadiness> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu.')

  const readiness = buildAutomaticReadyConfiguration({
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    semanticMap: input.semanticMap,
    existing: fieldConfigurationFromMeta(template.meta),
    physicalReady: input.physicalReady,
  })

  const autoMeta = toPersistedAutomaticMeta(readiness)
  const nextMeta: DocumentTemplateMeta = {
    ...template.meta,
    version: 1,
    ...autoMeta,
  }

  const nextStatus =
    readiness.status === 'ready'
      ? 'ready'
      : readiness.status === 'error'
        ? 'needs_review'
        : readiness.status === 'attention' && readiness.blockingIssues.length > 0
          ? 'incomplete'
          : template.status === 'draft' && input.physicalReady
            ? 'ready'
            : template.status

  await documentTemplateService.update(input.templateId, {
    meta: nextMeta,
    ...(readiness.status === 'ready' || input.physicalReady
      ? { status: nextStatus === 'draft' ? 'ready' : nextStatus }
      : {}),
  })

  return readiness
}

export async function persistLegacyTemplateMigration(
  templateId: string,
): Promise<AutomaticTemplateReadiness | null> {
  const template = await documentTemplateService.get(templateId)
  if (!template) return null
  const migrated = migrateLegacyTemplateConfiguration(template)
  if (!migrated.needsPersist) return migrated.readiness

  await documentTemplateService.update(templateId, {
    meta: migrated.meta,
    ...(migrated.readiness.status === 'ready' && template.status !== 'archived'
      ? { status: 'ready' as const }
      : {}),
  })
  return migrated.readiness
}
