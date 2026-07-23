/**
 * Slot-aware quality gate for contract transformation.
 *
 * Only text outside explicit replace / insert / composite spans may differ.
 * Punctuation-only and DOCX whitespace normalization are ignored.
 */

import {
  bindSlotsToParagraph,
  protectParagraphText,
  type BoundSlotSpan,
} from './slotBinding'
import { lookupResolvedValue } from './lookupResolvedValue'
import { locateSlotInParagraph, renderSlotValue } from './slotRenderer'
import type { TemplateSlot } from './types'

export interface VariableReplacementHit {
  key: string
  value: string
  kind: 'replace' | 'insert' | 'composite'
  leftAnchor?: string
  rightAnchor?: string
}

export interface UnexpectedEdit {
  kind: 'replace' | 'delete' | 'insert'
  from: string
  to: string
  note?: string
}

export interface UnboundVariableHit {
  registryKey: string
  paragraphIndex: number
  resolvedValue: string
  reason: string
}

export interface ParagraphFailureReport {
  index: number
  original: string
  generated: string
  unifiedDiff: string
  expectedVariableChanges: VariableReplacementHit[]
  unexpectedEdits: UnexpectedEdit[]
  unboundVariables?: UnboundVariableHit[]
  structuralIssue?: string
  protectedOriginal?: string
  protectedGenerated?: string
}

export interface QualityCheckResult {
  ok: boolean
  reason?: string
  report?: string
  failures?: ParagraphFailureReport[]
}

function normalizeTechnical(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[„”«»]/g, '"')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildUnifiedDiff(original: string, generated: string): string {
  const aLines = original.replace(/\r\n/g, '\n').split('\n')
  const bLines = generated.replace(/\r\n/g, '\n').split('\n')
  const n = aLines.length
  const m = bLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const lines: string[] = ['--- original', '+++ generated']
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && aLines[i] === bLines[j]) {
      lines.push(` ${aLines[i]}`)
      i += 1
      j += 1
    } else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      lines.push(`+${bLines[j]}`)
      j += 1
    } else if (i < n) {
      lines.push(`-${aLines[i]}`)
      i += 1
    }
  }
  return lines.join('\n')
}

function tokenize(text: string): string[] {
  const n = normalizeTechnical(text)
  if (!n) return []
  return n.split(' ').filter(Boolean)
}

function diffTokens(
  a: string[],
  b: string[],
): Array<{ type: 'equal' | 'delete' | 'insert'; token: string }> {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const ops: Array<{ type: 'equal' | 'delete' | 'insert'; token: string }> = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', token: a[i]! })
      i += 1
      j += 1
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'delete', token: a[i]! })
      i += 1
    } else {
      ops.push({ type: 'insert', token: b[j]! })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'delete', token: a[i]! })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'insert', token: b[j]! })
    j += 1
  }
  return ops
}

function unexpectedFromProtected(
  protectedOriginal: string,
  protectedGenerated: string,
): UnexpectedEdit[] {
  const a = tokenize(protectedOriginal)
  const b = tokenize(protectedGenerated)
  const ops = diffTokens(a, b)
  const edits: UnexpectedEdit[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i]!.type === 'equal') {
      i += 1
      continue
    }
    const deleted: string[] = []
    const inserted: string[] = []
    while (i < ops.length && ops[i]!.type !== 'equal') {
      if (ops[i]!.type === 'delete') deleted.push(ops[i]!.token)
      if (ops[i]!.type === 'insert') inserted.push(ops[i]!.token)
      i += 1
    }
    const from = deleted.join(' ').trim()
    const to = inserted.join(' ').trim()
    if (!from && !to) continue
    if (normalizeTechnical(from) === normalizeTechnical(to)) continue
    if (from && to) {
      edits.push({
        kind: 'replace',
        from,
        to,
        note: 'Immutable legal text changed outside variable slots.',
      })
    } else if (from) {
      edits.push({
        kind: 'delete',
        from,
        to: '',
        note: 'Removed immutable wording.',
      })
    } else {
      edits.push({
        kind: 'insert',
        from: '',
        to,
        note: 'Inserted wording outside variable slots.',
      })
    }
  }
  return edits
}

function hitsFromSpans(spans: BoundSlotSpan[]): VariableReplacementHit[] {
  return spans.map((s) => ({
    key: s.registryKey,
    value: s.resolvedValue.trim(),
    kind: s.operation,
    leftAnchor: s.leftAnchor,
    rightAnchor: s.rightAnchor,
  }))
}

/**
 * Prefer persisted physical slots (offsets/anchors/prefix) over runtime inference.
 */
