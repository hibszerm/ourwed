/** Pure normalization for answer fields shared by questionnaire and server flows. */
export function normalizeSelectedPackageIds(fields: Record<string, unknown>): string[] {
  const fromArray = fields.selectedPackageIds
  const ids: string[] = []
  if (Array.isArray(fromArray)) {
    for (const item of fromArray) {
      const id = String(item ?? '').trim()
      if (id && !ids.includes(id)) ids.push(id)
    }
  }
  const legacy = String(fields.packageId ?? '').trim()
  if (legacy && !ids.includes(legacy)) ids.push(legacy)
  return ids
}

export function formatLocationAnswer(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  const address =
    (typeof row.formattedAddress === 'string' && row.formattedAddress.trim()) ||
    [row.street, row.buildingNumber, row.postalCode, row.city, row.country]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(', ') || ''
  const name =
    (typeof row.label === 'string' && row.label.trim()) ||
    (typeof row.name === 'string' && row.name.trim()) || ''
  if (name && address && name !== address) return `${name} — ${address}`
  return address || name || ''
}
