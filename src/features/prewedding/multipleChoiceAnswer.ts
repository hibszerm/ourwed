/**
 * Pre-wedding public `multiple_choice` answers.
 * Canonical persist shape is string[]. Legacy scalar strings stay readable
 * in the UI without rewriting stored response rows.
 */

export function normalizeMultipleChoiceAnswer(value: unknown): string[] {
  if (value == null || value === false || value === '') return []
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : String(item)))
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [value] : []
  }
  return []
}

export function toggleMultipleChoiceValue(
  selected: string[],
  option: string,
): string[] {
  if (selected.includes(option)) {
    return selected.filter((item) => item !== option)
  }
  return [...selected, option]
}

export function isMultipleChoiceSelectionEmpty(value: unknown): boolean {
  return normalizeMultipleChoiceAnswer(value).length === 0
}
