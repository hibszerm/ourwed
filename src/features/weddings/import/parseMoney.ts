const MAX_CONTRACT_VALUE = 10_000_000

export function parseImportMoney(value: unknown): number | null {
  if (value == null || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > MAX_CONTRACT_VALUE) {
      return null
    }
    return Math.round(value * 100) / 100
  }

  let text = String(value).trim()
  if (!text) return null
  if (/^-/.test(text) || text.includes('-')) return null

  text = text
    .replace(/\s+/g, '')
    .replace(/zł|pln/gi, '')
    .trim()

  const numbers = text.match(/\d[\d.,]*/g)
  if (!numbers || numbers.length !== 1) return null

  let num = numbers[0]!
  const comma = num.lastIndexOf(',')
  const dot = num.lastIndexOf('.')

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      num = num.replace(/\./g, '').replace(',', '.')
    } else {
      num = num.replace(/,/g, '')
    }
  } else if (comma >= 0) {
    const parts = num.split(',')
    if (parts.length === 2 && parts[1]!.length <= 2) {
      num = `${parts[0]!.replace(/\./g, '')}.${parts[1]}`
    } else {
      num = num.replace(/,/g, '')
    }
  } else if (dot >= 0) {
    const parts = num.split('.')
    if (parts.length > 2) {
      num = parts.join('')
    }
  }

  const parsed = Number(num)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_CONTRACT_VALUE) {
    return null
  }
  return Math.round(parsed * 100) / 100
}
