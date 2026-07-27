/**
 * @deprecated Product package upload no longer analyzes at upload time.
 * Use `uploadPackageContractTemplate` instead.
 * Kept for emergency rollback / lab tooling; do not call from PackageContractSection.
 *
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
import {
  extractDocxDocumentModel,
} from './extractDocxParagraphs'
import {
  applyPackageContractAllowlistToSlotMap,
  evaluatePackageContractReadiness,
  isPackageContractAllowedDynamicKey,
  isPackageContractImmutableKey,
  PACKAGE_CONTRACT_CATEGORY_LABELS,
  type PackageContractReadiness,
} from './packageContractAllowlist'
import {
  logPackageContractBindingSummary,
} from './packageContractTableAnalysis'
import {
  resolvePackageContractFromPackage,
  type PackageContractResolution,
} from './packageContractResolve'
import { saveTemplateSlots } from './saveTemplateSlots'
import {
  isSlotPhysicallyBound,
  type TemplateSlot,
  type TemplateSlotMap,
} from './types'
import type { PackageContractHealthReport } from './packageContractHealthAudit'
import {
  buildPackageContractFinalReport,
  type PackageContractReportKind,
} from './packageContractFinalReport'
import type { PackageContractBlockingIssue } from './packageContractRequiredDataReadiness'

function slotKey(slot: TemplateSlot): string | null {
  return slot.registryKey ?? null
}

function physicalKeys(slots: TemplateSlot[]): string[] {
  return slots
    .filter(isSlotPhysicallyBound)
    .map((s) => s.registryKey!)
    .filter(Boolean)
}

/** Dev-only pipeline trace — never shown in product UI. */
function logPackageContractPipeline(trace: Record<string, unknown>) {
  console.info('[package-contract-pipeline]', trace)
}

