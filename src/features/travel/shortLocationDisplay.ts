/**
 * Short label for compact location inputs (Hero).
 * Full formatted_address stays in wedding_places / Travel.
 */
export function shortLocationDisplay(input: {
  name?: string | null
  label?: string | null
  formattedAddress?: string | null
}): string {
  const name = input.name?.trim()
  if (name) return name

  const label = input.label?.trim()
  if (label) return label

  const formatted = input.formattedAddress?.trim() || ''
  if (!formatted) return ''

  const first = formatted.split(',')[0]?.trim()
  return first || formatted
}
