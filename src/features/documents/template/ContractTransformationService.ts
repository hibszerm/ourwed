/**
 * ContractTransformationService
 *
 * Deterministic slot rendering on the original uploaded contract.
 * Spacing/punctuation come from persisted slots — not from AI.
 */

import { documentStorage } from '@/lib/api/documents/storage'
import {
  documentDraftService,
  documentTemplateService,
} from '@/lib/api/documents'
import { requireStudioUserId } from '@/lib/api/ownership'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import { activeDocumentStructureExtractor } from '@/features/documents/mapping/extraction'
import { detectSourceKind } from '@/features/documents/mapping/extraction/sourceKind'
import type { PackageSnapshot } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import { applyBoundSlotsToParagraphs } from './applyBoundSlots'
import { buildMinimalDocxFromParagraphs } from './buildMinimalDocx'
import {
  assertSafeMoneyPairsForGeneration,
  findStaleMoneySourcePhrases,
} from './contractMoneyPairs'
import {
  assertCompanyCityLocativeForSlots,
  resolveContractExecutionValues,
} from './contractExecutionContext'
import { verifyContractTransformation } from './contractQualityCheck'
import {
  applyDocxParagraphEdits,
  type DocxParagraph,
} from './docxParagraphEditor'
import { extractDocxParagraphsIncludingEmpty } from './extractDocxParagraphs'
import { resolveContractVariables } from './resolveContractVariables'
import { lookupResolvedValue } from './lookupResolvedValue'
import { validateTemplateSlotBindings } from './templateReadiness'
import { isSlotPhysicallyBound, parseSlotMap } from './types'

export interface TransformContractInput {
  wedding: Wedding
  templateId: string
  questionnaireAnswers?: Record<string, string>
  packageSnapshot?: PackageSnapshot
  title?: string
  overrides?: Record<string, string>
  omittedKeys?: string[]
  /** Explicit generation date (Date or YYYY-MM-DD). Defaults to local today. */
  generationDate?: Date | string
  /**
   * Frozen execution values from a saved document version.
   * When both fields are set, date/city are not recalculated.
   */
  executionSnapshot?: {
    contractExecutionDate?: string
    contractExecutionCity?: string
  }
}

export interface TransformContractResult {
  draftId: string
  templateId: string
  templateVersionId: string
  versionNumber: number
  title: string
  resolved: Record<string, string>
  omittedKeys: string[]
  originalParagraphs: DocxParagraph[]
  paragraphs: DocxParagraph[]
  docxBytes: ArrayBuffer
  usedMock: boolean
  qualityRetries: number
  /** Snapshot to persist on export — exact values written into the DOCX. */
  executionSnapshot: {
    contractExecutionDate: string
    contractExecutionCity: string
  } | null
}

function allowedValuesList(
  resolved: Record<string, string>,
  omittedKeys: string[],
): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(resolved)) {
    if (omittedKeys.includes(key)) continue
    if (value.trim()) out.push(value.trim())
  }
  out.push('__________')
  return out
}

async function extractAllParagraphs(
  bytes: ArrayBuffer,
  fileName: string | null,
): Promise<{ paragraphs: DocxParagraph[]; isDocx: boolean }> {
  const kind = detectSourceKind(fileName, bytes)
  if (kind === 'docx') {
    const zipParas = await extractDocxParagraphsIncludingEmpty(bytes)
    return { paragraphs: zipParas, isDocx: true }
  }

  const structure = await activeDocumentStructureExtractor.extractForFile(
    bytes,
    fileName,
  )
  const lines = structure.plainText.split(/\n/)
  const paragraphs = lines.map((text, index) => ({ index, text }))
  return { paragraphs, isDocx: false }
}

async function materializeDocx(input: {
  sourceBytes: ArrayBuffer
  isDocx: boolean
  paragraphs: DocxParagraph[]
  spanEdits?: Array<{
    index: number
    start: number
    end: number
    replacement: string
  }>
}): Promise<ArrayBuffer> {
  if (input.isDocx) {
    // Prefer span edits (run-aware) when available; fall back to whole paragraph.
    if (input.spanEdits && input.spanEdits.length > 0) {
      // Sort right-to-left within each paragraph
      const sorted = [...input.spanEdits].sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index
        return b.start - a.start
      })
      return applyDocxParagraphEdits(
        input.sourceBytes,
        sorted.map((e) => ({
          index: e.index,
          text: '',
          span: {
            start: e.start,
            end: e.end,
            replacement: e.replacement,
          },
        })),
      )
    }
    return applyDocxParagraphEdits(
      input.sourceBytes,
      input.paragraphs.map((p) => ({ index: p.index, text: p.text })),
    )
  }
  return buildMinimalDocxFromParagraphs(input.paragraphs.map((p) => p.text))
}

