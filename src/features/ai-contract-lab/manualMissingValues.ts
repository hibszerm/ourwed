/**
 * Manual missing-field values → reviewable proposals → approved patches.
 * Session-only; never written to wedding / localStorage / contract history.
 */

import type {
  AiContractAnalysisResult,
  DocumentTextAnchor,
  LabReplacementRow,
  ManualMissingFieldValue,
  ManualReplacementProposal,
} from '@/features/ai-contract-lab/aiContractLabTypes'

export function createEmptyManualValues(
  missing: AiContractAnalysisResult['missingFields'],
): ManualMissingFieldValue[] {
  return missing.map((m) => ({
    missingId: m.missingId,
    value: '',
    affectedAnchorIds: [...m.affectedAnchorIds],
    semanticRole: m.semanticRole,
    expectedDataType: m.expectedDataType,
    label: m.label,
  }))
}

/** Polish validation for safely typed manual lab values. */
export function validateManualFieldValue(
  expectedDataType: string,
  value: string,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return 'To pole jest wymagane.'
  }

  const type = expectedDataType.trim().toLowerCase()

  switch (type) {
    case 'date': {
      // Accept ISO YYYY-MM-DD or common PL DD.MM.YYYY / DD-MM-YYYY
      const iso = /^\d{4}-\d{2}-\d{2}$/
      const pl = /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/
      if (!iso.test(trimmed) && !pl.test(trimmed)) {
        return 'Podaj datę w formacie RRRR-MM-DD lub DD.MM.RRRR.'
      }
      return null
    }
    case 'money': {
      const normalized = trimmed.replace(/\s/g, '').replace(',', '.')
      if (!/^-?\d+(\.\d{1,2})?$/.test(normalized) && !/^\d+([.,]\d{2})?\s*zł$/i.test(trimmed)) {
        return 'Podaj kwotę liczbową (np. 1500 lub 1500,00).'
      }
      return null
    }
    case 'phone': {
      const digits = trimmed.replace(/[\s()-]/g, '')
      if (!/^\+?\d{7,15}$/.test(digits)) {
        return 'Podaj prawidłowy numer telefonu.'
      }
      return null
    }
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return 'Podaj prawidłowy adres e-mail.'
      }
      return null
    }
    case 'number': {
      const normalized = trimmed.replace(',', '.')
      if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
        return 'Podaj liczbę.'
      }
      return null
    }
    case 'address':
    case 'text':
    case 'duration':
    case 'boolean':
    default:
      if (trimmed.length < 1) return 'To pole jest wymagane.'
      return null
  }
}

export function isMissingFieldResolved(
  entry: ManualMissingFieldValue | undefined,
): boolean {
  if (!entry) return false
  if (!entry.value.trim()) return false
  return validateManualFieldValue(entry.expectedDataType, entry.value) == null
}

function contextSnippetFor(anchor: DocumentTextAnchor): string {
  const before = anchor.contextBefore.trim()
  const after = anchor.contextAfter.trim()
  const parts = [
    before ? `…${before.slice(-80)}` : '',
    `«${anchor.text.slice(0, 120)}${anchor.text.length > 120 ? '…' : ''}»`,
    after ? `${after.slice(0, 80)}…` : '',
  ].filter(Boolean)
  return parts.join(' ')
}

/**
 * Build one manual proposal per (missingId, affectedAnchorId).
 * originalText = exact current anchor text (must still match at apply time).
 * proposedValue = user session value only (never AI-transformed).
 */
