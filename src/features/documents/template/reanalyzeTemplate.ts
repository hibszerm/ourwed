/**
 * Re-analyze an existing template from its stored source file.
 * Rebuilds physical ContractTemplateSlot bindings without re-upload.
 *
 * Lifecycle (Option A): updates the current draft version’s analysis/bindings
 * atomically on the same templateVersionId, then refreshes field configuration
 * from the new slot map and returns the persisted version id.
 */

import { activeAiDocumentAnalyzer } from '@/features/documents/ai'
import { activeDocumentStructureExtractor } from '@/features/documents/mapping/extraction'
import { detectSourceKind } from '@/features/documents/mapping/extraction/sourceKind'
import {
  buildProposedTemplateConfiguration,
  DEFAULT_PACKAGE_CONFIGURATION,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import {
  fieldConfigurationFromMeta,
  saveTemplateFieldConfiguration,
} from '@/features/ai-contract-lab/persistTemplateFieldConfiguration'
import { documentStorage } from '@/lib/api/documents/storage'
import { documentTemplateService } from '@/lib/api/documents'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { extractDocxParagraphsIncludingEmpty, tablesFromParagraphOrigins } from './extractDocxParagraphs'
import { saveTemplateSlots } from './saveTemplateSlots'
import { semanticMapFromSlotMap } from './slotMapSemanticBridge'
import {
  logContractLoadedBindings,
} from './syncPhysicalBindingsFromSource'
import { validateTemplateSlotBindings } from './templateReadiness'
import { isSlotPhysicallyBound, type TemplateSlotMap } from './types'

const PACKAGE_VARIABLE_KEYS = new Set([
  'coverage_hours',
  'working_hours',
  'package_duration',
  'coverage_start_time',
  'coverage_end_time',
  'coverage_time_range',
  'overtime_rate',
  'overtime_rate_formatted',
  'overtime_price',
  'package_overtime_rate',
])

export interface ReanalyzeTemplateResult {
  slotMap: TemplateSlotMap
  readinessReady: boolean
  unresolvedKeys: string[]
  templateStatus: 'ready' | 'incomplete'
  /** Same id as before when Option A updates in place. */
  templateVersionId: string
  templateId: string
}

export async function reanalyzeTemplate(input: {
  templateId: string
}): Promise<ReanalyzeTemplateResult> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu.')

  const versionId = template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')

  const version = await documentTemplateService.getVersion(versionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')
  if (!version.sourceDocxPath) {
    throw new Error('Brak oryginalnego pliku umowy — prześlij dokument ponownie.')
  }

  const sourceBytes = await documentStorage.download(version.sourceDocxPath)
  const kind = detectSourceKind(version.sourceFileName, sourceBytes)

  const structure = await activeDocumentStructureExtractor.extractForFile(
    sourceBytes,
    version.sourceFileName,
  )

  const paragraphs =
    kind === 'docx'
      ? await extractDocxParagraphsIncludingEmpty(sourceBytes)
      : structure.plainText.split(/\n/).map((text, index) => ({ index, text }))

  const tables =
    kind === 'docx' ? tablesFromParagraphOrigins(paragraphs) : []

  const ai = await activeAiDocumentAnalyzer.analyze({
    text: structure.plainText,
    structure,
  })

  const slotMap = buildSlotsFromAnalysis({
    ai,
    plainText: structure.plainText,
    paragraphs,
    tables,
    sourceKind: kind === 'pdf' ? 'pdf' : 'docx',
  })
  slotMap.documentTitle = template.name

  logContractLoadedBindings({
    templateVersionId: version.id,
    phase: 'reanalyze-before-save',
    slots: slotMap.slots,
    paragraphIndex: 36,
  })

  const saved = await saveTemplateSlots({
    templateId: input.templateId,
    templateVersionId: version.id,
    versionNumber: version.versionNumber,
    sourceBytes,
    slotMap,
    documentTitle: template.name,
  })

  logContractLoadedBindings({
    templateVersionId: version.id,
    phase: 'reanalyze-after-save',
    slots: saved.slotMap.slots,
    paragraphIndex: 36,
  })

  // Field config must track physical slots — import does this; reanalyze must too.
  const existingConfig = fieldConfigurationFromMeta(
    (await documentTemplateService.get(input.templateId))?.meta,
  )
  const proposal = buildProposedTemplateConfiguration({
    templateId: input.templateId,
    templateVersionId: version.id,
    semanticMap: semanticMapFromSlotMap({
      templateId: input.templateId,
      templateVersionId: version.id,
      slotMap: saved.slotMap,
    }),
    existing: existingConfig,
  })

  const promoted = {
    ...proposal,
    packageConfiguration: {
      ...(proposal.packageConfiguration ?? DEFAULT_PACKAGE_CONFIGURATION),
      fields: {
        ...(proposal.packageConfiguration ?? DEFAULT_PACKAGE_CONFIGURATION).fields,
        coverageHours: 'variable' as const,
        workingTime: 'variable' as const,
        overtimeRate: 'variable' as const,
      },
    },
    fields: proposal.fields.map((field) => {
      if (field.configuredBy === 'user' || field.configuredBy === 'migration') {
        return field
      }
      const role = field.semanticRole
      if (!PACKAGE_VARIABLE_KEYS.has(role)) return field
      const bound = saved.slotMap.slots.some(
        (s) => s.registryKey === role && isSlotPhysicallyBound(s),
      )
      if (!bound) return field
      return {
        ...field,
        mode: 'variable' as const,
        variableSource: 'package' as const,
        configuredBy: 'system' as const,
        requiredWhenVariable: false,
      }
    }),
  }

  await saveTemplateFieldConfiguration({
    templateId: input.templateId,
    configuration: promoted,
  })

  const readiness = validateTemplateSlotBindings(saved.slotMap, {
    paragraphs: kind === 'docx' ? paragraphs : undefined,
    sourceKind: kind === 'pdf' ? 'pdf' : 'docx',
  })
  return {
    slotMap: saved.slotMap,
    readinessReady: readiness.ready && kind !== 'pdf',
    unresolvedKeys: readiness.unresolvedKeys,
    templateStatus: readiness.ready && kind !== 'pdf' ? 'ready' : 'incomplete',
    templateVersionId: version.id,
    templateId: input.templateId,
  }
}
