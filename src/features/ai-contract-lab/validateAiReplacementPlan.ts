import type {
  AiContractAnalysisResult,
  ApprovedContractPatch,
  ContractCanonicalField,
  DocumentTextAnchor,
  LabReplacementRow,
  ManualMissingFieldValue,
  ReplacementDecision,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { aiContractAnalysisResultSchema } from '@/features/ai-contract-lab/aiContractLabSchemas'
import {
  isMissingFieldResolved,
  validateManualFieldValue,
} from '@/features/ai-contract-lab/manualMissingValues'
import {
  isEllipsisProposal,
  resolveExactSourceSpan,
  validateManualSourceSpan,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'
import { gateMissingFieldClassifications } from '@/features/ai-contract-lab/gateMissingFieldClassifications'

export function confidenceLabel(
  confidence: number,
): LabReplacementRow['confidenceLabel'] {
  if (confidence >= 0.92) return 'Wysoka'
  if (confidence >= 0.7) return 'Średnia'
  return 'Niska'
}

export function normalizeComparableText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function valuesAreEquivalent(a: string, b: string): boolean {
  return normalizeComparableText(a) === normalizeComparableText(b)
}

export type SourceSpanCounters = {
  exactSourceMatches: number
  normalizedSourceMatches: number
  ambiguousSourceMatches: number
  missingSourceMatches: number
  ellipsisProposals: number
}

export type ValidateAiPlanResult =
  | {
      ok: true
      analysis: AiContractAnalysisResult
      counters: SourceSpanCounters
      /** Soft per-row issues — analysis still usable. */
      rowWarnings: string[]
    }
  | { ok: false; errors: string[] }

const MSG_AMBIGUOUS =
  'AI rozpoznało miejsce zmiany, ale nie udało się jednoznacznie wskazać dokładnego fragmentu tekstu. Wybierz właściwy fragment ręcznie. Oryginalny dokument nie został zmieniony.'

const MSG_NOT_FOUND =
  'Proponowany tekst źródłowy nie występuje w tym fragmencie dokumentu. Ta zmiana wymaga ponownej analizy lub ręcznego wskazania. Oryginalny dokument nie został zmieniony.'

/**
 * Local Zod + semantic validation.
 * Invalid source spans do NOT fail the whole analysis — they become
 * ambiguous / not_found rows for manual resolution.
 */
export function validateAiReplacementPlan(
  raw: unknown,
  anchors: DocumentTextAnchor[],
  fields: ContractCanonicalField[],
): ValidateAiPlanResult {
  const parsed = aiContractAnalysisResultSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    }
  }

  const analysis = parsed.data as AiContractAnalysisResult
  const anchorIds = new Set(anchors.map((a) => a.anchorId))
  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const hardErrors: string[] = []
  const rowWarnings: string[] = []
  const counters: SourceSpanCounters = {
    exactSourceMatches: 0,
    normalizedSourceMatches: 0,
    ambiguousSourceMatches: 0,
    missingSourceMatches: 0,
    ellipsisProposals: 0,
  }

  const resolvedReplacements: AiContractAnalysisResult['replacements'] = []
  const extraAmbiguities: AiContractAnalysisResult['ambiguities'] = [
    ...analysis.ambiguities,
  ]

  for (const r of analysis.replacements) {
    if (isEllipsisProposal(r.originalText)) counters.ellipsisProposals += 1

    if (!anchorIds.has(r.anchorId)) {
      rowWarnings.push(`Nieznany anchor: ${r.anchorId} — pominięto zmianę.`)
      counters.missingSourceMatches += 1
      continue
    }
    const field = fieldByKey.get(r.canonicalFieldKey)
    if (!field) {
      rowWarnings.push(
        `Nieznane pole kanoniczne: ${r.canonicalFieldKey} — pominięto zmianę.`,
      )
      continue
    }
    const expected = field.formattedValue
    if (expected == null) {
      rowWarnings.push(
        `Pole ${r.canonicalFieldKey} nie ma wartości — pominięto zmianę.`,
      )
      continue
    }
    if (!valuesAreEquivalent(expected, r.proposedValue)) {
      rowWarnings.push(
        `AI wymyśliło wartość dla ${r.canonicalFieldKey} — pominięto zmianę.`,
      )
      continue
    }

    const anchor = anchors.find((a) => a.anchorId === r.anchorId)!
    const span = resolveExactSourceSpan(anchor.text, r.originalText, {
      prefixContext: r.prefixContext,
      suffixContext: r.suffixContext,
      proposedValue: r.proposedValue,
    })

    if (span.status === 'exact' || span.status === 'normalized_exact') {
      if (span.status === 'exact') counters.exactSourceMatches += 1
      else counters.normalizedSourceMatches += 1
      resolvedReplacements.push({
        ...r,
        originalText: span.exactSourceText,
      })
      continue
    }

    if (span.status === 'ambiguous') {
      counters.ambiguousSourceMatches += 1
      extraAmbiguities.push({
        ambiguityId: `span:${r.replacementId}`,
        anchorId: r.anchorId,
        originalText: r.originalText,
        candidateFieldKeys: [r.canonicalFieldKey],
        reason: MSG_AMBIGUOUS,
      })
      // Keep replacement with AI text for UI — buildReplacementRows will mark span
      resolvedReplacements.push(r)
      rowWarnings.push(
        `${r.replacementId}: niejednoznaczny fragment źródłowy.`,
      )
      continue
    }

    counters.missingSourceMatches += 1
    resolvedReplacements.push(r)
    rowWarnings.push(
      `${r.replacementId}: ${MSG_NOT_FOUND}`,
    )
  }

  for (const a of analysis.ambiguities) {
    if (!anchorIds.has(a.anchorId)) {
      rowWarnings.push(`Ambiguity: nieznany anchor ${a.anchorId}`)
    }
    for (const key of a.candidateFieldKeys) {
      if (!fieldByKey.has(key)) {
        rowWarnings.push(`Ambiguity: nieznane pole ${key}`)
      }
    }
  }

  // Soft gate for missing fields — run before hard rejection of missing items
  const gated = gateMissingFieldClassifications({
    missingFields: analysis.missingFields,
    replacements: resolvedReplacements,
    ambiguities: extraAmbiguities,
    ignoredWeddingFields: analysis.ignoredWeddingFields ?? [],
    anchors,
    fields,
  })

  // Re-validate any replacements promoted from missing (source spans)
  const finalReplacements: AiContractAnalysisResult['replacements'] = []
  const seenReplacementIds = new Set<string>()
  for (const r of gated.replacements) {
    if (seenReplacementIds.has(r.replacementId)) continue
    seenReplacementIds.add(r.replacementId)

    // Already processed AI replacements are in resolvedReplacements with
    // possibly rewritten originalText — keep them.
    const already = resolvedReplacements.find(
      (x) => x.replacementId === r.replacementId,
    )
    if (already) {
      finalReplacements.push(already)
      continue
    }

    // Promoted from missing — validate span
    if (!anchorIds.has(r.anchorId)) continue
    const field = fieldByKey.get(r.canonicalFieldKey)
    if (!field?.formattedValue) continue
    if (!valuesAreEquivalent(field.formattedValue, r.proposedValue)) continue

    const anchor = anchors.find((a) => a.anchorId === r.anchorId)!
    const span = resolveExactSourceSpan(anchor.text, r.originalText, {
      prefixContext: r.prefixContext,
      suffixContext: r.suffixContext,
      proposedValue: r.proposedValue,
    })
    if (span.status === 'exact' || span.status === 'normalized_exact') {
      if (span.status === 'exact') counters.exactSourceMatches += 1
      else counters.normalizedSourceMatches += 1
      finalReplacements.push({
        ...r,
        originalText: span.exactSourceText,
      })
    } else if (span.status === 'ambiguous') {
      counters.ambiguousSourceMatches += 1
      gated.ambiguities.push({
        ambiguityId: `span:${r.replacementId}`,
        anchorId: r.anchorId,
        originalText: r.originalText,
        candidateFieldKeys: [r.canonicalFieldKey],
        reason: MSG_AMBIGUOUS,
      })
      finalReplacements.push(r)
    } else {
      counters.missingSourceMatches += 1
      finalReplacements.push(r)
    }
  }

  console.info('[ai-contract-lab] source-span counters', counters)
  console.info('[ai-contract-lab] missing-field gate', gated.counters)

  if (hardErrors.length > 0) return { ok: false, errors: hardErrors }

  return {
    ok: true,
    analysis: {
      ...analysis,
      replacements: finalReplacements,
      missingFields: gated.missingFields,
      ambiguities: gated.ambiguities,
      ignoredWeddingFields: gated.ignoredWeddingFields,
    },
    counters,
    rowWarnings,
  }
}

