/**
 * Build template slots from AI analysis + two-pass candidate detection + SlotBinder.
 */

import type { AiDocumentAnalysisResult } from '@/features/documents/ai/types'
import {
  isCoupleFacingRegistryKey,
  isPackageFacingRegistryKey,
  isStudioFacingRegistryKey,
  registryPolishLabel,
  resolvePackageVariableId,
  resolveToRegistryKey,
} from '@/features/documents/ai/canonicalVariableIds'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import { getPackageVariableDef } from '@/features/documents/registry/packageVariables'
import {
  candidatesToTemplateSlots,
  detectContractCandidates,
  summarizeDetection,
} from './candidateDetection'
import { analyzePartyCompleteness } from './contractPartyCompleteness'
import {
  buildSlotSafetyReport,
  collectUnsafeBoundSlots,
  validateMinimalSlotSpan,
} from './contractSlotSafety'
import { analyzeMoneyPairs } from './contractMoneyPairs'
import { auditContractDynamicCoverage } from './contractDynamicCoverage'
import { bindSlotsFromAnalysis } from './slotBinder'
import {
  canonicalRegistryKey,
  dedupeSlotsByCanonicalKey,
} from './slotClassification'
import {
  finalizeSlotMapClassification,
  stripNonDetectedSlots,
  validateTemplateSlotBindings,
} from './templateReadiness'
import { paragraphFingerprint, type IndexedParagraph } from './extractDocxParagraphs'
import type {
  TemplateSlot,
  TemplateSlotMap,
  TemplateSlotSourceHint,
} from './types'

function sourceHintForKey(registryKey: string): TemplateSlotSourceHint {
  if (isStudioFacingRegistryKey(registryKey)) return 'company'
  if (isPackageFacingRegistryKey(registryKey)) return 'package'
  if (registryKey === 'package.name' || registryKey === 'package_name') {
    return 'couple'
  }
  const system = SystemVariableRegistry.get(registryKey)
  if (system?.category === 'wedding') return 'wedding'
  if (system?.category === 'package') return 'package'
  if (system?.category === 'company') return 'company'
  if (isCoupleFacingRegistryKey(registryKey)) return 'couple'
  return 'unknown'
}

function primaryId(raw: string): string | null {
  const system = SystemVariableRegistry.get(raw)
  if (system) return system.id
  const pkg = resolvePackageVariableId(raw) ?? getPackageVariableDef(raw)?.id
  if (pkg) return pkg
  const legacy = resolveToRegistryKey(raw)
  if (legacy) {
    return SystemVariableRegistry.get(legacy)?.id ?? legacy
  }
  return null
}

function labelFor(id: string): string {
  const system = SystemVariableRegistry.get(id)
  if (system) return system.label
  try {
    return registryPolishLabel(id)
  } catch {
    return id.replace(/_/g, ' ')
  }
}

