/**
 * Lightweight package contract template upload — store DOCX only.
 * No AI analysis, mapping, slots, or readiness gates.
 */

import {
  cloneArrayBuffer,
  detectSourceKind,
} from '@/features/documents/mapping/extraction/sourceKind'
import { documentTemplateService } from '@/lib/api/documents'
import { packageService } from '@/lib/api/packageService'
import type { StudioPackage } from '@/types/package'
import { extractDocxDocumentModel } from './extractDocxParagraphs'
import { assessPackageTemplatePaymentNotice } from './packageTemplatePaymentNotice'
import type { SemanticExtrasTemplateMetadata } from '@/features/ai-contract-transform/semanticExtrasPlacement'
import {
  createStoredSemanticExtrasTemplateMetadata,
  resolveGoldenSemanticExtrasTemplateMetadataSeed,
  resolveStoredSemanticExtrasTemplateMetadata,
  withStoredSemanticExtrasTemplateMetadata,
} from '@/features/ai-contract-transform/semanticExtrasTemplateMetadata'

export type PackageContractTemplateUploadResult = {
  package: StudioPackage
  templateId: string
  templateVersionId: string
  versionNumber: number
  sourceFileName: string
  paragraphCount: number
  uploadedAt: string
  /** Soft notice only when generation would require payment clarification. */
  paymentScheduleWarning: string | null
}

export {
  PACKAGE_TEMPLATE_PAYMENT_NOTICE,
  assessPackageTemplatePaymentNotice,
} from './packageTemplatePaymentNotice'

export async function uploadPackageContractTemplate(input: {
  packageId: string
  file: File
}): Promise<PackageContractTemplateUploadResult> {
  const pkg = await packageService.get(input.packageId)
  if (!pkg) throw new Error('Nie znaleziono pakietu.')

  const file = input.file
  const bytes = cloneArrayBuffer(await file.arrayBuffer())
  const fileName = file.name || 'umowa.docx'
  const kind = detectSourceKind(fileName, bytes)
  if (kind !== 'docx') {
    throw new Error('Dodaj plik umowy w formacie DOCX.')
  }

  const model = await extractDocxDocumentModel(bytes)
  if (!model.paragraphs.length) {
    throw new Error('Nie udało się odczytać treści pliku DOCX.')
  }

  const paymentScheduleWarning = assessPackageTemplatePaymentNotice(
    model.paragraphs.map((p) => ({ index: p.index, text: p.text })),
  )
  const uploadedAt = new Date().toISOString()

  const uploaded = await documentTemplateService.uploadTemplate({
    name: `Umowa — ${pkg.name}`,
    docType: 'contract',
    file,
  })

  const templateId = uploaded.id
  const templateVersionId = uploaded.currentVersionId
  if (!templateVersionId) {
    throw new Error('Nie udało się utworzyć wersji szablonu umowy.')
  }

  let version = await documentTemplateService.getVersion(templateVersionId)
  const goldenSeed = await resolveGoldenSemanticExtrasTemplateMetadataSeed(bytes)
  if (version && goldenSeed) {
    const stored = await createStoredSemanticExtrasTemplateMetadata(bytes, goldenSeed)
    if (stored) {
      version = await documentTemplateService.updateVersionSlotMap(
        templateVersionId,
        withStoredSemanticExtrasTemplateMetadata(version.slotMap, stored),
      )
    }
  }
  const versionNumber = version?.versionNumber ?? 1

  await documentTemplateService.update(templateId, {
    status: 'ready',
    meta: {
      version: 1,
      packageContractMode: true,
      sparseTemplateOnly: true,
      uploadedAt,
      sourceFileName: fileName,
      ...(paymentScheduleWarning
        ? { paymentScheduleNotice: paymentScheduleWarning }
        : {}),
    },
  })

  const linked = await packageService.linkContractTemplate(
    pkg.id,
    templateId,
    templateVersionId,
  )

  return {
    package: linked,
    templateId,
    templateVersionId,
    versionNumber,
    sourceFileName: fileName,
    paragraphCount: model.paragraphs.length,
    uploadedAt,
    paymentScheduleWarning,
  }
}

export async function downloadPackageContractTemplateSource(input: {
  templateId: string
  templateVersionId?: string | null
}): Promise<{
  fileName: string
  bytes: ArrayBuffer
  templateVersionId: string
  extrasTemplateMetadata: SemanticExtrasTemplateMetadata | null
}> {
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu.')
  const versionId =
    input.templateVersionId ?? template.currentVersionId ?? null
  if (!versionId) throw new Error('Szablon nie ma wersji pliku.')
  const version = await documentTemplateService.getVersion(versionId)
  if (!version?.sourceDocxPath) {
    throw new Error('Brak oryginalnego pliku DOCX.')
  }
  const { documentStorage } = await import('@/lib/api/documents/storage')
  const bytes = await documentStorage.download(version.sourceDocxPath)
  const extrasTemplateMetadata = await resolveStoredSemanticExtrasTemplateMetadata(version.slotMap, bytes)
  return {
    fileName: version.sourceFileName || `${template.name}.docx`,
    bytes,
    templateVersionId: versionId,
    extrasTemplateMetadata,
  }
}

/** Persist Semantic V7's first safe structural analysis onto the selected version. */
export async function persistPackageContractTemplateExtrasMetadata(input: {
  templateVersionId: string
  sourceDocxBytes: ArrayBuffer
  metadata: SemanticExtrasTemplateMetadata
}): Promise<void> {
  const version = await documentTemplateService.getVersion(input.templateVersionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')
  const stored = await createStoredSemanticExtrasTemplateMetadata(input.sourceDocxBytes, input.metadata)
  if (!stored) throw new Error('Nie udało się zweryfikować struktury szablonu.')
  const current = await resolveStoredSemanticExtrasTemplateMetadata(version.slotMap, input.sourceDocxBytes)
  if (current && JSON.stringify(current) === JSON.stringify(input.metadata)) return
  await documentTemplateService.updateVersionSlotMap(
    input.templateVersionId,
    withStoredSemanticExtrasTemplateMetadata(version.slotMap, stored),
  )
}

export async function clearPackageContractTemplate(input: {
  packageId: string
}): Promise<StudioPackage> {
  return packageService.linkContractTemplate(input.packageId, null, null)
}
