/**
 * Deterministic contract generation from a reusable template (PLACEHOLDER FILL).
 *
 * @deprecated Generation now uses AI document transformation
 * (`transformContract` / ContractTransformationService). Kept for reference
 * and any residual callers — do not wire into Generate Contract UI.
 */

import { documentStorage } from '@/lib/api/documents/storage'
import { documentDraftService, documentTemplateService } from '@/lib/api/documents'
import { requireStudioUserId } from '@/lib/api/ownership'
import { VariableResolver } from '@/lib/variables'
import type { PackageSnapshot } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import { weddingValuesFromWedding } from './buildContractCompleteness'
import { fillTemplateDocx } from './fillTemplateDocx'
import { parseSlotMap, type TemplateSlotMap } from './types'

export interface GenerateContractFromTemplateInput {
  wedding: Wedding
  templateId: string
  questionnaireAnswers?: Record<string, string>
  packageSnapshot?: PackageSnapshot
  title?: string
  /** Manual values from completeness UI (registryKey → value). */
  overrides?: Record<string, string>
  /** Registry keys intentionally left empty in the generated DOCX. */
  omittedKeys?: string[]
}

export interface GenerateContractFromTemplateResult {
  draftId: string
  templateId: string
  templateVersionId: string
  versionNumber: number
  title: string
  slotMap: TemplateSlotMap
  resolved: Record<string, string>
  missingSlotKeys: string[]
  omittedKeys: string[]
  filledBytes: ArrayBuffer
}

export async function generateContractFromTemplate(
  input: GenerateContractFromTemplateInput,
): Promise<GenerateContractFromTemplateResult> {
  await requireStudioUserId()
  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu umowy.')

  const versionId = template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')

  const version = await documentTemplateService.getVersion(versionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')

  const slotMap = parseSlotMap(version.slotMap)
  if (slotMap.slots.length === 0) {
    throw new Error(
      'Szablon nie ma wykrytych pól. Uruchom ponownie analizę AI kontraktu.',
    )
  }

  const templatePath = version.templateDocxPath ?? version.sourceDocxPath
  if (!templatePath) {
    throw new Error('Brak pliku DOCX szablonu.')
  }

  const templateBytes = await documentStorage.download(templatePath)

  const packageSnapshot: PackageSnapshot =
    input.packageSnapshot ??
    ({
      packageId: input.wedding.packageId ?? null,
      name: input.wedding.packageName ?? '',
      currency: input.wedding.currency || 'PLN',
      items: [],
    } satisfies PackageSnapshot)

  const resolved = await VariableResolver.resolve({
    weddingId: input.wedding.id,
    weddingValues: weddingValuesFromWedding(input.wedding),
    questionnaireAnswers: input.questionnaireAnswers ?? {},
    packageSnapshot,
    packageId: packageSnapshot.packageId ?? undefined,
  })

  if (input.overrides) {
    for (const [key, value] of Object.entries(input.overrides)) {
      resolved[key] = value.trim()
    }
  }

  const omitted = new Set(
    (input.omittedKeys ?? []).map((k) => k.trim()).filter(Boolean),
  )
  for (const key of omitted) {
    resolved[key] = ''
  }

  const requiredKeys = slotMap.slots
    .filter((s) => s.enabled && s.registryKey)
    .map((s) => s.registryKey!)

  const missingSlotKeys = requiredKeys.filter(
    (key) => !omitted.has(key) && !resolved[key]?.trim(),
  )

  const fillValues = { ...resolved }
  for (const key of omitted) {
    fillValues[key] = ''
  }

  const filledBytes = await fillTemplateDocx(templateBytes, slotMap, fillValues)

  const title =
    input.title?.trim() ||
    `${template.name} — ${input.wedding.couple.partner1} & ${input.wedding.couple.partner2}`

  const draft = await documentDraftService.create({
    weddingId: input.wedding.id,
    templateId: input.templateId,
    templateVersionId: versionId,
    title,
    fieldValues: fillValues,
    packageSnapshot,
    money: {
      price: input.wedding.price ?? 0,
      deposit: input.wedding.depositAmount ?? 0,
      remaining: Math.max(
        0,
        (input.wedding.price ?? 0) - (input.wedding.depositAmount ?? 0),
      ),
      discount: 0,
      currency: packageSnapshot.currency || 'PLN',
    },
  })

  return {
    draftId: draft.id,
    templateId: input.templateId,
    templateVersionId: versionId,
    versionNumber: version.versionNumber,
    title,
    slotMap,
    resolved: fillValues,
    missingSlotKeys,
    omittedKeys: [...omitted],
    filledBytes,
  }
}