export function buildReplacementRows(
  analysis: AiContractAnalysisResult,
  fields: ContractCanonicalField[],
  anchors: DocumentTextAnchor[] = [],
): LabReplacementRow[] {
  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const anchorById = new Map(anchors.map((a) => [a.anchorId, a]))

  return analysis.replacements.map((r) => {
    const field = fieldByKey.get(r.canonicalFieldKey)
    const proposed = field?.formattedValue ?? r.proposedValue
    const anchor = anchorById.get(r.anchorId)
    const aiProposed = r.originalText
    const span = anchor
      ? resolveExactSourceSpan(anchor.text, r.originalText, {
          prefixContext: r.prefixContext,
          suffixContext: r.suffixContext,
          proposedValue: r.proposedValue,
        })
      : ({ status: 'not_found' } as const)

    let originalText = r.originalText
    let spanStatus: LabReplacementRow['spanStatus'] = 'not_found'
    let spanMessage: string | null = null
    let spanCandidates: LabReplacementRow['spanCandidates'] = []
    let spanStart: number | null = null
    let spanEnd: number | null = null
    let decision: ReplacementDecision = 'pending'

    if (span.status === 'exact' || span.status === 'normalized_exact') {
      originalText = span.exactSourceText
      spanStatus = span.status
      spanStart = span.start
      spanEnd = span.end
      const unchanged = valuesAreEquivalent(originalText, proposed)
      if (unchanged) decision = 'unchanged'
      else if (r.confidence >= 0.92 && !r.requiresUserReview) {
        decision = 'approved'
      } else {
        decision = 'pending'
      }
    } else if (span.status === 'ambiguous') {
      spanStatus = 'ambiguous'
      spanMessage = MSG_AMBIGUOUS
      spanCandidates = span.candidates
      decision = 'pending'
    } else {
      spanStatus = 'not_found'
      spanMessage = MSG_NOT_FOUND
      decision = 'pending'
    }

    return {
      replacementId: r.replacementId,
      anchorId: r.anchorId,
      originalText,
      canonicalFieldKey: r.canonicalFieldKey,
      proposedValue: proposed,
      semanticRole: r.semanticRole,
      reason: r.reason,
      confidence: r.confidence,
      confidenceLabel: confidenceLabel(r.confidence),
      source: field?.source ?? 'wedding',
      decision,
      manualValue: null,
      missingId: null,
      requiresUserReview:
        spanStatus === 'ambiguous' ||
        spanStatus === 'not_found' ||
        r.requiresUserReview ||
        r.confidence < 0.92,
      contextSnippet: anchor
        ? `«${anchor.text.slice(0, 160)}${anchor.text.length > 160 ? '…' : ''}»`
        : null,
      spanStatus,
      spanMessage,
      aiProposedSourceText: aiProposed,
      spanCandidates,
      spanStart,
      spanEnd,
      prefixContext: r.prefixContext ?? null,
      suffixContext: r.suffixContext ?? null,
    }
  })
}

