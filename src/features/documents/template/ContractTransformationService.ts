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
import { supabase } from '@/lib/supabase'
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
import {
  createGenerationCorrelationId,
  GenerationPipelineError,
  logGenerationStage,
  wrapGenerationFailure,
  type GenerationStageTrace,
} from './generationPipelineError'
import { isSlotPhysicallyBound, parseSlotMap } from './types'
import {
  CONTRACT_ANALYSIS_VERSION,
  CONTRACT_READINESS_VERSION,
} from '@/features/documents/performance/analysisVersions'
import {
  logContractLoadedBindings,
  syncPhysicalBindingsFromSource,
} from './syncPhysicalBindingsFromSource'
import {
  ensureCouplePartyParticipleSlot,
  resolveCouplePartyParticiple,
  resolvePartyBlock,
} from './partyBlockResolver'
import {
  ensureCoverageCollisionRepairSlots,
  ensureTeaserDurationSlots,
  expandCoverageOverrides,
  repairDurationEndTimeCollisions,
  reviewFieldsFromAuditMessages,
} from './preGenerationReviewIssues'
import { formatPolishHours, extractClockTimeOnly } from '@/lib/utils/polishDuration'
import {
  TransformNeedsReviewSignal,
} from './generationAttemptResult'
import type { ActionableGenerationReviewPayload } from './generationPipelineError'
import {
  formatPaymentDueShort,
  inferPaymentDueRule,
  resolvePaymentDueIso,
  type PaymentDueRule,
} from './paymentDueRule'
import {
  collectSourceClientNamesFromSlots,
  runPostGenerationAudit,
  type PostGenerationAuditResult,
} from './postGenerationAudit'
import { assertOvertimeValueSource } from './numericSemanticFamily'
import { formatContractDateShort } from '@/lib/utils/contractCommercialVariables'
import type { FinalContractGenerationArtifact } from './finalContractGenerationArtifact'
import { devErrorArgs, devInfoArgs, devWarnArgs } from '@/lib/debug/devConsole'

export interface TransformContractInput {
  wedding: Wedding
  templateId: string
  /** Pin regeneration to the version used by the saved artifact. */
  templateVersionId?: string
  /**
   * Explicit package-contract generation from the wedding route.
   * When true, use persisted bindings only (no runtime sync / re-detection).
   */
  packageContractMode?: boolean
  packageId?: string | null
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
  /** Optional correlation id for pipeline diagnostics. */
  correlationId?: string
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
  paymentDueRule: PaymentDueRule | null
  postGenerationAudit: PostGenerationAuditResult
  /**
   * Frozen generation artifact — preview, save, and PDF must share these bytes
   * and fingerprints. Present for sparse full-AI generation.
   */
  finalArtifact?: FinalContractGenerationArtifact | null
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
  const correlationId = input.correlationId ?? createGenerationCorrelationId()
  const trace: GenerationStageTrace = {
    correlationId,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId ?? null,
    weddingId: input.wedding.id,
  }

