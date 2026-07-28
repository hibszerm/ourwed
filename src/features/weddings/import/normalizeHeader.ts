const POLISH_DIACRITICS: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
}

export function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => POLISH_DIACRITICS[ch] ?? ch)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mappingSignature(headers: string[]): string {
  const normalized = headers.map(normalizeHeaderKey).filter(Boolean).sort()
  return normalized.join('|')
}
