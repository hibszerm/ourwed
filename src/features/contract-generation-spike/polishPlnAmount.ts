const ones = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć']
const teens = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście']
const tens = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt']
const hundreds = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset']

function underThousand(value: number): string {
  const words = [hundreds[Math.floor(value / 100)]!, tens[Math.floor((value % 100) / 10)]!]
  const remainder = value % 10
  if (value % 100 >= 10 && value % 100 < 20) words[1] = teens[value % 100 - 10]!
  else words.push(ones[remainder]!)
  return words.filter(Boolean).join(' ')
}

function pluralForm(value: number, singular: string, few: string, many: string): string {
  const lastTwo = value % 100
  const last = value % 10
  if (value === 1) return singular
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few
  return many
}

function integerWords(value: number): string {
  if (value === 0) return 'zero'
  const groups = [value % 1000, Math.floor(value / 1000) % 1000, Math.floor(value / 1_000_000) % 1000, Math.floor(value / 1_000_000_000) % 1000]
  const labels = [
    ['', '', ''],
    ['tysiąc', 'tysiące', 'tysięcy'],
    ['milion', 'miliony', 'milionów'],
    ['miliard', 'miliardy', 'miliardów'],
  ]
  const parts: string[] = []
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index]!
    if (!group) continue
    if (index === 0) { parts.push(underThousand(group)); continue }
    const label = labels[index]!
    const prefix = group === 1 && index === 1 ? '' : group === 1 ? 'jeden' : underThousand(group)
    parts.push(`${prefix ? `${prefix} ` : ''}${pluralForm(group, label[0]!, label[1]!, label[2]!)}`)
  }
  return parts.join(' ')
}

/** Parse an explicitly supplied numeric PLN value into grosze; this does not parse words or prose. */
export function parsePlnGrosz(value: string | number): number | undefined {
  const text = String(value).normalize('NFC').trim()
  const match = text.match(/^(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:PLN|zł)?$/iu)
  if (!match) return undefined
  const whole = Number(match[1]!.replace(/[ \u00a0\u202f]/g, ''))
  const cents = Number((match[2] ?? '').padEnd(2, '0') || '0')
  const amount = whole * 100 + cents
  return Number.isSafeInteger(amount) ? amount : undefined
}

export function normalizePolishPlnAmount(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl-PL')
}

/** Format a numeric authority as the canonical Polish contract wording; never scans document prose. */
export function formatPolishPlnAmount(value: string | number): string | undefined {
  const grosze = parsePlnGrosz(value)
  if (grosze === undefined) return undefined
  const zloty = Math.floor(grosze / 100)
  const cents = grosze % 100
  return `${integerWords(zloty)} ${pluralForm(zloty, 'złoty', 'złote', 'złotych')} ${String(cents).padStart(2, '0')}/100`
}

export function isPolishPlnAmountEquivalent(authoritativeNumeric: string | number, renderedWords: string): boolean {
  const canonical = formatPolishPlnAmount(authoritativeNumeric)
  return canonical !== undefined && normalizePolishPlnAmount(canonical) === normalizePolishPlnAmount(renderedWords)
}