export async function transformContract(
  input: TransformContractInput,
): Promise<TransformContractResult> {
  await requireStudioUserId()

  const template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu umowy.')

  if (template.status === 'incomplete') {
    throw new Error(
      'Szablon jest niekompletny — brakuje fizycznych powiązań zmiennych. Użyj „Ponownie przeanalizuj szablon”.',
    )
  }
  if (
    template.status === 'draft' &&
    template.meta?.slotBindingsReady !== true
  ) {
    throw new Error(
      'Szablon nie jest gotowy do generacji. Dokończ analizę w module Dokumenty.',
    )
  }

  const versionId = template.currentVersionId
  if (!versionId) throw new Error('Szablon nie ma aktywnej wersji.')

  const version = await documentTemplateService.getVersion(versionId)
  if (!version) throw new Error('Nie znaleziono wersji szablonu.')

  const sourcePath = version.sourceDocxPath
  if (!sourcePath) throw new Error('Brak oryginalnego pliku umowy.')

  const sourceBytes = await documentStorage.download(sourcePath)
  const { paragraphs: originalParagraphs, isDocx } =
    await extractAllParagraphs(sourceBytes, version.sourceFileName)

  if (originalParagraphs.length === 0) {
    throw new Error('Nie udało się odczytać treści umowy.')
  }

  const slotMap = parseSlotMap(version.slotMap)
  const readiness = validateTemplateSlotBindings(slotMap)
  if (!readiness.ready) {
    const keys = readiness.unresolvedKeys.slice(0, 8).join(', ')
    throw new Error(
      `Szablon ma niewiązane zmienne (${keys || 'brak slotów'}). Ponownie przeanalizuj szablon przed generacją.`,
    )
  }

  const boundSlots = slotMap.slots.filter(isSlotPhysicallyBound)
  if (boundSlots.length === 0) {
    throw new Error(
      'Szablon nie ma fizycznych slotów. Ponownie przeanalizuj szablon.',
    )
  }

  const ctx = await resolveContractVariables({
    wedding: input.wedding,
    overrides: input.overrides,
    questionnaireAnswers: input.questionnaireAnswers,
    generationStartedAt: input.generationDate,
    executionSnapshot: input.executionSnapshot,
  })

  const packageSnapshot: PackageSnapshot =
    input.packageSnapshot ?? ctx.packageSnapshot

  const resolved = { ...ctx.resolved }

  const companyCity =
    resolved.company_city?.trim() ||
    input.overrides?.company_city?.trim() ||
    null

  // Idempotent re-apply with the same generationStartedAt / snapshot
  // (ensures transform never drifts from completeness resolution).
  const execution = resolveContractExecutionValues({
    generationDate: input.generationDate ?? ctx.generationStartedAt,
    companyCity,
    snapshot: input.executionSnapshot ?? ctx.executionSnapshot,
  })
  for (const [key, value] of Object.entries(execution.values)) {
    if (value.trim()) resolved[key] = value.trim()
  }

  // Prefer snapshot that includes city when available; always keep date from values
  const executionSnapshotForSave =
    execution.snapshot ??
    (resolved.contract_execution_date
      ? {
          contractExecutionDate: resolved.contract_execution_date,
          contractExecutionCity: resolved.company_city_locative ?? '',
        }
      : null)

  assertCompanyCityLocativeForSlots({
    slots: boundSlots,
    companyCity: execution.companyCityNominative ?? companyCity,
    locative: resolved.company_city_locative,
    locativeUnsafe: execution.locativeUnsafe,
  })

  // Evidence-based: execution date slot requires a resolved date
  const needsExecDate = boundSlots.some(
    (s) =>
      s.physicallyBound !== false &&
      s.registryKey === 'contract_execution_date',
  )
  if (needsExecDate && !resolved.contract_execution_date?.trim()) {
    throw new Error(
      'Szablon wymaga daty zawarcia umowy, ale nie udało się jej ustalić.',
    )
  }

  // Required contact placeholders — generation input must supply real values
  const missingContactMessages: string[] = []
  for (const slot of boundSlots) {
    if (!slot.physicallyBound || !slot.registryKey) continue
    if ((slot.requirement ?? 'optional') !== 'required') continue
    const key = slot.registryKey
    const value =
      resolved[key]?.trim() ||
      lookupResolvedValue(resolved, key)
    if (value) continue
    if (key === 'bride_phone' || key === 'partner1_phone') {
      missingContactMessages.push('Brakuje numeru telefonu Panny Młodej')
    } else if (key === 'bride_email' || key === 'partner1_email') {
      missingContactMessages.push('Brakuje adresu e-mail Panny Młodej')
    } else if (key === 'groom_phone' || key === 'partner2_phone') {
      missingContactMessages.push('Brakuje numeru telefonu Pana Młodego')
    } else if (key === 'groom_email' || key === 'partner2_email') {
      missingContactMessages.push('Brakuje adresu e-mail Pana Młodego')
    }
  }
  if (missingContactMessages.length > 0) {
    throw new Error(
      [...new Set(missingContactMessages)].join('\n'),
    )
  }

  const omittedKeys = [
    ...new Set((input.omittedKeys ?? []).map((k) => k.trim()).filter(Boolean)),
  ]
  for (const key of omittedKeys) {
    resolved[key] = ''
  }

  // Log resolver values before generation (VALUE RECEIVED FROM RESOLVER)
  for (const slot of boundSlots) {
    if (!slot.registryKey) continue
    const def = SystemVariableRegistry.get(slot.registryKey)
    const value =
      resolved[slot.registryKey]?.trim() ||
      (def
        ? SystemVariableRegistry.valueKeys(def)
            .map((k) => resolved[k]?.trim())
            .find(Boolean)
        : '') ||
      ''
    console.info('[contract-resolve]', {
      registryKey: slot.registryKey,
      resolvedValue: value,
      source: 'resolver',
    })
  }

  assertSafeMoneyPairsForGeneration({
    slots: boundSlots,
    paragraphs: originalParagraphs,
  })

  const applied = applyBoundSlotsToParagraphs({
    original: originalParagraphs,
    slots: boundSlots,
    resolved,
    omittedKeys,
  })

  if (applied.failures.length > 0) {
    const detail = applied.failures
      .map((f) => `${f.registryKey}: ${f.reason}`)
      .join('\n')
    throw new Error(
      `Nie udało się bezpiecznie zlokalizować slotów w dokumencie:\n${detail}`,
    )
  }

  const staleMoney = findStaleMoneySourcePhrases({
    transformed: applied.paragraphs,
    slots: boundSlots,
    resolved,
  })
  if (staleMoney.length > 0) {
    const detail = staleMoney
      .map(
        (s) =>
          `${s.registryKey} still has source “${s.originalText}” in paragraph ${s.paragraphIndex}`,
      )
      .join('\n')
    throw new Error(`Stale financial source values after generation:\n${detail}`)
  }

  const transformed = applied.paragraphs
  const allowedValues = allowedValuesList(resolved, omittedKeys)

  const quality = verifyContractTransformation({
    original: originalParagraphs,
    transformed,
    allowedValues,
    resolvedByKey: resolved,
    slots: boundSlots,
  })

  if (!quality.ok) {
    const full =
      quality.report ??
      quality.reason ??
      'Transformacja zmieniła więcej niż wartości zmiennych — przerwano.'
    console.error('[contract-quality]\n' + full)
    throw new Error(full)
  }

  const finalParagraphs: DocxParagraph[] = transformed.map((p) => ({
    index: p.index,
    text: p.text,
  }))

  const docxBytes = await materializeDocx({
    sourceBytes,
    isDocx,
    paragraphs: finalParagraphs,
    spanEdits: applied.spanEdits,
  })

  const title =
    input.title?.trim() ||
    `${template.name} — ${input.wedding.couple.partner1} & ${input.wedding.couple.partner2}`

  const draft = await documentDraftService.create({
    weddingId: input.wedding.id,
    templateId: input.templateId,
    templateVersionId: versionId,
    title,
    fieldValues: resolved,
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
    resolved,
    omittedKeys,
    originalParagraphs,
    paragraphs: finalParagraphs,
    docxBytes,
    usedMock: false,
    qualityRetries: 0,
    executionSnapshot: executionSnapshotForSave,
  }
}