export function inferExampleText(
  registryKey: string,
  plainText: string,
): string | null {
  const text = plainText.replace(/\s+/g, ' ').trim()
  if (!text) return null

  if (registryKey === 'wedding_date' || registryKey.includes('date')) {
    const m = text.match(
      /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})\b/,
    )
    return m?.[1] ?? null
  }
  if (registryKey.includes('phone') || registryKey.includes('tel')) {
    const m = text.match(/\b(?:\+?\d{2}\s*)?(?:\d[\s-]?){8,11}\d\b/)
    return m?.[0]?.trim() ?? null
  }
  if (registryKey.includes('email')) {
    const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    return m?.[0] ?? null
  }
  if (
    registryKey === 'company_nip' ||
    registryKey === 'company_vat' ||
    registryKey.includes('nip')
  ) {
    const m = text.match(/\bNIP[:\s]*([0-9\s-]{10,13})\b/i)
    return m?.[1]?.replace(/\s+/g, '') ?? null
  }
  if (registryKey === 'company_regon' || registryKey.includes('regon')) {
    const m = text.match(/\bREGON[:\s]*([0-9]{9,14})\b/i)
    return m?.[1] ?? null
  }
  if (
    registryKey === 'company_bank_account' ||
    registryKey.includes('iban') ||
    registryKey.includes('bank')
  ) {
    const m = text.match(/\b(?:PL)?\s*((?:\d{2}\s*){10,13}\d{2})\b/)
    return m?.[1]?.replace(/\s+/g, ' ').trim() ?? null
  }
  if (
    registryKey === 'package_price' ||
    registryKey === 'deposit_amount' ||
    registryKey === 'contract_value_formatted' ||
    registryKey === 'agreed_deposit_formatted' ||
    registryKey === 'remaining_after_deposit_formatted' ||
    registryKey === 'remaining_payment' ||
    registryKey.includes('price') ||
    registryKey.includes('deposit')
  ) {
    const m = text.match(
      /\b(\d{1,3}(?:[ \u00a0]?\d{3})*(?:[.,]\d{2})?)\s*(?:zł|PLN|zl)\b/i,
    )
    return m?.[0] ?? null
  }
  if (
    registryKey === 'contract_value_words' ||
    registryKey === 'agreed_deposit_words' ||
    registryKey === 'remaining_after_deposit_words' ||
    registryKey.endsWith('_words')
  ) {
    const m = /\(\s*słownie\s*:\s*([^)]+?)\s*\)/i.exec(text)
    return m?.[1]?.trim() ?? null
  }
  return null
}

/**
 * AI presence hints only — never create unbound registry-wide slots.
 * Only keep AI keys that already have a physical candidate or pattern cue.
 */
function buildAiHintSlots(input: {
  ai: AiDocumentAnalysisResult
  plainText: string
  allowedKeys: Set<string>
}): TemplateSlot[] {
  const { ai, plainText, allowedKeys } = input
  const seen = new Set<string>()
  const slots: TemplateSlot[] = []

  const pushId = (raw: string, forcedHint?: TemplateSlotSourceHint) => {
    const id = primaryId(raw)
    if (!id) return
    const canonical = canonicalRegistryKey(id)
    if (!allowedKeys.has(canonical) && !allowedKeys.has(id)) return
    if (seen.has(canonical)) return
    seen.add(canonical)
    const legacyOrId =
      SystemVariableRegistry.get(canonical)?.legacyKey ??
      getPackageVariableDef(canonical)?.registryKey ??
      canonical
    const example = plainText ? inferExampleText(canonical, plainText) : null
    slots.push({
      id: `slot-${canonical}`,
      registryKey: canonical,
      label: labelFor(canonical),
      sourceHint: forcedHint ?? sourceHintForKey(legacyOrId),
      occurrences: 1,
      exampleText: example,
      enabled: true,
      placeholderInserted: false,
      physicallyBound: false,
      aliases: id !== canonical ? [id] : undefined,
    })
  }

  for (const field of ai.fields) {
    if (field.registryKey) pushId(field.registryKey)
    else if (field.label) {
      const resolved = primaryId(field.label.replace(/\s+/g, '_'))
      if (resolved) pushId(resolved)
    }
  }

  for (const pkgId of ai.packageVariables ?? []) {
    pushId(pkgId, 'package')
  }

  return slots
}

function bindByExampleText(
  slots: TemplateSlot[],
  paragraphs: IndexedParagraph[],
): TemplateSlot[] {
  const claimed = new Map<number, Array<{ start: number; end: number }>>()
  // Seed claimed with already-bound ranges
  for (const slot of slots) {
    if (
      slot.physicallyBound &&
      slot.paragraphIndex != null &&
      slot.startOffset != null &&
      slot.endOffset != null
    ) {
      const list = claimed.get(slot.paragraphIndex) ?? []
      list.push({ start: slot.startOffset, end: slot.endOffset })
      claimed.set(slot.paragraphIndex, list)
    }
  }

  const out: TemplateSlot[] = []

  for (const slot of slots) {
    if (slot.physicallyBound || !slot.registryKey) {
      out.push(slot)
      continue
    }
    const needle = slot.exampleText?.trim()
    if (!needle || needle.length < 2) {
      out.push(slot)
      continue
    }

    let found: TemplateSlot | null = null
    for (const para of paragraphs) {
      const idx = para.text.indexOf(needle)
      if (idx < 0) continue
      const range = { start: idx, end: idx + needle.length }
      const existing = claimed.get(para.index) ?? []
      if (existing.some((c) => c.start < range.end && range.start < c.end)) {
        continue
      }
      existing.push(range)
      claimed.set(para.index, existing)
      found = {
        ...slot,
        id: `slot-${slot.registryKey}-${para.index}-${idx}`,
        operation: 'replace',
        paragraphIndex: para.index,
        originalText: needle,
        allowedRange: range,
        startOffset: idx,
        endOffset: idx + needle.length,
        prefix: '',
        suffix: '',
        omissionMode: 'underscore',
        paragraphFingerprint: paragraphFingerprint(para.text),
        physicallyBound: true,
        detectionStatus: 'bound',
      }
      break
    }
    out.push(found ?? slot)
  }
  return out
}

