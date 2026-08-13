/**
 * Presentation-level normalization for Wedding Brief (does not mutate stored answers).
 */

export function normalizeBriefWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Safe time display: 13.00 → 13:00 when clearly a clock time. */
export function normalizeBriefTime(raw: string): string {
  const t = normalizeBriefWhitespace(raw)
  const m = t.match(/^(\d{1,2})[.:](\d{2})$/)
  if (!m) return t
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return t
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Normalize time tokens embedded in short free-text (e.g. "13.00 wyjazd"). */
export function normalizeBriefTimeInText(raw: string): string {
  return normalizeBriefWhitespace(raw).replace(
    /\b(\d{1,2})[.](\d{2})\b/g,
    (_m, h: string, min: string) => {
      const hn = Number(h)
      const mn = Number(min)
      if (hn > 23 || mn > 59) return `${h}.${min}`
      return `${String(hn).padStart(2, '0')}:${String(mn).padStart(2, '0')}`
    },
  )
}

export function normalizePlaceKey(input: {
  placeId?: string | null
  name?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}): string {
  const id = (input.placeId || '').trim().toLowerCase()
  if (id) return `id:${id}`
  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return `geo:${input.latitude.toFixed(5)},${input.longitude.toFixed(5)}`
  }
  const addr = normalizeBriefWhitespace(input.address || '').toLowerCase()
  if (addr) return `addr:${addr}`
  const name = normalizeBriefWhitespace(input.name || '').toLowerCase()
  return name ? `name:${name}` : ''
}

/**
 * Canonical place presentation for brief / prefill display.
 * Does not invent names; avoids name—name duplication.
 */
export function formatPlaceDisplay(input: {
  name?: string | null
  address?: string | null
}): {
  name?: string
  address?: string
  /** Single-line for plain-text contexts: "Name — Address" or one side. */
  singleLine: string
} {
  const name = input.name ? normalizeBriefWhitespace(input.name) : ''
  const address = input.address ? normalizeBriefWhitespace(input.address) : ''
  if (!name && !address) return { singleLine: '' }
  if (!name) return { address, singleLine: address }
  if (!address) return { name, singleLine: name }
  const nameL = name.toLowerCase()
  const addrL = address.toLowerCase()
  if (nameL === addrL) return { name, singleLine: name }
  // Address already starts with the place name → strip prefix for the address line.
  if (addrL.startsWith(nameL)) {
    const rest = normalizeBriefWhitespace(
      address.slice(name.length).replace(/^[\s,;—–-]+/, ''),
    )
    if (rest) {
      return { name, address: rest, singleLine: `${name} — ${rest}` }
    }
    return { name, singleLine: name }
  }
  if (nameL.includes(addrL) && addrL.length >= 8) {
    return { name, singleLine: name }
  }
  return { name, address, singleLine: `${name} — ${address}` }
}

/** Avoid "Name — Address · Address" when name equals or contains address. */
export function distinctPlaceAndAddress(
  placeName: string | undefined,
  address: string | undefined,
): { placeName?: string; shortAddress?: string } {
  const formatted = formatPlaceDisplay({ name: placeName, address })
  return {
    placeName: formatted.name,
    shortAddress: formatted.address,
  }
}

export function normalizeSemanticKey(value: string): string {
  return normalizeBriefWhitespace(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function textsSemanticallyEqual(a: string, b: string): boolean {
  const ka = normalizeSemanticKey(a)
  const kb = normalizeSemanticKey(b)
  if (!ka || !kb) return false
  return ka === kb || ka.includes(kb) || kb.includes(ka)
}

const NO_INFO_VALUES = new Set([
  'brak',
  'brak.',
  'nie ma',
  'nic',
  'brak uwag',
  'brak informacji',
  'brak danych',
  'none',
  'n/a',
  'na',
  '-',
  '—',
])

/**
 * Field-aware presentation empty check (does not mutate stored answers).
 * Yes/No "Nie" stays meaningful. Free-text "brak" is presentation-empty.
 */
export function isPresentationNoValue(input: {
  displayValue: string
  questionType?: string
  mapping?: string | null
  questionId?: string
}): boolean {
  const raw = normalizeBriefWhitespace(input.displayValue)
  if (!raw) return true
  const lower = raw.toLowerCase()

  if (input.questionType === 'yes_no') return false
  if (
    input.questionType === 'single_choice' ||
    input.questionType === 'multiple_choice'
  ) {
    return false
  }

  if (NO_INFO_VALUES.has(lower)) return true

  if (
    (input.questionType === 'long_text' || input.questionType === 'short_text') &&
    lower === 'nie'
  ) {
    return true
  }

  return false
}
