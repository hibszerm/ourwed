import { formatLocationAnswerDisplay } from '@/features/prewedding/preweddingLocation'
import type { PrefillValue } from '@/types/preweddingQuestionnaire'

export function prefillPlaceholder(value: PrefillValue | undefined): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  return formatLocationAnswerDisplay(value) || undefined
}
