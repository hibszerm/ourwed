/**
 * Contract-style Polish PLN amount → words for the transform lab.
 * 1 000 → "tysiąc złotych" (no leading "jeden").
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

/** Deterministic contract money words (AI must not invent these). */
export function polishContractMoneyWords(amount: number): string {
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
      parts.push('tysiąc')
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
