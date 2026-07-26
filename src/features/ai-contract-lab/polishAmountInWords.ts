/**
 * Deterministic Polish currency amount → words (Phase C).
 * Not AI — fixed rules for złoty amounts used in contracts.
 */

const UNITS = [
  '',
  'jeden',
  'dwa',
  'trzy',
  'cztery',
  'pięć',
  'sześć',
  'siedem',
  'osiem',
  'dziewięć',
] as const

const UNITS_FEM = [
  '',
  'jedna',
  'dwie',
  'trzy',
  'cztery',
  'pięć',
  'sześć',
  'siedem',
  'osiem',
  'dziewięć',
] as const

const TEENS = [
  'dziesięć',
  'jedenaście',
  'dwanaście',
  'trzynaście',
  'czternaście',
  'piętnaście',
  'szesnaście',
  'siedemnaście',
  'osiemnaście',
  'dziewiętnaście',
] as const

const TENS = [
  '',
  '',
  'dwadzieścia',
  'trzydzieści',
  'czterdzieści',
  'pięćdziesiąt',
  'sześćdziesiąt',
  'siedemdziesiąt',
  'osiemdziesiąt',
  'dziewięćdziesiąt',
] as const

const HUNDREDS = [
  '',
  'sto',
  'dwieście',
  'trzysta',
  'czterysta',
  'pięćset',
  'sześćset',
  'siedemset',
  'osiemset',
  'dziewięćset',
] as const

function belowThousand(n: number, feminine = false): string {
  if (n <= 0) return ''
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h > 0) parts.push(HUNDREDS[h]!)
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]!)
  } else {
    const t = Math.floor(rest / 10)
    const u = rest % 10
    if (t > 0) parts.push(TENS[t]!)
    if (u > 0) parts.push((feminine ? UNITS_FEM : UNITS)[u]!)
  }
  return parts.filter(Boolean).join(' ')
}

function thousandWord(n: number): string {
  // n = number of thousands (1..999)
  if (n === 1) return 'tysiąc'
  const last2 = n % 100
  const last = n % 10
  if (last2 >= 12 && last2 <= 14) return 'tysięcy'
  if (last >= 2 && last <= 4) return 'tysiące'
  return 'tysięcy'
}

function millionWord(n: number): string {
  if (n === 1) return 'milion'
  const last2 = n % 100
  const last = n % 10
  if (last2 >= 12 && last2 <= 14) return 'milionów'
  if (last >= 2 && last <= 4) return 'miliony'
  return 'milionów'
}

/**
 * Convert a non-negative integer PLN amount to Polish words + "złotych".
 * Examples: 9500 → "dziewięć tysięcy pięćset złotych"
 */
export function polishAmountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return 'zero złotych'

  const parts: string[] = []
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000

  if (millions > 0) {
    parts.push(belowThousand(millions), millionWord(millions))
  }
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push('jeden tysiąc')
    } else {
      parts.push(belowThousand(thousands), thousandWord(thousands))
    }
  }
  if (rest > 0) {
    parts.push(belowThousand(rest))
  }

  const body = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return `${body} złotych`
}

/** Detect "słownie: …" / parenthetical amount-in-words spans in anchor text. */
export const AMOUNT_IN_WORDS_PATTERNS = [
  /\(\s*słownie\s*:\s*([^)]+)\)/gi,
  /słownie\s*:\s*([a-ząćęłńóśźż\s]+złotych)/gi,
  /\(\s*([a-ząćęłńóśźż]+(?:\s+[a-ząćęłńóśźż]+){1,12}\s+złotych)\s*\)/gi,
] as const

export function findAmountInWordsSpans(
  anchorText: string,
): Array<{ exactSourceText: string; start: number; end: number; wordsBody: string }> {
  const out: Array<{
    exactSourceText: string
    start: number
    end: number
    wordsBody: string
  }> = []
  const seen = new Set<string>()

  for (const re of AMOUNT_IN_WORDS_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(anchorText))) {
      const full = m[0]
      const body = (m[1] ?? '').trim()
      if (!body || !/złot/i.test(body) && !/złot/i.test(full)) continue
      const key = `${m.index}:${full}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        exactSourceText: full,
        start: m.index,
        end: m.index + full.length,
        wordsBody: body,
      })
    }
  }
  const selected: typeof out = []
  for (const candidate of [...out].sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) || a.start - b.start,
  )) {
    if (
      selected.some(
        (existing) =>
          candidate.start < existing.end && existing.start < candidate.end,
      )
    ) {
      continue
    }
    selected.push(candidate)
  }
  return selected.sort((a, b) => a.start - b.start)
}

/** Build replacement text preserving wrapper style around words. */
export function formatAmountInWordsLikeSource(input: {
  amount: number
  sourceSpan: string
}): string {
  const words = polishAmountInWords(input.amount)
  const src = input.sourceSpan.trim()
  if (/^\(\s*słownie/i.test(src)) {
    return `(słownie: ${words})`
  }
  if (/^słownie\s*:/i.test(src)) {
    return `słownie: ${words}`
  }
  if (/^\(/.test(src) && /\)$/.test(src)) {
    return `(${words})`
  }
  return words
}

export function parseMoneyNumber(value: string): number | null {
  const v = value
    .replace(/zł|pln|zl/gi, '')
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
