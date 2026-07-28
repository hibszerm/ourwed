const COUPLE_SEPARATORS = /\s+(?:i|&|\+|\/)\s+/i

export type ParsedCoupleNames = {
  displayName: string
  partner1Name: string
  partner2Name: string
}

export function parseCoupleDisplayName(raw: unknown): ParsedCoupleNames | null {
  const displayName = String(raw ?? '').trim()
  if (!displayName) return null

  const parts = displayName.split(COUPLE_SEPARATORS).map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return {
      displayName,
      partner1Name: parts[0]!,
      partner2Name: parts.slice(1).join(' i '),
    }
  }

  return {
    displayName,
    partner1Name: displayName,
    partner2Name: '',
  }
}

export function partner2ForCreate(partner2Name: string): string {
  const trimmed = partner2Name.trim()
  return trimmed || '—'
}
