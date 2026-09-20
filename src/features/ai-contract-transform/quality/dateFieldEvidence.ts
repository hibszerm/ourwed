/**
 * CG7.4 — grounded contract-execution / signing date discovery.
 *
 * Distinct from wedding/event date. Structural form lines + a small set of
 * execution-date assertion patterns (not a mega-router for every synonym).
 */

import type { TransformDocumentBlock } from '../types'
import type { CanonicalTransformField } from './types'

export type SourceExecutionDateEvidence = {
  blockId: string
  sourceText: string
  /** Date token in source when present. */
  sourceDate: string | null
  nonSemanticSurface: boolean
  representation: 'table_cell' | 'prose' | 'form_line'
  canonicalField: CanonicalTransformField
}

function isBlankDateSurface(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^[\s.\-_–—•·…*]{1,48}$/.test(t)) return true
  if (/uzupełn|wstaw|wpisz|podaj|brak|placeholder|\btbd\b/i.test(t)) return true
  return !/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(t)
}

/** True when text asserts contract execution / signing (not wedding day). */
export function assertsContractExecutionDate(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (
    /data\s+(ślubu|wydarzenia|uroczystości|ceremonii)|dzień\s+(ślubu|wydarzenia)|termin\s+(ślubu|uroczystości|wydarzenia)/i.test(
      t,
    )
  ) {
    return false
  }
  return /data\s+(podpisania|zawarcia|sporządzenia)|zawarta\s+w\s+dniu|sporządzono\s+dnia|podpisano\s+dnia|PLACEHOLDER_DATA/i.test(
    t,
  )
}

export function discoverExecutionDateEvidence(
  blocks: TransformDocumentBlock[],
): SourceExecutionDateEvidence[] {
  const out: SourceExecutionDateEvidence[] = []
  for (const b of blocks) {
    const text = (b.text ?? '').trim()
    if (!text) continue
    const fam = b.tableContext?.ownershipFamily
    const label = b.tableContext?.rowLabelText ?? ''

    if (
      fam === 'wedding_date' &&
      /podpis|zawarcia|sporządz/i.test(label) &&
      b.kind === 'tableCell'
    ) {
      const date = text.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/)
      out.push({
        blockId: b.blockId,
        sourceText: text,
        sourceDate: date?.[0] ?? null,
        nonSemanticSurface: isBlankDateSurface(text),
        representation: 'table_cell',
        canonicalField: 'contract.executionDate',
      })
      continue
    }

    if (b.kind !== 'paragraph') continue
    if (!assertsContractExecutionDate(text)) continue
    const date = text.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/)
    const form = /^([^:\n]{2,80}):\s*(.*)$/.test(text)
    out.push({
      blockId: b.blockId,
      sourceText: text,
      sourceDate: date?.[0] ?? null,
      nonSemanticSurface: isBlankDateSurface(date?.[0] ?? text),
      representation: form ? 'form_line' : 'prose',
      canonicalField: 'contract.executionDate',
    })
  }
  return out
}

/** Replace date token or fill after colon for form lines. */
export function applyCanonicalExecutionDate(
  sourceText: string,
  canonicalFormatted: string,
): string {
  const canon = canonicalFormatted.trim()
  if (!canon) return sourceText
  if (/^([^:\n]{2,80}):\s*(.*)$/.test(sourceText.trim())) {
    return sourceText.replace(/^([^:\n]{2,80}):\s*.*$/, `$1: ${canon}`)
  }
  if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(sourceText)) {
    return sourceText.replace(
      /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*r\.)?/i,
      canon.replace(/\s*r\.\s*$/i, '') +
        (/r\./i.test(canon) || /r\./i.test(sourceText) ? ' r.' : ''),
    )
  }
  if (/PLACEHOLDER_DATA/i.test(sourceText)) {
    return sourceText.replace(/PLACEHOLDER_DATA/gi, canon)
  }
  return sourceText
}