export function buildManualReplacementProposals(input: {
  missing: AiContractAnalysisResult['missingFields']
  manual: ManualMissingFieldValue[]
  anchors: DocumentTextAnchor[]
}): { proposals: ManualReplacementProposal[]; errors: string[] } {
  const errors: string[] = []
  const proposals: ManualReplacementProposal[] = []
  const anchorById = new Map(input.anchors.map((a) => [a.anchorId, a]))
  const manualById = new Map(input.manual.map((m) => [m.missingId, m]))

  for (const field of input.missing) {
    const entry = manualById.get(field.missingId)
    if (!isMissingFieldResolved(entry)) continue

    const proposedValue = entry!.value.trim()

    if (field.affectedAnchorIds.length === 0) {
      errors.push(
        `Brakujące pole „${field.label}” nie ma przypisanych fragmentów dokumentu.`,
      )
      continue
    }

    for (const anchorId of field.affectedAnchorIds) {
      const anchor = anchorById.get(anchorId)
      if (!anchor) {
        errors.push(`Nieznany fragment dokumentu: ${anchorId}`)
        continue
      }
      const originalText = anchor.text
      if (!originalText.trim()) {
        errors.push(
          `Fragment ${anchorId} jest pusty — nie można utworzyć zamiany ręcznej.`,
        )
        continue
      }
      if (!anchor.text.includes(originalText)) {
        errors.push(`Tekst źródłowy nie zgadza się z anchorem ${anchorId}.`)
        continue
      }

      proposals.push({
        replacementId: `manual:${field.missingId}:${anchorId}`,
        missingId: field.missingId,
        anchorId,
        originalText,
        proposedValue,
        semanticRole: field.semanticRole || field.label,
        source: 'manual',
        requiresUserReview: true,
        contextSnippet: contextSnippetFor(anchor),
      })
    }
  }

  return { proposals, errors }
}

export function manualProposalsToRows(
  proposals: ManualReplacementProposal[],
  previous: LabReplacementRow[] = [],
  anchors: DocumentTextAnchor[] = [],
): LabReplacementRow[] {
  const prevById = new Map(previous.map((r) => [r.replacementId, r]))
  const anchorById = new Map(anchors.map((a) => [a.anchorId, a]))
  return proposals.map((p) => {
    const prev = prevById.get(p.replacementId)
    const sameValue =
      prev &&
      prev.proposedValue === p.proposedValue &&
      prev.originalText === p.originalText
    const anchor = anchorById.get(p.anchorId)
    const start = anchor ? anchor.text.indexOf(p.originalText) : 0
    const end = start >= 0 ? start + p.originalText.length : p.originalText.length
    return {
      replacementId: p.replacementId,
      anchorId: p.anchorId,
      originalText: p.originalText,
      canonicalFieldKey: null,
      proposedValue: p.proposedValue,
      semanticRole: p.semanticRole,
      reason: 'Wartość uzupełniona ręcznie dla tego wzoru',
      confidence: 1,
      confidenceLabel: 'Wysoka' as const,
      source: 'manual',
      // Always require explicit approval — never auto-apply.
      decision:
        sameValue && (prev.decision === 'approved' || prev.decision === 'rejected')
          ? prev.decision
          : 'pending',
      manualValue: p.proposedValue,
      missingId: p.missingId,
      requiresUserReview: true,
      contextSnippet: p.contextSnippet,
      spanStatus: 'exact' as const,
      spanMessage: null,
      aiProposedSourceText: null,
      spanCandidates: [],
      spanStart: start >= 0 ? start : null,
      spanEnd: start >= 0 ? end : null,
    }
  })
}

/**
 * Merge canonical AI rows with manual proposal rows.
 * Preserves decisions on unchanged canonical rows; refreshes manual rows from values.
 */
export function mergeReplacementRowsWithManual(input: {
  canonicalRows: LabReplacementRow[]
  missing: AiContractAnalysisResult['missingFields']
  manual: ManualMissingFieldValue[]
  anchors: DocumentTextAnchor[]
  previousRows?: LabReplacementRow[]
}): { rows: LabReplacementRow[]; errors: string[] } {
  const { proposals, errors } = buildManualReplacementProposals({
    missing: input.missing,
    manual: input.manual,
    anchors: input.anchors,
  })
  const manualRows = manualProposalsToRows(
    proposals,
    (input.previousRows ?? []).filter((r) => r.source === 'manual'),
    input.anchors,
  )
  const canonical = input.canonicalRows.map((r) => {
    const prev = (input.previousRows ?? []).find(
      (p) => p.replacementId === r.replacementId,
    )
    if (!prev || prev.source === 'manual') return r
    // Keep manually resolved source spans across plan rebuilds
    if (prev.spanStatus === 'resolved_manual') return prev
    return { ...r, decision: prev.decision }
  })
  return { rows: [...canonical, ...manualRows], errors }
}

export function sourceDisplayLabel(source: string): string {
  if (source === 'manual') return 'Wpisano ręcznie'
  if (source.includes('company') || source.includes('studio')) return 'Firma'
  if (source.includes('package')) return 'Pakiet'
  if (source.includes('extra')) return 'Dodatek'
  if (source.includes('payment')) return 'Finanse'
  if (source.includes('wedding') || source.includes('couple')) return 'Wesele'
  return source
}
