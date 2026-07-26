/**
 * Phase C — displayValue for document patches (never raw internal values).
 */

import { formatDateLikeSource, formatMoneyLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import { polishAmountInWords } from '@/features/ai-contract-lab/polishAmountInWords'

export type DisplayValueKind =
  | 'money'
  | 'money_words'
  | 'date'
  | 'location'
  | 'phone'
  | 'bank'
  | 'package'
  | 'text'

/**
 * Build the text that should appear in the DOCX for a field.
 */
export function buildDisplayValue(input: {
  kind: DisplayValueKind
  canonicalValue: string | number | null
  sourceSpan?: string | null
  contractDisplay?: string | null
}): string | null {
  if (input.contractDisplay?.trim()) return input.contractDisplay.trim()
  if (input.canonicalValue == null || input.canonicalValue === '') return null

  const src = input.sourceSpan ?? ''
  switch (input.kind) {
    case 'money': {
      const n =
        typeof input.canonicalValue === 'number'
          ? input.canonicalValue
          : Number(
              String(input.canonicalValue)
                .replace(/zł|pln/gi, '')
                .replace(/\s/g, '')
                .replace(',', '.'),
            )
      if (!Number.isFinite(n)) return String(input.canonicalValue)
      return formatMoneyLikeSource({
        canonicalAmount: n,
        sourceText: src || '0 zł',
      })
    }
    case 'money_words': {
      const n =
        typeof input.canonicalValue === 'number'
          ? input.canonicalValue
          : Number(input.canonicalValue)
      if (!Number.isFinite(n)) return null
      const words = polishAmountInWords(n)
      if (/słownie/i.test(src)) return `(słownie: ${words})`
      return words
    }
    case 'date':
      return formatDateLikeSource({
        canonicalDate: String(input.canonicalValue),
        sourceText: src || String(input.canonicalValue),
      })
    case 'location':
      // Without contractDisplay, caller must REVIEW
      return null
    case 'phone':
    case 'bank':
    case 'package':
    case 'text':
    default:
      return String(input.canonicalValue)
  }
}
