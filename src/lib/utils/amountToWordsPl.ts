/**
 * Deterministic Polish amount → words for PLN (integers only).
 * Range: 0 … 999_999_999
 */

const ONES = [
  'zero',
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

function underThousand(n: number): string {
  if (n < 0 || n >= 1000) throw new Error(`underThousand out of range: ${n}`)
  if (n === 0) return ''
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h > 0) parts.push(HUNDREDS[h]!)
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]!)
  } else {
    const t = Math.floor(rest / 10)
    const o = rest % 10
    if (t > 0) parts.push(TENS[t]!)
    if (o > 0) parts.push(ONES[o]!)
  }
  return parts.join(' ')
}

/** Polish plural for tysiąc / milion scale words. */
function scaleWord(
  count: number,
  forms: [one: string, few: string, many: string],
): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  if (abs === 1) return forms[0]
  if (last >= 2 && last <= 4 && (abs < 10 || abs >= 20)) return forms[1]
  return forms[2]
}

function zlotyForm(n: number): string {
  const abs = Math.abs(Math.round(n)) % 100
  const last = abs % 10
  if (abs === 1) return 'złoty'
  if (last >= 2 && last <= 4 && (abs < 10 || abs >= 20)) return 'złote'
  return 'złotych'
}

/**
 * Convert a non-negative integer PLN amount to Polish words + currency form.
 */
export function amountToWordsPl(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new Error('amountToWordsPl requires a finite number')
  }
  const n = Math.round(amount)
  if (n < 0) {
    throw new Error('amountToWordsPl does not support negative amounts')
  }
  if (n > 999_999_999) {
    throw new Error('amountToWordsPl supports up to 999 999 999')
  }

  if (n === 0) return 'zero złotych'

  const parts: string[] = []
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000

  if (millions > 0) {
    const body =
      millions === 1 ? 'jeden' : underThousand(millions)
    parts.push(
      `${body} ${scaleWord(millions, ['milion', 'miliony', 'milionów'])}`,
    )
  }

  if (thousands > 0) {
    const body =
      thousands === 1 ? 'jeden' : underThousand(thousands)
    parts.push(
      `${body} ${scaleWord(thousands, ['tysiąc', 'tysiące', 'tysięcy'])}`,
    )
  }

  if (rest > 0) {
    parts.push(underThousand(rest))
  }

  return `${parts.join(' ')} ${zlotyForm(n)}`
}

/** Safe variant — returns null when amount is missing/invalid. */
export function amountToWordsPlOrNull(
  amount: number | null | undefined,
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null
  try {
    return amountToWordsPl(amount)
  } catch {
    return null
  }
}
