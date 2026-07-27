/**
 * Parse Polish contract money amounts from source text.
 */

export type ParsedMoneyAmount = {
  amount: number
  currency: 'PLN' | 'zł' | 'unknown'
  raw: string
}

const MONEY_PATTERNS = [
  /(\d[\d\s]*)(?:[,.](\d{2}))?\s*(zł|PLN)/i,
  /(\d{1,3}(?:[.\s]\d{3})+(?:,\d{2})?)\s*(zł|PLN)?/i,
]

export function parsePolishMoneyAmount(text: string): ParsedMoneyAmount | null {
  const trimmed = text.trim()
  for (const re of MONEY_PATTERNS) {
    const m = trimmed.match(re)
    if (!m) continue
    const whole = m[1]!.replace(/[\s.]/g, '')
    const frac = m[2] ?? '00'
    const n = Number(`${whole}.${frac}`)
    if (!Number.isFinite(n)) continue
    const currencyRaw = (m[3] ?? 'zł').toUpperCase()
    return {
      amount: Math.round(n),
      currency: currencyRaw === 'PLN' ? 'PLN' : 'zł',
      raw: m[0]!,
    }
  }
  return null
}

const ONES = [
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
]
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
]
const TENS = [
  '',
  'dziesięć',
  'dwadzieścia',
  'trzydzieści',
  'czterdzieści',
  'pięćdziesiąt',
  'sześćdziesiąt',
  'siedemdziesiąt',
  'osiemdziesiąt',
  'dziewięćdziesiąt',
]
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
]

function normalizeWords(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .trim()
}

/** Practical parser for wedding-contract money words (thousands + hundreds). */
export function parsePolishMoneyWords(text: string): number | null {
  const w = normalizeWords(text)
  if (!/(zlotych|zł)/i.test(w) && !/\btys/i.test(w)) return null

  let total = 0
  const thousandMatch = w.match(
    /(jeden|jedna|dwa|dwie|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć|jedenaście|dwanaście|trzynaście|czternaście|piętnaście|szesnaście|siedemnaście|osiemnaście|dziewiętnaście|dwadzieścia|dwadziescia)?\s*tysi[aęe]c[yh]?/,
  )
  if (thousandMatch) {
    const prefix = thousandMatch[1]?.trim() ?? ''
    if (!prefix || prefix === 'jeden' || prefix === 'jedna') total += 1000
    else {
      const idx = [...ONES, ...TEENS, ...TENS].findIndex(
        (t) => t && prefix.startsWith(t.slice(0, 4)),
      )
      if (idx >= 0 && idx < 10) total += idx * 1000
      else if (prefix === 'dwadzieścia' || prefix === 'dwadziescia') total += 20000
      else if (prefix === 'pięć' || prefix === 'piec') total += 5000
      else if (prefix === 'sześć' || prefix === 'szesc') total += 6000
      else if (prefix === 'siedem') total += 7000
      else if (prefix === 'osiem') total += 8000
      else if (prefix === 'dziewięć' || prefix === 'dziewiec') total += 9000
      else if (prefix === 'dziesięć' || prefix === 'dziesiec') total += 10000
    }
  }

  for (const [word, value] of [
    ['osiem', 8],
    ['siedem', 7],
    ['sześć', 6],
    ['szesc', 6],
    ['pięć', 5],
    ['piec', 5],
    ['cztery', 4],
    ['trzy', 3],
    ['dwa', 2],
    ['dwie', 2],
    ['jeden', 1],
    ['jedna', 1],
  ] as const) {
    if (w.includes(`${word} tysiac`) || w.includes(`${word} tysiąc`)) {
      total = value * 1000
      break
    }
  }

  if (/\bosiem\s+tys/i.test(w)) total = 8000
  if (/\bsiedem\s+tys/i.test(w)) total = 7000
  if (/\bsze[sś][ćc]\s+tys/i.test(w)) total = 6000
  if (/\bpi[eę][ćc]\s+tys/i.test(w)) total = 5000
  if (/\bcztery\s+tys/i.test(w)) total = 4000
  if (/\btrzy\s+tys/i.test(w)) total = 3000
  if (/\bdwa\s+tys/i.test(w)) total = 2000
  if (/\bjeden\s+tys/i.test(w) || /\btysi[aęe]c\s+zlotych/i.test(w)) {
    if (total === 0) total = 1000
  }

  const hundredMatch = w.match(
    /(sto|dwieście|dwiescie|trzysta|czterysta|pięćset|piecset|sześćset|szescset|siedemset|osiemset|dziewięćset|dziewiecset)/,
  )
  if (hundredMatch) {
    const hw = hundredMatch[1]!
    const hi = HUNDREDS.findIndex((h) => h && hw.startsWith(h.slice(0, 3)))
    if (hi > 0) total += hi * 100
  }

  if (/\btysi[aęe]c\s+zlotych/i.test(w) && total === 0) {
    const before = w.split(/\btysi/i)[0]?.trim() ?? ''
    if (before.includes('osiem')) total = 8000
    else if (before.includes('siedem')) total = 7000
    else if (before.includes('sze')) total = 6000
    else if (before.includes('pię') || before.includes('pie')) total = 5000
    else if (before.includes('czter')) total = 4000
    else if (before.includes('trzy')) total = 3000
    else if (before.includes('dwa') || before.includes('dwie')) total = 2000
    else total = 1000
  }

  return total > 0 ? total : null
}

export function moneyAmountsConsistent(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1
}