export type PackageContractAssignmentResult = {
  package: StudioPackage
  templateId: string
  templateVersionId: string
  slotMap: TemplateSlotMap
  readiness: PackageContractReadiness
  healthReport: PackageContractHealthReport
  reportKind: PackageContractReportKind
  blockingIssues: PackageContractBlockingIssue[]
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
  const docxModel =
    kind === 'docx' ? await extractDocxDocumentModel(bytes) : null
  const paragraphs =
    kind === 'docx'
      ? docxModel!.paragraphs
      : structure.plainText.split(/\n/).map((text, index) => ({ index, text }))
  const tables = docxModel?.tables ?? []

  const ai = await activeAiDocumentAnalyzer.analyze({
    text: structure.plainText,
    structure,
  })

  const rawMap = buildSlotsFromAnalysis({
    ai,
    plainText: structure.plainText,
    paragraphs,
    tables,
    sourceKind: kind === 'pdf' ? 'pdf' : 'docx',
  })
  rawMap.documentTitle = `Umowa — ${pkg.name}`

  const rawLogicalKeys = [
    ...new Set(
      rawMap.slots.map(slotKey).filter((k): k is string => Boolean(k)),
    ),
  ]
  const rawPhysicalKeys = physicalKeys(rawMap.slots)
  const rawUnboundLogical = rawMap.slots
    .filter((s) => s.registryKey && !isSlotPhysicallyBound(s))
    .map((s) => ({
      key: s.registryKey!,
      reason:
        s.detectionReason ??
        s.spanSafetyReasons?.join('; ') ??
        'no_physical_span',
    }))

  const { slotMap: filteredMap, filteredOutKeys } =
    applyPackageContractAllowlistToSlotMap(rawMap)

  const filteredOutReasons = filteredOutKeys.map((key) => ({
    key,
    reason: isPackageContractImmutableKey(key)
      ? 'immutable_package_key'
      : isPackageContractAllowedDynamicKey(key)
        ? 'unexpected_allowlist_drop'
        : 'not_on_package_allowlist',
  }))

  logPackageContractBindingSummary({
    detectedKeys: rawLogicalKeys,
    persistedKeys: physicalKeys(filteredMap.slots),
    filteredKeys: filteredOutKeys,
    rejectionReasons: [
      ...rawUnboundLogical,
      ...filteredOutReasons,
    ],
  })
  const { normalizeSlotMap, logLogicalFieldModel } = await import(
    './logicalContractFields'
  )
  const { normalizeClientPartyPhysicalBindings } = await import(
    './normalizeClientPartyPhysicalBindings'
  )
  const afterPhysical = normalizeSlotMap(filteredMap)
  const clientNormalized = normalizeClientPartyPhysicalBindings(
    afterPhysical.slots,
  )
  const normalizedMap = {
    ...afterPhysical,
    slots: clientNormalized.slots,
  }
  logLogicalFieldModel('package-upload-before-persist', normalizedMap.slots)

  const saved = await saveTemplateSlots({
    templateId,
    templateVersionId: versionId,
    versionNumber,
    sourceBytes: cloneArrayBuffer(bytes),
    slotMap: normalizedMap,
    documentTitle: `Umowa — ${pkg.name}`,
  })

  const afterPersistAllowlist = applyPackageContractAllowlistToSlotMap(
    normalizeSlotMap(saved.slotMap),
  )
  const afterPersistClient = normalizeClientPartyPhysicalBindings(
    afterPersistAllowlist.slotMap.slots,
  )
  const finalFiltered = {
    ...afterPersistAllowlist,
    slotMap: {
      ...afterPersistAllowlist.slotMap,
      slots: afterPersistClient.slots,
    },
  }
  if (
    finalFiltered.filteredOutKeys.length > 0 ||
    afterPersistClient.discarded.length > 0
  ) {
    const { error } = await supabase
      .from('document_template_versions')
      .update({ slot_map: finalFiltered.slotMap })
      .eq('id', versionId)
    if (error) throw error
  }

  const { findSharedPhysicalSpanConflicts } = await import(
    './packageContractGenerationModel'
  )
  const { describeSharedPhysicalSpanConflicts } = await import(
    './normalizeClientPartyPhysicalBindings'
  )
  const sharedSpanConflicts = findSharedPhysicalSpanConflicts(
    finalFiltered.slotMap.slots,
  )
  if (sharedSpanConflicts.length > 0) {
    describeSharedPhysicalSpanConflicts({
      documentName: fileName,
      paragraphs,
      slots: finalFiltered.slotMap.slots,
      conflicts: sharedSpanConflicts,
    })
  }

  const allowedKeys = physicalKeys(finalFiltered.slotMap.slots)
  const allowlistedKeys = [
    ...new Set(
      finalFiltered.slotMap.slots
        .map(slotKey)
        .filter((k): k is string => Boolean(k)),
    ),
  ]
  const unboundAllowlisted = finalFiltered.slotMap.slots
    .filter((s) => s.registryKey && !isSlotPhysicallyBound(s))
    .map((s) => ({
      key: s.registryKey!,
      reason:
        s.detectionReason ??
        s.spanSafetyReasons?.join('; ') ??
        'logical_key_without_physical_binding',
    }))

  if (sharedSpanConflicts.length > 0) {
    console.info('[package-contract-shared-span-conflict]', {
      templateVersionId: versionId,
      conflicts: sharedSpanConflicts,
    })
  }

  const finalReport = buildPackageContractFinalReport({
    paragraphs,
    slots: finalFiltered.slotMap.slots,
    allowedRegistryKeys: allowedKeys,
    sharedSpanConflicts,
  })
  const healthReport = finalReport.healthReport
  const requiredData = finalReport.requiredData
  const categorySnapshot = evaluatePackageContractReadiness({
    allowedRegistryKeys: allowedKeys,
  })
  const readiness: PackageContractReadiness = {
    ready: requiredData.ready,
    presentCategories: categorySnapshot.presentCategories,
    missingRequiredCategories: requiredData.missingCategories,
    presentOptionalCategories: categorySnapshot.presentOptionalCategories,
    userMessage: requiredData.userMessage,
    clientParty: requiredData.clientParty,
    missingRegistryKeys: requiredData.missingRegistryKeys,
  }

  const allFiltered = [
    ...new Set([...filteredOutKeys, ...finalFiltered.filteredOutKeys]),
  ]

  const aiLogicalKeys = [
    ...new Set(
      ai.fields
        .map((f) => f.registryKey)
        .filter((k): k is string => Boolean(k)),
    ),
  ]

  logPackageContractPipeline({
    templateVersionId: versionId,
    paragraphCount: paragraphs.length,
    aiLogicalFieldCount: aiLogicalKeys.length,
    aiLogicalKeys,
    aiUnmappedLabels: ai.fields
      .filter((f) => !f.registryKey)
      .map((f) => f.label)
      .filter(Boolean),
    // Candidate accept/reject counts: see [contract-candidate-detection] logs above.
    rawLogicalFieldCount: rawLogicalKeys.length,
    rawPhysicalBindingCount: rawPhysicalKeys.length,
    rawPhysicalKeys,
    rawLogicalKeys,
    rawRejectedOrUnboundLogical: rawUnboundLogical,
    allowlistedBindingCount: allowedKeys.length,
    allowlistedKeys,
    filteredOutKeys: allFiltered,
    filteredOutReasons: [
      ...filteredOutReasons,
      ...finalFiltered.filteredOutKeys
        .filter((k) => !filteredOutKeys.includes(k))
        .map((key) => ({
          key,
          reason: 'dropped_after_persist_refilter',
        })),
    ],
    unboundAllowlisted,
    persistedBindingCount: allowedKeys.length,
    persistedKeys: allowedKeys,
    blockedBindingCount: allFiltered.length + unboundAllowlisted.length,
    readinessReady: readiness.ready,
    missingRequiredCategories: readiness.missingRequiredCategories,
    sharedSpanConflicts: sharedSpanConflicts.length,
    healthBindingsEvidence: healthReport.checks.find(
      (c) => c.code === 'bindings_valid',
    )?.evidence,
    healthRequiredDataEvidence: healthReport.checks.find(
      (c) => c.code === 'required_data_ready',
    )?.evidence,
    clientParty: readiness.clientParty,
    missingRegistryKeys: readiness.missingRegistryKeys,
  })

  if (import.meta.env?.DEV) {
    console.info('[package-contract-client-party-analysis]', {
      documentName: fileName,
      clientParty: {
        detectedPersons: readiness.clientParty.persons.map((p) => ({
          ordinal: p.ordinal,
          role: p.role,
          assignedKeys: p.boundFullNameKeys,
          addressKeys: p.boundAddressKeys,
          phoneKeys: p.boundPhoneKeys,
          peselKeys: p.boundPeselKeys,
          physicalBindingCreated: p.boundFullNameKeys.length > 0,
          allowlisted: true,
          contributesToReadiness: p.boundFullNameKeys.length > 0,
        })),
        categorySatisfied: readiness.clientParty.ready,
        failureReason: readiness.clientParty.ready
          ? null
          : readiness.clientParty.missingRequiredCapabilities.join(','),
        evidence: readiness.clientParty.evidence,
      },
    })
  }

  // Product-facing warnings only — never store English diagnostics in meta.
  const healthWarningMessages = healthReport.checks
    .filter((c) => c.status === 'warning' || c.status === 'critical')
    .map((c) => c.message ?? c.title)
    .filter(
      (msg) =>
        !/allowlisted|bindings_valid|Required package-contract/i.test(msg),
    )

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
        missingRegistryKeys: readiness.missingRegistryKeys,
        blockingIssues: requiredData.blockingIssues.map((b) => ({
          code: b.code,
          message: b.message,
          evidence: b.evidence,
        })),
        reportKind: finalReport.kind,
        clientParty: {
          ready: readiness.clientParty.ready,
          recognizedPersonCount: readiness.clientParty.recognizedPersonCount,
          missingRequiredCapabilities:
            readiness.clientParty.missingRequiredCapabilities,
          missingRegistryKeys: readiness.clientParty.missingRegistryKeys,
          evidence: readiness.clientParty.evidence,
        },
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
    reportKind: finalReport.kind,
    blockingIssues: requiredData.blockingIssues,
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
