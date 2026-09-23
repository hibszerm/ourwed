import { unescapeXml } from '@/features/documents/template/canonicalParagraph'

export type SemanticSpanReplayAuditEdit = {
  span: { start: number; end: number; segments?: readonly { start: number; end: number }[] }
  replacement: string
  replacementSegments?: readonly string[]
}

/** Reconstruct flattened paragraph text while respecting structural replacement slots. */
export function reconstructSemanticSpanAuditText(
  sourceText: string,
  edits: readonly SemanticSpanReplayAuditEdit[],
): string {
  let result = sourceText
  for (const edit of [...edits].sort((left, right) => right.span.start - left.span.start)) {
    let replacement = edit.replacement
    if (edit.replacementSegments) {
      if (!edit.span.segments || edit.span.segments.length !== edit.replacementSegments.length) {
        throw new Error('Segmented replay edit does not match its grounded source slots')
      }
      replacement = edit.replacementSegments.join('')
    }
    result = result.slice(0, edit.span.start) + replacement + result.slice(edit.span.end)
  }
  return result
}

/** Read paragraph text by structural slot, splitting only at existing w:br nodes. */
export function extractSemanticParagraphTextSlots(paragraphXml: string): string[] {
  const slots = ['']
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>/g
  let match: RegExpExecArray | null
  while ((match = token.exec(paragraphXml))) {
    if (match[1] !== undefined) slots[slots.length - 1] += unescapeXml(match[1])
    else slots.push('')
  }
  return slots
}

/** Canonical text offsets of structural breaks in the source paragraph. */
export function semanticParagraphBreakOffsets(paragraphXml: string): number[] {
  const offsets: number[] = []
  let offset = 0
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>/g
  let match: RegExpExecArray | null
  while ((match = token.exec(paragraphXml))) {
    if (match[1] !== undefined) offset += unescapeXml(match[1]).length
    else offsets.push(offset)
  }
  return offsets
}
