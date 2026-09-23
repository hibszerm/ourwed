import type { GroundedTextSpan } from '../documents/template/docxParagraphEditor'

export type SourceHundredthsSuffix = {
  /** Range of the two-digit numerator and /100 marker in canonical source text. */
  span: { start: number; end: number }
  numerator: string
  denominator: '100'
}

export type MoneyWordSourcePresentation = {
  replacementSpan: GroundedTextSpan
  hundredthsSuffix: SourceHundredthsSuffix | null
}

const FRACTION_TAIL = /([\t \u00a0\u202f]+)(\d{2})\/(100)(?=[\t \u00a0\u202f.,;:!?)]*$)/

/**
 * Find source-owned NN/100 presentation adjacent to a semantically grounded
 * amount-in-words span. If the model included the suffix, move the effective
 * replacement boundary before its separator so the source OOXML remains intact.
 */
export function inspectMoneyWordSourcePresentation(input: {
  sourceText: string
  span: GroundedTextSpan
}): MoneyWordSourcePresentation {
  const { sourceText, span } = input
  const selectedText = sourceText.slice(span.start, span.end)
  const selectedSuffix = FRACTION_TAIL.exec(selectedText)
  const suffix = selectedSuffix
    ? {
        span: {
          start: span.start + selectedSuffix.index + selectedSuffix[1]!.length,
          end: span.start + selectedSuffix.index + selectedSuffix[0].length,
        },
        numerator: selectedSuffix[2]!,
        denominator: '100' as const,
      }
    : null
  const adjacentSuffix = suffix ? null : FRACTION_TAIL.exec(sourceText.slice(span.end))
  const detected = suffix ?? (adjacentSuffix
    ? {
        span: {
          start: span.end + adjacentSuffix.index + adjacentSuffix[1]!.length,
          end: span.end + adjacentSuffix.index + adjacentSuffix[0].length,
        },
        numerator: adjacentSuffix[2]!,
        denominator: '100' as const,
      }
    : null)

  if (!suffix || !detected) return { replacementSpan: span, hundredthsSuffix: detected }

  const replacementEnd = span.start + selectedSuffix!.index
  const segments = span.segments?.flatMap((segment) => {
    const end = Math.min(segment.end, replacementEnd)
    return end > segment.start ? [{ ...segment, end }] : []
  })
  return {
    replacementSpan: {
      start: span.start,
      end: replacementEnd,
      ...(segments && segments.length > 0 ? { segments } : {}),
    },
    hundredthsSuffix: detected,
  }
}

/** Shared suffix-style detection for source-aware legacy text repairs. */
export function hasSourceHundredthsSuffix(text: string): boolean {
  return FRACTION_TAIL.test(text)
}