  try {
    await requireStudioUserId()

    logGenerationStage(trace, 'docx_source_load', 'started')
    const template = await documentTemplateService.get(input.templateId)
    if (!template) {
      throw wrapGenerationFailure(
        trace,
        'docx_source_load',
        'template_version_not_found',
        new Error('Nie znaleziono szablonu umowy.'),
        'Nie znaleziono szablonu umowy.',
      )
    }

    // Product-ready templates may still have legacy DB status "incomplete"
    // (slotBindingsReady false). Do not hard-block — usability is decided
    // upstream by isTemplateUsableForGeneration / GenerationReviewState.
    if (template.status === 'archived') {
      throw wrapGenerationFailure(
        trace,
        'review_state_validation',
        'template_not_usable',
        new Error('Szablon archiwalny nie może być użyty do generowania.'),
        'Szablon archiwalny nie może być użyty do generowania.',
      )
    }

    const versionId = input.templateVersionId ?? template.currentVersionId
    if (!versionId) {
      throw wrapGenerationFailure(
        trace,
        'docx_source_load',
        'template_version_not_found',
        new Error('Szablon nie ma aktywnej wersji.'),
        'Szablon nie ma aktywnej wersji.',
      )
    }
    trace.templateVersionId = versionId

    const version = await documentTemplateService.getVersion(versionId)
    if (!version) {
      throw wrapGenerationFailure(
        trace,
        'docx_source_load',
        'template_version_not_found',
        new Error('Nie znaleziono wersji szablonu.'),
        'Nie znaleziono wersji szablonu.',
      )
    }

    const sourcePath = version.sourceDocxPath
    if (!sourcePath) {
      throw wrapGenerationFailure(
        trace,
        'docx_source_load',
        'source_docx_not_found',
        new Error('Brak oryginalnego pliku umowy.'),
        'Brak oryginalnego pliku umowy.',
      )
    }

    const sourceBytes = await documentStorage.download(sourcePath)
    const { paragraphs: originalParagraphs, isDocx } =
      await extractAllParagraphs(sourceBytes, version.sourceFileName)

    if (originalParagraphs.length === 0) {
      throw wrapGenerationFailure(
        trace,
        'docx_source_load',
        'source_docx_not_found',
        new Error('Nie udało się odczytać treści umowy.'),
        'Nie udało się odczytać treści umowy.',
      )
    }
    logGenerationStage(trace, 'docx_source_load', 'succeeded')

    logGenerationStage(trace, 'slot_binding_resolution', 'started')
    const loadedMap = parseSlotMap(version.slotMap)
    logContractLoadedBindings({
      templateVersionId: versionId,
      phase: 'persisted-before-filter',
      slots: loadedMap.slots,
      paragraphIndex: 36,
    })

    const packageContractMode = Boolean(
      input.packageContractMode || template.meta?.packageContractMode,
    )
    let slotMap = loadedMap
    let syncedAddedCount = 0
    let runtimeSyncInvoked = false

    if (packageContractMode) {
      // Package contracts: review and renderer must share persisted bindings only.
      const {
        buildPackageContractGenerationModel,
        assertPackageContractPersistedOnly,
      } = await import('./packageContractGenerationModel')
      assertPackageContractPersistedOnly({
        packageContractMode: true,
        runtimeSyncInvoked: false,
      })
      const model = buildPackageContractGenerationModel({
        templateId: input.templateId,
        templateVersionId: versionId,
        packageId: input.packageId ?? null,
        slotMap: loadedMap,
      })
      slotMap = model.slotMap
      devInfoArgs('[package-contract-generation-source]', {
        mode: 'persisted_only',
        runtimeSyncInvoked: false,
        packageContractMode: true,
        templateId: input.templateId,
        templateVersionId: versionId,
        packageId: input.packageId ?? null,
        weddingId: input.wedding.id,
        logicalKeys: model.logicalFields.map((f) => f.registryKey),
        sharedSpanConflicts: model.sharedSpanConflicts,
      })
      for (const field of model.logicalFields) {
        if (
          field.registryKey === 'reception_location' ||
          field.registryKey === 'final_payment_due_date'
        ) {
          devInfoArgs('[package-contract-critical-binding]', {
            registryKey: field.registryKey,
            bindings: field.physicalBindings.map((b) => ({
              bindingId: b.bindingId,
              paragraphIndex: b.paragraphIndex,
              startOffset: b.startOffset,
              endOffset: b.endOffset,
              originalSpan: b.originalSpan,
              leftAnchor: b.leftAnchor,
              rightAnchor: b.rightAnchor,
            })),
          })
        }
      }
    } else {
      // Legacy templates: binder advances can outpace a stale slot_map.
      runtimeSyncInvoked = true
      const synced = syncPhysicalBindingsFromSource({
        slotMap: loadedMap,
        paragraphs: originalParagraphs,
      })
      slotMap = synced.slotMap
      syncedAddedCount = synced.diagnostic.added.length
    }

    if (packageContractMode && runtimeSyncInvoked) {
      throw wrapGenerationFailure(
        trace,
        'slot_binding_resolution',
        'slot_binding_unresolved',
        new Error('Package-contract generation must not invoke runtime binding sync.'),
        'Nie udało się przygotować umowy pakietu.',
      )
    }

    logContractLoadedBindings({
      templateVersionId: versionId,
      phase: 'after-physical-sync',
      slots: slotMap.slots,
      paragraphIndex: 36,
    })

    if (syncedAddedCount > 0 && !packageContractMode) {
      // Persist enriched bindings onto the same version so reload stays correct.
      try {
        const { error: persistError } = await supabase
          .from('document_template_versions')
          .update({ slot_map: slotMap })
          .eq('id', versionId)
        if (persistError) {
          devWarnArgs('[contract-loaded-bindings] persist sync failed', {
            templateVersionId: versionId,
            code: persistError.code ?? null,
          })
        } else {
          devInfoArgs('[contract-loaded-bindings]', {
            phase: 'persisted-sync-write',
            templateVersionId: versionId,
            addedCount: syncedAddedCount,
          })
          const templateMeta = template.meta ?? { version: 1 as const }
          await documentTemplateService.update(input.templateId, {
            meta: {
              ...templateMeta,
              version: 1,
              analysisVersion: CONTRACT_ANALYSIS_VERSION,
              readinessVersion: CONTRACT_READINESS_VERSION,
              lastAnalyzedAt: new Date().toISOString(),
              slotBindingsReady: true,
            },
          })
        }
      } catch (err) {
        devWarnArgs(
          '[contract-loaded-bindings] persist sync error',
          err instanceof Error ? err.name : typeof err,
        )
      }
    }

    const readiness = validateTemplateSlotBindings(slotMap)
    const boundSlots = slotMap.slots.filter(isSlotPhysicallyBound)
    logContractLoadedBindings({
      templateVersionId: versionId,
      phase: 'physically-bound-after-filter',
      slots: boundSlots,
      paragraphIndex: 36,
    })
    // Unbound optional/required slots are preserved in the DOCX — they must not
    // block generation when at least one physical binding exists.
    if (boundSlots.length === 0) {
      throw wrapGenerationFailure(
        trace,
        'slot_binding_resolution',
        'slot_binding_unresolved',
        new Error(
          readiness.unresolvedKeys.length > 0
            ? `Szablon nie ma fizycznych slotów do wypełnienia (${readiness.unresolvedKeys.slice(0, 6).join(', ')}). Ponownie przeanalizuj szablon.`
            : 'Szablon nie ma fizycznych slotów. Ponownie przeanalizuj szablon.',
        ),
        'Szablon nie ma fizycznych slotów. Ponownie przeanalizuj szablon.',
      )
    }
    logGenerationStage(trace, 'slot_binding_resolution', 'succeeded', {
      boundSlotCount: boundSlots.length,
      unresolvedRequiredCount: readiness.unresolvedKeys.length,
    })

    logGenerationStage(trace, 'semantic_values_resolution', 'started')
    const expandedOverrides = expandCoverageOverrides(input.overrides ?? {})
    const ctx = await resolveContractVariables({
      wedding: input.wedding,
      overrides: expandedOverrides,
      questionnaireAnswers: input.questionnaireAnswers,
      generationStartedAt: input.generationDate,
      executionSnapshot: input.executionSnapshot,
    })

    const packageSnapshot: PackageSnapshot =
      input.packageSnapshot ?? ctx.packageSnapshot

    const resolved = expandCoverageOverrides({ ...ctx.resolved, ...expandedOverrides })

    const companyCity =
      resolved.company_city?.trim() ||
      input.overrides?.company_city?.trim() ||
      null

    const execution = resolveContractExecutionValues({
      generationDate: input.generationDate ?? ctx.generationStartedAt,
      companyCity,
      snapshot: input.executionSnapshot ?? ctx.executionSnapshot,
    })
    for (const [key, value] of Object.entries(execution.values)) {
      if (value.trim()) resolved[key] = value.trim()
    }

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

    const needsExecDate = boundSlots.some(
      (s) =>
        s.physicallyBound !== false &&
        s.registryKey === 'contract_execution_date',
    )
    if (needsExecDate && !resolved.contract_execution_date?.trim()) {
      throw wrapGenerationFailure(
        trace,
        'semantic_values_resolution',
        'generation_input_invalid',
        new Error(
          'Szablon wymaga daty zawarcia umowy, ale nie udało się jej ustalić.',
        ),
        'Szablon wymaga daty zawarcia umowy, ale nie udało się jej ustalić.',
      )
    }

    const missingContactMessages: string[] = []
    for (const slot of boundSlots) {
      if (!slot.physicallyBound || !slot.registryKey) continue
      if ((slot.requirement ?? 'optional') !== 'required') continue
      const key = slot.registryKey
      const value =
        resolved[key]?.trim() || lookupResolvedValue(resolved, key)
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
      throw wrapGenerationFailure(
        trace,
        'semantic_values_resolution',
        'generation_input_invalid',
        new Error([...new Set(missingContactMessages)].join('\n')),
        'Brakuje wymaganych danych kontaktowych.',
      )
    }
    logGenerationStage(trace, 'semantic_values_resolution', 'succeeded')

    const omittedKeysStaging: string[] = []
    const pushOmit = (key: string) => {
      if (key.trim()) omittedKeysStaging.push(key.trim())
    }

    // Party block — capability-aware (composite vs separate physical slots).
    const partyPlan = resolvePartyBlock({
      slots: boundSlots,
      wedding: input.wedding,
    })
    const {
      preflightClientPartyGeneration,
      logPackageContractGenerationClientPartyTrace,
    } = await import('./clientPartyGenerationCapability')
    const clientPreflight = preflightClientPartyGeneration({
      capability: partyPlan.capability,
      wedding: {
        person1FullName: partyPlan.partner1Name,
        person2FullName: partyPlan.partner2Name,
      },
    })
    if (packageContractMode) {
      logPackageContractGenerationClientPartyTrace({
        weddingId: input.wedding.id,
        wedding: {
          person1FullName: partyPlan.partner1Name,
          person2FullName: partyPlan.partner2Name,
        },
        templateId: input.templateId,
        templateVersionId: versionId,
        slots: boundSlots,
        capability: partyPlan.capability,
        resolved: {
          ...resolved,
          ...partyPlan.overrides,
        },
        preflight: clientPreflight,
      })
    }
    if (!clientPreflight.ready && partyPlan.capability.physicalMode !== 'none') {
      throw wrapGenerationFailure(
        trace,
        'semantic_values_resolution',
        'generation_input_invalid',
        new Error(clientPreflight.message),
        clientPreflight.message,
      )
    }
    for (const [key, value] of Object.entries(partyPlan.overrides)) {
      if (value.trim()) resolved[key] = value.trim()
    }

    // Bind source participle as an owned slot when dual partners are composed.
    let slotsForApply = ensureCouplePartyParticipleSlot({
      slots: boundSlots,
      paragraphs: originalParagraphs,
      bothPartnersRepresented: partyPlan.bothPartnersRepresented,
    })
    if (!packageContractMode) {
      slotsForApply = ensureTeaserDurationSlots({
        slots: slotsForApply,
        paragraphs: originalParagraphs,
      })
      slotsForApply = ensureCoverageCollisionRepairSlots({
        slots: slotsForApply,
        paragraphs: originalParagraphs,
      })
    }
    if (packageContractMode) {
      const {
        normalizePhysicalBindings,
        slotsForSinglePassApply,
        logLogicalFieldModel,
      } = await import('./logicalContractFields')
      // Collapse overlapping same-key duplicates, then one write per physical span.
      slotsForApply = slotsForSinglePassApply(
        normalizePhysicalBindings(slotsForApply),
      )
      logLogicalFieldModel('package-slots-for-apply', slotsForApply)
      devInfoArgs('[package-contract-apply-bindings]', {
        templateVersionId: versionId,
        bindings: slotsForApply
          .filter((s) => s.enabled && s.registryKey && s.paragraphIndex != null)
          .map((s) => ({
            bindingId: s.id,
            registryKey: s.registryKey,
            paragraphIndex: s.paragraphIndex,
            startOffset: s.startOffset ?? s.allowedRange?.start ?? null,
            endOffset: s.endOffset ?? s.allowedRange?.end ?? null,
            leftAnchor: s.leftAnchor ?? null,
            rightAnchor: s.rightAnchor ?? null,
            originalSpan: s.originalText ?? null,
            source: 'persisted',
          })),
      })
    }
    const participleSlot = slotsForApply.find(
      (s) => s.registryKey === 'couple_party_participle',
    )
    if (participleSlot && partyPlan.bothPartnersRepresented) {
      const participle = resolveCouplePartyParticiple({
        bothPartnersRepresented: true,
        sourceParticiple: participleSlot.originalText,
      })
      if (participle) resolved.couple_party_participle = participle
    }
    if (
      partyPlan.addressAmbiguity &&
      !input.overrides?.[partyPlan.addressAmbiguity.slotKeys[0] ?? '']?.trim()
    ) {
      throw wrapGenerationFailure(
        trace,
        'semantic_values_resolution',
        'generation_input_invalid',
        new Error(
          'Partnerzy mają różne adresy, a szablon ma jedno pole adresu. Wybierz lub wpisz adres w kroku weryfikacji.',
        ),
        'Partnerzy mają różne adresy — uzupełnij adres pary w kroku weryfikacji.',
      )
    }

    // Payment due rule from template source evidence (not CRM −14d default alone).
    const paymentDueRule = inferPaymentDueRule({
      slots: boundSlots,
      paragraphTexts: originalParagraphs.map((p) => p.text),
    })
    const dueIso = resolvePaymentDueIso({
      rule: paymentDueRule,
      weddingDateIso: input.wedding.date,
      contractExecutionDateIso: resolved.contract_execution_date,
      templateDueText: boundSlots.find(
        (s) =>
          s.registryKey === 'final_payment_due_date' ||
          s.registryKey === 'payment_due_date',
      )?.originalText,
    })
    if (dueIso) {
      const short = formatPaymentDueShort(dueIso)
      if (short) {
        resolved.final_payment_due_date = short
        resolved.payment_due_date = short
      }
      resolved.final_payment_due_date_iso = dueIso
    } else if (
      paymentDueRule.type === 'manual_at_generation' &&
      boundSlots.some(
        (s) =>
          s.registryKey === 'final_payment_due_date' ||
          s.registryKey === 'payment_due_date' ||
          s.registryKey === 'final_payment_due_date_long',
      )
    ) {
      const manual =
        input.overrides?.final_payment_due_date?.trim() ||
        input.overrides?.payment_due_date?.trim() ||
        resolved.final_payment_due_date?.trim()
      if (!manual) {
        throw wrapGenerationFailure(
          trace,
          'semantic_values_resolution',
          'generation_input_invalid',
          new Error(
            'Termin płatności końcowej wymaga wyboru przy generowaniu.',
          ),
          'Uzupełnij termin płatności końcowej.',
        )
      }
    }

    // Overtime — only proven sources; otherwise preserve template (omit key).
    let overtimeSourceOk: boolean | undefined
    const overtimeSlot = boundSlots.find((s) =>
      s.registryKey === 'overtime_rate' ||
      s.registryKey === 'overtime_rate_formatted' ||
      s.registryKey === 'package_overtime_rate' ||
      s.registryKey === 'overtime_price',
    )
    if (overtimeSlot?.registryKey) {
      const check = assertOvertimeValueSource({
        registryKey: overtimeSlot.registryKey,
        resolvedValue:
          resolved[overtimeSlot.registryKey] ||
          resolved.overtime_rate ||
          resolved.overtime_rate_formatted ||
          '',
        weddingOvertimeRate: input.wedding.overtimeRate,
        manualOverride:
          input.overrides?.overtime_rate ||
          input.overrides?.overtime_rate_formatted,
        templateOriginal: overtimeSlot.originalText,
      })
      overtimeSourceOk = check.ok || check.source === 'template_preserved'
      if (!check.ok) {
        // Preserve template value — do not write an unproven number.
        pushOmit(overtimeSlot.registryKey)
        for (const k of [
          'overtime_rate',
          'overtime_rate_formatted',
          'overtime_rate_words',
          'overtime_price',
          'package_overtime_rate',
        ]) {
          resolved[k] = ''
          pushOmit(k)
        }
        // Preserving template is an acceptable outcome — not an audit failure.
        overtimeSourceOk = true
      }
    }

    const omittedKeys = [
      ...new Set(
        [
          ...(input.omittedKeys ?? []),
          ...omittedKeysStaging,
        ]
          .map((k) => k.trim())
          .filter(Boolean),
      ),
    ]
    for (const key of omittedKeys) {
      resolved[key] = ''
    }

    logGenerationStage(trace, 'docx_render', 'started')
    assertSafeMoneyPairsForGeneration({
      slots: boundSlots,
      paragraphs: originalParagraphs,
    })

    logContractLoadedBindings({
      templateVersionId: versionId,
      phase: 'slots-for-apply-before-render',
      slots: slotsForApply,
      paragraphIndex: 36,
    })

    const applied = applyBoundSlotsToParagraphs({
      original: originalParagraphs,
      slots: slotsForApply,
      resolved,
      omittedKeys,
    })

    if (applied.failures.length > 0) {
      const placeholderFail = applied.failures.filter((f) =>
        /placeholder|Package material/i.test(f.reason),
      )
      if (placeholderFail.length > 0) {
        throw wrapGenerationFailure(
          trace,
          'semantic_values_resolution',
          'generation_input_invalid',
          new Error(
            placeholderFail.map((f) => f.reason).join('\n'),
          ),
          'Uzupełnij brakujące wartości pakietu przed generowaniem.',
        )
      }
      const detail = applied.failures
        .map((f) => `${f.registryKey}: ${f.reason}`)
        .join('\n')
      throw wrapGenerationFailure(
        trace,
        'docx_render',
        'docx_render_failed',
        new Error(
          `Nie udało się bezpiecznie zlokalizować slotów w dokumencie:\n${detail}`,
        ),
        'Nie udało się bezpiecznie zlokalizować slotów w dokumencie.',
      )
    }

    // Do not rewrite „zwaną/zwani” outside an owned slot. Participle changes
    // require a verified couple_party_participle physical span (see ensure).

    const staleMoney = findStaleMoneySourcePhrases({
      transformed: applied.paragraphs,
      slots: slotsForApply,
      resolved,
    })
    if (staleMoney.length > 0) {
      const detail = staleMoney
        .map(
          (s) =>
            `${s.registryKey} still has source “${s.originalText}” in paragraph ${s.paragraphIndex}`,
        )
        .join('\n')
      throw wrapGenerationFailure(
        trace,
        'docx_render',
        'docx_render_failed',
        new Error(`Stale financial source values after generation:\n${detail}`),
        'Nie udało się bezpiecznie zaktualizować kwot w dokumencie.',
      )
    }

    const transformed = applied.paragraphs
    const allowedValues = allowedValuesList(resolved, omittedKeys)

    const quality = verifyContractTransformation({
      original: originalParagraphs,
      transformed,
      allowedValues,
      resolvedByKey: resolved,
      slots: slotsForApply,
      replacementTraces: applied.replacementTraces,
    })

    if (!quality.ok) {
      const full =
        quality.report ??
        quality.reason ??
        'Transformacja zmieniła więcej niż wartości zmiennych — przerwano.'
      // Persist full diff — never truncate in DEV diagnostics.
      logGenerationStage(trace, 'docx_render', 'failed', {
        code: 'docx_render_failed',
        qualityFailureCount: quality.failures?.length ?? 0,
        qualityReport: full,
        qualityFailures: quality.failures?.map((f) => ({
          index: f.index,
          original: f.original,
          generated: f.generated,
          unexpectedEdits: f.unexpectedEdits,
          expectedVariableChanges: f.expectedVariableChanges,
          structuralIssue: f.structuralIssue,
          protectedOriginal: f.protectedOriginal,
          protectedGenerated: f.protectedGenerated,
          unifiedDiff: f.unifiedDiff,
        })),
        replacementTraces: applied.replacementTraces,
      })
      if (import.meta.env.DEV && typeof console !== 'undefined') {
        // Chunked so browser consoles do not truncate the diagnostic.
        // DEV only — paragraph text is contract content (PII risk).
        devErrorArgs('[contract-generation] QUALITY DIFF FULL', {
          correlationId: trace.correlationId,
          failureCount: quality.failures?.length ?? 0,
        })
        for (const f of quality.failures ?? []) {
          devErrorArgs(
            `[contract-generation] QUALITY PARA ${f.index}\n` +
              `ORIGINAL:\n${f.original}\n\nGENERATED:\n${f.generated}\n\n` +
              `UNEXPECTED:\n${JSON.stringify(f.unexpectedEdits, null, 2)}\n\n` +
              `SLOTS:\n${JSON.stringify(f.expectedVariableChanges, null, 2)}\n\n` +
              `DIFF:\n${f.unifiedDiff}`,
          )
        }
      }
      throw wrapGenerationFailure(
        trace,
        'docx_render',
        'docx_render_failed',
        new Error(full),
        'Nie udało się bezpiecznie wygenerować umowy. Treść dokumentu została zabezpieczona przed nieautoryzowaną zmianą.',
      )
    }

    const finalParagraphs: DocxParagraph[] = transformed.map((p) => ({
      index: p.index,
      text: p.text,
    }))

    const sourceWeddingDate = boundSlots.find(
      (s) => s.registryKey === 'wedding_date',
    )?.originalText

    let auditParagraphs = finalParagraphs
    const hoursNum = Number(
      String(resolved.coverage_hours || resolved.coverage_duration || '').match(
        /\d+/,
      )?.[0],
    )
    const durationPhrase = Number.isFinite(hoursNum)
      ? formatPolishHours(hoursNum)
      : ''
    const endOk = Boolean(extractClockTimeOnly(resolved.coverage_end_time || ''))
    if (durationPhrase && endOk) {
      const repaired = repairDurationEndTimeCollisions({
        paragraphs: auditParagraphs,
        durationPhrase,
      })
      if (repaired.repaired) {
        auditParagraphs = repaired.paragraphs
        for (const p of auditParagraphs) {
          const idx = applied.paragraphs.findIndex((x) => x.index === p.index)
          if (idx >= 0) applied.paragraphs[idx] = { ...p }
        }
      }
    }

    const postGenerationAudit = runPostGenerationAudit({
      paragraphs: auditParagraphs,
      slots: slotsForApply,
      wedding: input.wedding,
      resolved,
      applied: applied.applied,
      paymentDueRule,
      sourceClientNames: collectSourceClientNamesFromSlots(slotsForApply),
      sourceWeddingDateText: sourceWeddingDate,
      overtimeSourceOk,
    })

    if (!postGenerationAudit.ok) {
      const blockers = postGenerationAudit.actionableIssues.filter(
        (i) => i.severity === 'critical',
      )
      if (blockers.length > 0) {
        const messages = blockers.map((i) => i.message)
        const fromAudit = reviewFieldsFromAuditMessages(messages)
        const actionableReview: ActionableGenerationReviewPayload = {
          editableFields: fromAudit.editableFields.map((f) => ({
            id: f.id,
            registryKey: f.registryKey,
            label: f.label,
            placeholder: f.placeholder,
            group: f.group,
            sourceLabel: f.sourceLabel,
          })),
          contextualMessages: [
            ...fromAudit.contextualIssues.map((i) => i.message),
            ...messages,
          ].filter((m, i, arr) => arr.indexOf(m) === i),
        }
        // Actionable review is a normal control-flow outcome — never "failed".
        logGenerationStage(trace, 'semantic_values_resolution', 'needs_review', {
          messages,
          fieldKeys: actionableReview.editableFields.map((f) => f.registryKey),
        })
        throw new TransformNeedsReviewSignal(
          messages,
          actionableReview,
          trace.correlationId,
        )
      }
    }

    // Ensure wedding date formatting in resolved bag for diagnostics
    if (input.wedding.date && !resolved.wedding_date?.includes('.')) {
      const short = formatContractDateShort(input.wedding.date)
      if (short) resolved.wedding_date = short
    }

    const docxBytes = await materializeDocx({
      sourceBytes,
      isDocx,
      paragraphs: auditParagraphs,
      spanEdits: applied.spanEdits,
    })
    if (!docxBytes || docxBytes.byteLength === 0) {
      throw wrapGenerationFailure(
        trace,
        'docx_render',
        'docx_render_failed',
        new Error('Wygenerowany DOCX jest pusty.'),
        'Wygenerowany DOCX jest pusty.',
      )
    }
    logGenerationStage(trace, 'docx_render', 'succeeded', {
      docxBytes: docxBytes.byteLength,
    })

    logGenerationStage(trace, 'generated_contract_persist', 'started')
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
    logGenerationStage(trace, 'generated_contract_persist', 'succeeded', {
      draftId: draft.id,
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
      paragraphs: auditParagraphs,
      docxBytes,
      usedMock: false,
      qualityRetries: 0,
      executionSnapshot: executionSnapshotForSave,
      paymentDueRule,
      postGenerationAudit,
    }
  } catch (err) {
    if (err instanceof TransformNeedsReviewSignal) throw err
    if (err instanceof GenerationPipelineError) throw err
    throw wrapGenerationFailure(
      trace,
      'unexpected_generation_error',
      'unexpected_generation_error',
      err,
      'Nie udało się wygenerować umowy.',
    )
  }
}
