/**
 * Assign / analyze a DOCX as the active contract for a studio package.
 * Analysis runs at upload; generation uses only allowlisted dynamic bindings.
 */

import { activeAiDocumentAnalyzer } from '@/features/documents/ai'
import { activeDocumentStructureExtractor } from '@/features/documents/mapping/extraction'
import {
  cloneArrayBuffer,
  detectSourceKind,
} from '@/features/documents/mapping/extraction/sourceKind'
import { documentTemplateService } from '@/lib/api/documents'
import { packageService } from '@/lib/api/packageService'
import { supabase } from '@/lib/supabase'
import type { StudioPackage } from '@/types/package'
import { CONTRACT_ANALYSIS_VERSION } from '@/features/documents/performance/analysisVersions'
import { buildSlotsFromAnalysis } from './buildSlotsFromAnalysis'
import { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
import {
  applyPackageContractAllowlistToSlotMap,
  evaluatePackageContractReadiness,
  PACKAGE_CONTRACT_CATEGORY_LABELS,
  type PackageContractReadiness,
} from './packageContractAllowlist'
import {
  resolvePackageContractFromPackage,
  type PackageContractResolution,
} from './packageContractResolve'
import { saveTemplateSlots } from './saveTemplateSlots'
import { isSlotPhysicallyBound, type TemplateSlotMap } from './types'
import {
  buildPackageContractHealthReport,
  type PackageContractHealthReport,
} from './packageContractHealthAudit'

export type PackageContractAssignmentResult = {
  package: StudioPackage
  templateId: string
  templateVersionId: string
  slotMap: TemplateSlotMap
  readiness: PackageContractReadiness
  healthReport: PackageContractHealthReport
  filteredOutKeys: string[]
  sourceFileName: string
}

export { applyPackageContractAllowlistToSlotMap }
export type { PackageContractResolution }
export { resolvePackageContractFromPackage } from './packageContractResolve'

export async function assignPackageContractFromDocx(input: {
  packageId: string
  file: File
}): Promise<PackageContractAssignmentResult> {
  const pkg = await packageService.get(input.packageId)
  if (!pkg) throw new Error('Nie znaleziono pakietu.')

  const file = input.file
  const bytes = cloneArrayBuffer(await file.arrayBuffer())
  const fileName = file.name || 'umowa.docx'

  const uploaded = await documentTemplateService.uploadTemplate({
    name: `Umowa — ${pkg.name}`,
    docType: 'contract',
    file,
  })

  const templateId = uploaded.id
  const versionId = uploaded.currentVersionId
  if (!versionId) {
    throw new Error('Nie udało się utworzyć wersji szablonu umowy.')
  }

  const version = await documentTemplateService.getVersion(versionId)
  const versionNumber = version?.versionNumber ?? 1

  const kind = detectSourceKind(fileName, bytes)
  const structure = await activeDocumentStructureExtractor.extractForFile(
    bytes,
    fileName,
  )
  const paragraphs =
    kind === 'docx'
      ? await extractDocxParagraphsIncludingEmpty(bytes)
      : structure.plainText.split(/\n/).map((text, index) => ({ index, text }))

  const ai = await activeAiDocumentAnalyzer.analyze({
    text: structure.plainText,
    structure,
  })

  const rawMap = buildSlotsFromAnalysis({
    ai,
    plainText: structure.plainText,
    paragraphs,
    sourceKind: kind === 'pdf' ? 'pdf' : 'docx',
  })
  rawMap.documentTitle = `Umowa — ${pkg.name}`

  const { slotMap: filteredMap, filteredOutKeys } =
    applyPackageContractAllowlistToSlotMap(rawMap)

  const { normalizeSlotMap, logLogicalFieldModel } = await import(
    './logicalContractFields'
  )
  const normalizedMap = normalizeSlotMap(filteredMap)
  logLogicalFieldModel('package-upload-before-persist', normalizedMap.slots)

  const saved = await saveTemplateSlots({
    templateId,
    templateVersionId: versionId,
    versionNumber,
    sourceBytes: cloneArrayBuffer(bytes),
    slotMap: normalizedMap,
    documentTitle: `Umowa — ${pkg.name}`,
  })

  const finalFiltered = applyPackageContractAllowlistToSlotMap(
    normalizeSlotMap(saved.slotMap),
  )
  if (finalFiltered.filteredOutKeys.length > 0) {
    const { error } = await supabase
      .from('document_template_versions')
      .update({ slot_map: finalFiltered.slotMap })
      .eq('id', versionId)
    if (error) throw error
  }

  const { findSharedPhysicalSpanConflicts } = await import(
    './packageContractGenerationModel'
  )
  const sharedSpanConflicts = findSharedPhysicalSpanConflicts(
    finalFiltered.slotMap.slots,
  )

  const allowedKeys = finalFiltered.slotMap.slots
    .filter(isSlotPhysicallyBound)
    .map((s) => s.registryKey!)
    .filter(Boolean)

  let readiness = evaluatePackageContractReadiness({
    allowedRegistryKeys: allowedKeys,
  })
  if (sharedSpanConflicts.length > 0) {
    readiness = {
      ...readiness,
      ready: false,
      userMessage:
        'Nie udało się jednoznacznie rozpoznać miejsc w umowie. Sprawdź lokalizacje i prześlij umowę ponownie.',
    }
    console.info('[package-contract-shared-span-conflict]', {
      templateVersionId: versionId,
      conflicts: sharedSpanConflicts,
    })
  }

  const healthReport = buildPackageContractHealthReport({
    paragraphs,
    slots: finalFiltered.slotMap.slots,
    readinessReady: readiness.ready,
  })

  const allFiltered = [
    ...new Set([...filteredOutKeys, ...finalFiltered.filteredOutKeys]),
  ]

  // Merge health warnings into analysisWarnings for template detail surfaces.
  const healthWarningMessages = healthReport.checks
    .filter((c) => c.status === 'warning' || c.status === 'critical')
    .map((c) => c.message ?? c.title)

  await documentTemplateService.update(templateId, {
    status: readiness.ready ? 'ready' : 'needs_review',
    meta: {
      ...(uploaded.meta ?? { version: 1 }),
      version: 1,
      associatedPackageId: input.packageId,
      packageContractMode: true,
      packageContractFilteredKeys: allFiltered,
      packageContractSharedSpanConflicts: sharedSpanConflicts,
      packageContractReadiness: {
        ready: readiness.ready,
        presentCategories: readiness.presentCategories,
        missingRequiredCategories: readiness.missingRequiredCategories,
        userMessage: readiness.userMessage,
      },
      packageContractHealthReport: healthReport,
      analysisWarnings: [
        ...new Set([
          ...(finalFiltered.slotMap.analysisWarnings ?? []),
          ...healthWarningMessages,
        ]),
      ],
      generationReady: readiness.ready,
      slotBindingsReady: readiness.ready,
      analysisVersion: CONTRACT_ANALYSIS_VERSION,
    },
  })

  const updatedPackage = await packageService.linkContractTemplate(
    input.packageId,
    templateId,
    versionId,
  )

  return {
    package: updatedPackage,
    templateId,
    templateVersionId: versionId,
    slotMap: finalFiltered.slotMap,
    readiness,
    healthReport,
    filteredOutKeys: allFiltered,
    sourceFileName: fileName,
  }
}

export function packageContractMissingCategoryLabels(
  readiness: PackageContractReadiness,
): string[] {
  return readiness.missingRequiredCategories.map(
    (c) => PACKAGE_CONTRACT_CATEGORY_LABELS[c],
  )
}

/**
 * Resolve the contract template for a wedding from its package.
 */
export async function resolvePackageContractForWedding(input: {
  packageId: string | null | undefined
  packageName?: string | null
}): Promise<PackageContractResolution> {
  if (!input.packageId) {
    return resolvePackageContractFromPackage({ packageId: null, pkg: null })
  }
  const pkg = await packageService.get(input.packageId)
  return resolvePackageContractFromPackage({
    packageId: input.packageId,
    pkg,
  })
}