function mergePreferBound(slots: TemplateSlot[]): TemplateSlot[] {
  const byKey = new Map<string, TemplateSlot>()
  for (const s of slots) {
    if (!s.registryKey) continue
    const key = canonicalRegistryKey(s.registryKey)
    const normalized = { ...s, registryKey: key, label: labelFor(key) }
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, normalized)
      continue
    }
    const score = (x: TemplateSlot) => {
      let n = 0
      if (x.physicallyBound) n += 100
      if (typeof x.confidence === 'number') n += x.confidence * 10
      if (x.needsConfirmation) n -= 5
      return n
    }
    if (score(normalized) > score(prev)) byKey.set(key, normalized)
  }
  return [...byKey.values()]
}

export function buildSlotsFromAnalysis(input: {
  ai: AiDocumentAnalysisResult
  plainText?: string
  paragraphs?: IndexedParagraph[]
  /** pdf stays evidence-only; never generation-ready. */
  sourceKind?: 'docx' | 'pdf' | string
}): TemplateSlotMap {
  const { ai, plainText = '', paragraphs = [], sourceKind = 'docx' } = input
  const joined = paragraphs.map((p) => p.text).join('\n') || plainText

  const unmappedDynamics = ai.fields
    .filter((f) => !f.registryKey)
    .map((f) => f.label)
    .filter(Boolean)

  // Pass 1+2 — concrete source spans with legal-context classification
  const candidates =
    paragraphs.length > 0 ? detectContractCandidates(paragraphs) : []
  const summary = summarizeDetection(candidates)
  console.info('[contract-candidate-detection] summary', summary)

  const candidateSlots = candidatesToTemplateSlots(candidates)
  const candidateKeys = new Set(
    candidateSlots
      .map((s) => s.registryKey)
      .filter((k): k is string => Boolean(k)),
  )

  if (paragraphs.length === 0) {
    const classified = finalizeSlotMapClassification(
      {
        version: 1,
        documentTitle: ai.documentType || undefined,
        slots: dedupeSlotsByCanonicalKey(candidateSlots),
        unmappedDynamics: [...new Set(unmappedDynamics)],
        sourceKind,
      },
      joined,
    )
    return stripNonDetectedSlots(classified)
  }

  // Pattern binder for remaining cue-based locations (blanks + filled)
  const aiHints = buildAiHintSlots({
    ai,
    plainText,
    allowedKeys: candidateKeys,
  })

  const bound = bindSlotsFromAnalysis({
    ai,
    paragraphs,
    semanticSlots: [...candidateSlots, ...aiHints],
  })

  let merged = mergePreferBound([...candidateSlots, ...bound.slots])
  merged = bindByExampleText(merged, paragraphs)
  merged = dedupeSlotsByCanonicalKey(merged)

  // Provider party data is immutable by default — binder/AI must not auto-create
  // dynamic company replace slots unless the user later links them.
  // Exception: company_city / company_city_locative used for contract execution place
  // remain dynamic (resolved from studio profile at generation time).
  const EXECUTION_CITY_KEYS = new Set(['company_city', 'company_city_locative'])
  merged = merged.map((slot) => {
    if (slot.sourceHint !== 'company') return slot
    if (slot.variableClassification === 'dynamic_candidate') return slot
    if (slot.registryKey && EXECUTION_CITY_KEYS.has(slot.registryKey)) {
      // Seat-clause city stays immutable; opening/execution city stays dynamic.
      const fromSeat =
        /siedzib/i.test(slot.evidenceText ?? '') ||
        /siedzib/i.test(slot.detectionReason ?? '') ||
        /siedzib/i.test(slot.leftAnchor ?? '')
      if (!fromSeat) return slot
    }
    const spanText = (slot.originalText ?? slot.exampleText ?? '').trim()
    const spanCheck = spanText
      ? validateMinimalSlotSpan({
          registryKey: slot.registryKey ?? 'company_name',
          text: spanText,
          operation: 'replace',
        })
      : null
    const unsafe = spanCheck ? !spanCheck.ok : false
    return {
      ...slot,
      variableClassification: unsafe
        ? ('ignored_non_variable' as const)
        : ('template_constant' as const),
      enabled: false,
      physicallyBound: false,
      needsConfirmation: false,
      requirement: 'optional' as const,
      detectionStatus: 'optional_unbound' as const,
      detectionReason: unsafe
        ? 'Zakres zbyt szeroki — dane usługodawcy pozostają tekstem szablonu (bez podmiany).'
        : 'Dane usługodawcy w szablonie — niezmienne domyślnie.',
      canLinkToCompany: !unsafe && Boolean(spanText),
      physicalSpanSafety: spanCheck?.physicalSpanSafety ?? slot.physicalSpanSafety,
      spanSafetyReasons: spanCheck?.blockingReasons ?? slot.spanSafetyReasons,
      spanSafetyMessage: unsafe
        ? 'Wykryty fragment zawiera nazwę firmy oraz dodatkowe dane lub treść prawną. Zawęź zakres przed potwierdzeniem.'
        : null,
    }
  })

  const warnings: string[] = []
  const party = analyzePartyCompleteness({
    paragraphs,
    slots: merged,
    profileRepresentativeCapacity: 1,
  })
  // Only blocking party warnings drive needs_review — immutable-provider info does not.
  for (const w of party.warnings) {
    if (/pozostaną bez zmian/i.test(w)) continue
    if (!warnings.includes(w)) warnings.push(w)
  }

  // Annotate unsafe spans. Immutable provider constants stay immutable (no confirm).
  merged = merged.map((slot) => {
    if (
      slot.variableClassification === 'template_constant' ||
      slot.variableClassification === 'ignored_non_variable'
    ) {
      return {
        ...slot,
        physicallyBound: false,
        enabled: false,
        needsConfirmation: false,
        requirement: 'optional' as const,
      }
    }
    const report = buildSlotSafetyReport(slot)
    if (report.physicalSpanSafety === 'unsafe') {
      const emptyPlaceholder =
        !(slot.originalText ?? '').trim() &&
        /placeholder|obfuscat|puste|zamazane/i.test(
          `${slot.detectionReason ?? ''} ${slot.spanSafetyReasons?.join(' ') ?? ''}`,
        )
      return {
        ...slot,
        physicalSpanSafety: emptyPlaceholder
          ? ('needs_review' as const)
          : ('unsafe' as const),
        detectedEntityTypes: report.detectedEntityTypes,
        legalWrapperTokensInside: report.legalWrapperTokensInside,
        spanSafetyReasons: report.blockingReasons,
        spanSafetyMessage: emptyPlaceholder
          ? 'Pole kontaktowe jest puste lub zamazane — wymaga uzupełnienia.'
          : 'Wykryty fragment zawiera nazwę firmy oraz dodatkowe dane lub treść prawną. Zawęź zakres przed potwierdzeniem.',
        physicallyBound: false,
        needsConfirmation: true,
        detectionStatus: 'ambiguous' as const,
        detectionReason:
          slot.detectionReason ??
          report.blockingReasons[0] ??
          slot.detectionReason,
      }
    }
    return {
      ...slot,
      physicalSpanSafety: report.physicalSpanSafety,
      detectedEntityTypes: report.detectedEntityTypes,
      legalWrapperTokensInside: report.legalWrapperTokensInside,
      spanSafetyReasons: report.blockingReasons,
      spanSafetyMessage: null,
    }
  })

  if (party.generationBlocked) {
    if (!warnings.some((w) => /pary|klienta|bezpieczn|zakres/i.test(w))) {
      warnings.push(
        'Analiza wymaga ręcznej weryfikacji — brak bezpiecznych powiązań danych klienta.',
      )
    }
  }
  void collectUnsafeBoundSlots

  // Money-pair invariant diagnostic (does not invent slots — detection already did).
  analyzeMoneyPairs({ slots: merged, paragraphs })

  const needsReview =
    party.generationBlocked || sourceKind === 'pdf' || warnings.length > 0

  const classified = finalizeSlotMapClassification(
    {
      version: 1,
      documentTitle: ai.documentType || undefined,
      slots: merged,
      unmappedDynamics: [...new Set(unmappedDynamics)],
      analysisWarnings: warnings,
      analysisStatus: needsReview ? 'needs_review' : 'complete',
      sourceKind,
      providerPartyMode: party.providerPartyMode,
      clientPartyMode: party.clientPartyMode,
    },
    joined,
  )

  const stripped = stripNonDetectedSlots(classified)
  // Keep ambiguous (needs confirmation) slots — stripNonDetected removes false_positive only
  const withAmbiguous = {
    ...stripped,
    slots: stripped.slots.filter((s) => {
      if (s.detectionStatus === 'false_positive') return false
      if (s.detectionStatus === 'duplicate_alias') return false
      if (s.dismissedAsNotPresent) return false
      return true
    }),
    analysisWarnings: warnings,
    analysisStatus: (needsReview ? 'needs_review' : 'complete') as
      | 'needs_review'
      | 'complete',
    sourceKind,
    providerPartyMode: party.providerPartyMode,
    clientPartyMode: party.clientPartyMode,
    counters: {
      ...stripped.counters!,
      detectedAutomatically: summary.detectedAutomatically,
      needsConfirmationCount: summary.needsConfirmation,
      ambiguousSlotCount: Math.max(
        stripped.counters?.ambiguousSlotCount ?? 0,
        summary.needsConfirmation,
      ),
    },
  }

  const readiness = validateTemplateSlotBindings(withAmbiguous, {
    paragraphs,
    sourceKind,
  })

  const coverage = auditContractDynamicCoverage({
    paragraphs,
    slotMap: withAmbiguous,
    sourceFormat: sourceKind,
    structureNotes: [
      'Body paragraphs via word/document.xml',
      'Tables: not present in this extractor path when tbl count is 0',
      'Headers/footers/text boxes: not merged into paragraph index stream',
    ],
  })

  const needsReviewFinal =
    readiness.needsReview || coverage.missedDynamicValues > 0

  return {
    ...withAmbiguous,
    counters: readiness.counters,
    analysisWarnings: [
      ...new Set([
        ...(withAmbiguous.analysisWarnings ?? []),
        ...readiness.analysisWarnings,
        ...(coverage.missedDynamicValues > 0
          ? [
              `Pokrycie dynamiczne: wykryto ${coverage.detectedDynamicValues}, prawdopodobnie brakuje ${coverage.missedDynamicValues}.`,
            ]
          : []),
      ]),
    ],
    analysisStatus: needsReviewFinal ? 'needs_review' : 'complete',
    lifecycleStatus: readiness.lifecycleStatus,
    providerPartyMode: party.providerPartyMode,
    clientPartyMode: party.clientPartyMode,
    dynamicCoverage: {
      detectedDynamicValues: coverage.detectedDynamicValues,
      missedDynamicValues: coverage.missedDynamicValues,
      emptyPlaceholders: coverage.emptyPlaceholders,
      unsupportedStructures: coverage.unsupportedStructures,
      coveragePercent: coverage.coveragePercent,
      items: coverage.items.map((i) => ({
        sourceText: i.redactedPreview,
        semanticConcept: i.semanticConcept,
        expectedKey: i.expectedKey,
        status: i.status,
        missReason: i.missReason,
        paragraphIndex: i.paragraphIndex,
      })),
    },
  }
}