/** Apply a user-entered exact substring for an ambiguous/not_found row. */
export function applyManualSourceSpanToRow(
  row: LabReplacementRow,
  anchorText: string,
  exactSourceText: string,
): { ok: true; row: LabReplacementRow } | { ok: false; error: string } {
  const span = validateManualSourceSpan(anchorText, exactSourceText)
  if (span.status === 'not_found') {
    return {
      ok: false,
      error:
        'Podany fragment nie występuje w tym akapicie. Wklej dokładny tekst z dokumentu.',
    }
  }
  if (span.status === 'ambiguous') {
    return {
      ok: false,
      error:
        'Podany fragment występuje wielokrotnie w akapicie. Wskaż dłuższy, unikalny fragment.',
    }
  }
  if (span.status !== 'exact') {
    return { ok: false, error: 'Nie udało się zweryfikować fragmentu.' }
  }
  return {
    ok: true,
    row: {
      ...row,
      originalText: span.exactSourceText,
      spanStatus: 'resolved_manual',
      spanMessage: null,
      spanCandidates: [],
      spanStart: span.start,
      spanEnd: span.end,
      source: 'manual',
      decision: 'pending',
      requiresUserReview: true,
      manualValue: row.proposedValue,
    },
  }
}

function patchSourceFromRow(
  row: LabReplacementRow,
): ApprovedContractPatch['source'] {
  if (row.source === 'manual' || row.missingId || row.spanStatus === 'resolved_manual') {
    return 'manual'
  }
  if (row.source.includes('company') || row.source.includes('studio')) {
    return 'company'
  }
  if (row.source.includes('package')) return 'package'
  if (row.source.includes('extra')) return 'extra'
  if (row.source.includes('payment')) return 'payment'
  return 'wedding'
}