function spansFromPersistedSlots(input: {
  paragraphIndex: number
  original: string
  generated: string
  slots: TemplateSlot[]
  resolved: Record<string, string>
}): BoundSlotSpan[] {
  const bound: BoundSlotSpan[] = []
  const paraSlots = input.slots.filter(
    (s) =>
      s.enabled &&
      s.registryKey &&
      s.physicallyBound !== false &&
      s.paragraphIndex === input.paragraphIndex,
  )

  for (const slot of paraSlots) {
    const oLoc = locateSlotInParagraph(input.original, slot)
    if (!oLoc) continue
    const value = lookupResolvedValue(input.resolved, slot.registryKey!)
    const rendered = renderSlotValue(slot, value, !value)
    const gLoc = locateSlotInParagraph(input.generated, {
      ...slot,
      // After render, mid is the rendered value — locate via anchors again
      originalText: rendered,
      startOffset: null,
      endOffset: null,
      allowedRange: null,
    })
    // Fallback: same left/right anchors → mid in generated
    let gStart = gLoc?.start
    let gEnd = gLoc?.end
    if (gStart == null || gEnd == null) {
      const left = slot.leftAnchor ?? ''
      const right = slot.rightAnchor ?? ''
      const li = left ? input.generated.indexOf(left) : 0
      if (left && li < 0) continue
      const leftEnd = left ? li + left.length : 0
      const rightStart = right
        ? input.generated.indexOf(right, leftEnd)
        : input.generated.length
      if (right && rightStart < 0) continue
      gStart = leftEnd
      gEnd = Math.max(leftEnd, rightStart)
    }

    bound.push({
      slotId: slot.id,
      registryKey: slot.registryKey!,
      operation: slot.operation ?? 'insert',
      originalStart: oLoc.start,
      originalEnd: oLoc.end,
      generatedStart: gStart,
      generatedEnd: gEnd,
      resolvedValue: rendered,
      leftAnchor: slot.leftAnchor ?? undefined,
      rightAnchor: slot.rightAnchor ?? undefined,
      componentKeys: slot.componentKeys,
      separator: slot.separator ?? undefined,
    })
  }

  return bound.sort((a, b) => a.originalStart - b.originalStart)
}

function formatFailure(failure: ParagraphFailureReport): string {
  const lines: string[] = [
    '---------------------------------------',
    `Paragraph ${failure.index}`,
    '',
    'ORIGINAL',
    failure.original || '(empty)',
    '',
    'GENERATED',
    failure.generated || '(empty)',
    '',
    'UNIFIED DIFF',
    failure.unifiedDiff,
    '',
  ]

  if (failure.protectedOriginal != null) {
    lines.push('PROTECTED ORIGINAL', failure.protectedOriginal, '')
  }
  if (failure.protectedGenerated != null) {
    lines.push('PROTECTED GENERATED', failure.protectedGenerated, '')
  }

  lines.push('ALLOWED SLOT CHANGES')
  if (failure.expectedVariableChanges.length === 0) {
    lines.push('(none bound)')
    lines.push(
      'Template import did not persist physical slots for this paragraph.',
    )
  } else {
    for (const hit of failure.expectedVariableChanges) {
      const label =
        hit.kind === 'insert'
          ? 'ALLOWED INSERTION'
          : hit.kind === 'composite'
            ? 'ALLOWED COMPOSITE'
            : 'ALLOWED REPLACEMENT'
      lines.push(`${label}`)
      lines.push(`${hit.key}:`)
      if (hit.kind === 'insert') {
        lines.push(`"" → "${hit.value}"`)
      } else {
        lines.push(`→ "${hit.value}"`)
      }
      if (hit.leftAnchor || hit.rightAnchor) {
        lines.push('ANCHORS')
        if (hit.leftAnchor) lines.push(`left: "${hit.leftAnchor}"`)
        if (hit.rightAnchor) lines.push(`right: "${hit.rightAnchor}"`)
      }
      lines.push('')
    }
  }

  if (failure.unboundVariables && failure.unboundVariables.length > 0) {
    lines.push('UNBOUND VARIABLE')
    for (const u of failure.unboundVariables) {
      lines.push(`registryKey: ${u.registryKey}`)
      lines.push(`paragraphIndex: ${u.paragraphIndex}`)
      lines.push(`resolvedValue: ${u.resolvedValue}`)
      lines.push(`reason: ${u.reason}`)
      lines.push('')
    }
  }

  lines.push('UNEXPECTED CHANGES')
  if (failure.structuralIssue) {
    lines.push(failure.structuralIssue)
  }
  if (
    failure.unexpectedEdits.length === 0 &&
    !failure.structuralIssue &&
    !(failure.unboundVariables && failure.unboundVariables.length > 0)
  ) {
    lines.push('(protected texts still differ after slot masking)')
  } else {
    for (const edit of failure.unexpectedEdits) {
      if (edit.kind === 'replace') {
        lines.push(`"${edit.from}"`)
        lines.push('↓')
        lines.push(`"${edit.to}"`)
        if (edit.note) lines.push(edit.note)
        lines.push('')
      } else if (edit.kind === 'delete') {
        lines.push(`REMOVED: "${edit.from}"`)
        if (edit.note) lines.push(edit.note)
        lines.push('')
      } else {
        lines.push(`INSERTED: "${edit.to}"`)
        if (edit.note) lines.push(edit.note)
        lines.push('')
      }
    }
  }

  lines.push('RESULT', 'FAIL', 'Generation rejected.')
  lines.push('---------------------------------------')
  return lines.join('\n')
}

