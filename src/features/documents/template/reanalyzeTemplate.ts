/**
 * Re-analyze an existing template from its stored source file.
 * Rebuilds physical ContractTemplateSlot bindings without re-upload.
 */

import { activeAiDocumentAnalyzer } from '@/features/documents/ai'
import { activeDocumentStructureExtractor } from '@/features/documents/mapping/extraction'
import { detectSourceKind } from '@/features/documents/mapping/extraction/sourceKind'
import { documentStorage } from '@/lib/api/documents/storage'
import {
  documentTemplateService,
} from '@/lib/api/documents'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
import { saveTemplateSlots } from './saveTemplateSlots'
import { validateTemplateSlotBindings } from './templateReadiness'
import type { TemplateSlotMap } from './types'

export interface ReanalyzeTemplateResult {
  slotMap: TemplateSlotMap
  readinessReady: boolean
  unresolvedKeys: string[]
  templateStatus: 'ready' | 'incomplete'
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

  const ai = await activeAiDocumentAnalyzer.analyze({
    text: structure.plainText,
    structure,
  })

  const slotMap = buildSlotsFromAnalysis({
    ai,
    plainText: structure.plainText,
    paragraphs,
  })
  slotMap.documentTitle = template.name

  const saved = await saveTemplateSlots({
    templateId: input.templateId,
    templateVersionId: version.id,
    versionNumber: version.versionNumber,
    sourceBytes,
    slotMap,
    documentTitle: template.name,
  })

  const readiness = validateTemplateSlotBindings(saved.slotMap)
  return {
    slotMap: saved.slotMap,
    readinessReady: readiness.ready,
    unresolvedKeys: readiness.unresolvedKeys,
    templateStatus: readiness.ready ? 'ready' : 'incomplete',
  }
}