/**
 * Convert approved rows into deterministic patches.
 * Patch source text is always an exact slice of the original anchor.
 */
export function buildApprovedPatches(input: {
  rows: LabReplacementRow[]
  anchors: DocumentTextAnchor[]
  manual: ManualMissingFieldValue[]
  missing: AiContractAnalysisResult['missingFields']
}): { patches: ApprovedContractPatch[]; errors: string[] } {
  const errors: string[] = []
  const patches: ApprovedContractPatch[] = []
  const anchorById = new Map(input.anchors.map((a) => [a.anchorId, a]))
  const usedRanges = new Map<string, Array<{ start: number; end: number }>>()
  const manualById = new Map(input.manual.map((m) => [m.missingId, m]))

  for (const field of input.missing) {
    const entry = manualById.get(field.missingId)
    if (!entry?.value.trim()) {
      errors.push(`Uzupełnij wymagane pole: ${field.label}`)
      continue
    }
    const typeError = validateManualFieldValue(
      field.expectedDataType,
      entry.value,
    )
    if (typeError) {
      errors.push(`${field.label}: ${typeError}`)
      continue
    }
    if (!isMissingFieldResolved(entry)) {
      errors.push(`Nieuzupełnione pole: ${field.label}`)
      continue
    }

    const related = input.rows.filter((r) => r.missingId === field.missingId)
    if (related.length === 0) {
      errors.push(
        `Brak propozycji zmian dla pola „${field.label}” — wróć do brakujących danych.`,
      )
      continue
    }
    if (related.length < field.affectedAnchorIds.length) {
      errors.push(
        `Pole „${field.label}” nie ma propozycji dla wszystkich fragmentów dokumentu.`,
      )
    }
    for (const row of related) {
      if (row.decision === 'pending') {
        errors.push(
          `Zatwierdź lub odrzuć ręczną zmianę: ${row.semanticRole || field.label}`,
        )
      } else if (row.decision === 'rejected') {
        errors.push(
          `Odrzucona wymagana zmiana dla „${field.label}” — generowanie zablokowane.`,
        )
      }
    }
  }

  for (const row of input.rows) {
    if (row.decision === 'rejected' || row.decision === 'unchanged') continue

    if (
      row.spanStatus === 'ambiguous' ||
      row.spanStatus === 'not_found'
    ) {
      errors.push(
        row.spanMessage ||
          `Nierozwiązany fragment źródłowy: ${row.semanticRole || row.replacementId}`,
      )
      continue
    }

    if (row.decision !== 'approved') {
      if (!row.missingId) {
        errors.push(
          `Wymagana decyzja użytkownika: ${row.semanticRole || row.replacementId}`,
        )
      }
      continue
    }

    const replacementText =
      row.source === 'manual' || row.spanStatus === 'resolved_manual'
        ? row.proposedValue
        : row.manualValue?.trim() || row.proposedValue
    const anchor = anchorById.get(row.anchorId)
    if (!anchor) {
      errors.push(`Brak anchora ${row.anchorId}`)
      continue
    }

    // Always re-verify exact slice from the live anchor
    const start =
      row.spanStart != null &&
      row.spanEnd != null &&
      anchor.text.slice(row.spanStart, row.spanEnd) === row.originalText
        ? row.spanStart
        : anchor.text.indexOf(row.originalText)
    if (start < 0) {
      errors.push(`Nie znaleziono tekstu w ${row.anchorId}`)
      continue
    }
    const end = start + row.originalText.length
    if (anchor.text.slice(start, end) !== row.originalText) {
      errors.push(`Niespójny fragment źródłowy w ${row.anchorId}`)
      continue
    }
    const ranges = usedRanges.get(row.anchorId) ?? []
    if (ranges.some((r) => !(end <= r.start || start >= r.end))) {
      errors.push(`Nakładające się poprawki w ${row.anchorId}`)
      continue
    }
    ranges.push({ start, end })
    usedRanges.set(row.anchorId, ranges)

    patches.push({
      patchId: row.replacementId,
      anchorId: row.anchorId,
      paragraphIndex: anchor.paragraphIndex,
      expectedOriginalText: row.originalText,
      replacementText,
      canonicalFieldKey: row.canonicalFieldKey,
      source: patchSourceFromRow(row),
      approvedByUser: true,
      spanStart: start,
      spanEnd: end,
    })
  }

  return { patches, errors }
}