export function formatQualityReport(failures: ParagraphFailureReport[]): string {
  if (failures.length === 0) {
    return 'Generation rejected — quality check failed (no paragraph details).'
  }
  const header = [
    `QUALITY CHECK FAILED — ${failures.length} paragraph(s) changed outside variable slots.`,
    'Use this diff to decide whether the fault is prompt, LLM, variable detection, replacement, or validator.',
    '',
  ]
  return header.concat(failures.map(formatFailure)).join('\n')
}

/**
 * Slot-aware verification.
 * Pass template slots + resolved values so inserts/composites are protected.
 */
export function verifyContractTransformation(input: {
  original: Array<{ index: number; text: string }>
  transformed: Array<{ index: number; text: string }>
  /** @deprecated Prefer resolvedByKey + slots — kept for callers. */
  allowedValues?: string[]
  resolvedByKey?: Record<string, string>
  slots?: TemplateSlot[]
}): QualityCheckResult {
  const {
    original,
    transformed,
    resolvedByKey = {},
    slots = [],
  } = input
  const failures: ParagraphFailureReport[] = []

  if (transformed.length !== original.length) {
    const reason = `Liczba akapitów się zmieniła (${original.length} → ${transformed.length}).`
    return {
      ok: false,
      reason,
      report: [
        'QUALITY CHECK FAILED — structural paragraph count mismatch.',
        reason,
        'Generation rejected.',
      ].join('\n'),
      failures: [],
    }
  }

  for (let i = 0; i < original.length; i++) {
    const o = original[i]!
    const t = transformed[i]!

    if (t.index !== o.index) {
      failures.push({
        index: o.index,
        original: o.text,
        generated: t.text,
        unifiedDiff: buildUnifiedDiff(o.text, t.text),
        expectedVariableChanges: [],
        unexpectedEdits: [],
        structuralIssue: `Paragraph reorder/index mismatch (expected ${o.index}, got ${t.index}).`,
      })
      continue
    }

    if (normalizeTechnical(o.text) === normalizeTechnical(t.text)) continue

    if (!o.text.trim() && t.text.trim()) {
      // May still be a valid leading insert — try binding first
    }

    const persisted = spansFromPersistedSlots({
      paragraphIndex: o.index,
      original: o.text,
      generated: t.text,
      slots,
      resolved: resolvedByKey,
    })
    const spans =
      persisted.length > 0
        ? persisted
        : bindSlotsToParagraph({
            paragraphIndex: o.index,
            original: o.text,
            generated: t.text,
            slots,
            resolved: resolvedByKey,
          })

    const protectedOriginal = protectParagraphText(
      o.text,
      spans.map((s) => ({
        start: s.originalStart,
        end: s.originalEnd,
        slotId: s.slotId,
      })),
    )
    const protectedGenerated = protectParagraphText(
      t.text,
      spans.map((s) => ({
        start: s.generatedStart,
        end: s.generatedEnd,
        slotId: s.slotId,
      })),
    )

    if (
      normalizeTechnical(protectedOriginal) ===
      normalizeTechnical(protectedGenerated)
    ) {
      continue
    }

    const unexpectedEdits = unexpectedFromProtected(
      protectedOriginal,
      protectedGenerated,
    )

    const unboundVariables: UnboundVariableHit[] = []
    if (spans.length === 0) {
      for (const [key, raw] of Object.entries(resolvedByKey)) {
        const value = raw?.trim()
        if (!value || value.length < 2) continue
        if (t.text.includes(value) && !o.text.includes(value)) {
          const hasPersisted = slots.some(
            (s) =>
              s.registryKey === key &&
              s.paragraphIndex === o.index &&
              s.physicallyBound,
          )
          if (!hasPersisted) {
            unboundVariables.push({
              registryKey: key,
              paragraphIndex: o.index,
              resolvedValue: value,
              reason:
                'No persisted ContractTemplateSlot exists for this insertion. Template import is incomplete.',
            })
          }
        }
      }
    }

    failures.push({
      index: o.index,
      original: o.text,
      generated: t.text,
      unifiedDiff: buildUnifiedDiff(o.text, t.text),
      expectedVariableChanges: hitsFromSpans(spans),
      unexpectedEdits,
      unboundVariables:
        unboundVariables.length > 0 ? unboundVariables : undefined,
      protectedOriginal: normalizeTechnical(protectedOriginal),
      protectedGenerated: normalizeTechnical(protectedGenerated),
      structuralIssue:
        !o.text.trim() && t.text.trim() && spans.length === 0
          ? 'Paragraph insertion into empty slot without a bound variable.'
          : o.text.trim() && !t.text.trim()
            ? 'Paragraph deletion.'
            : spans.length === 0
              ? 'No physical template slots bound to this paragraph.'
              : undefined,
    })
  }

  if (failures.length === 0) return { ok: true }

  const report = formatQualityReport(failures)
  return {
    ok: false,
    reason: `QUALITY CHECK FAILED — ${failures.length} paragraph(s) changed outside variable slots (see full diff).`,
    report,
    failures,
  }
}
