/**
 * Field-specific value equality for Phase B.
 * Formatting-only differences must not create replacements.
 */

export type EqualityKind =
  | 'text'
  | 'phone'
  | 'email'
  | 'nip'
  | 'regon'
  | 'bank_account'
  | 'date'
  | 'money'
  | 'address'
  | 'company_name'
  | 'time_of_day'
  | 'hours'

const PL_MONTHS: Record<string, number> = {
  stycznia: 1,
  lutego: 2,
  marca: 3,
  kwietnia: 4,
  maja: 5,
  czerwca: 6,
  lipca: 7,
  sierpnia: 8,
  września: 9,
  pazdziernika: 10,
  października: 10,
  listopada: 11,
  grudnia: 12,
}

export function equalityKindForField(
  fieldKey: string | null | undefined,
  dataType?: string | null,
): EqualityKind {
  const key = (fieldKey ?? '').toLowerCase()
  const dt = (dataType ?? '').toLowerCase()
  if (key.includes('phone') || dt === 'phone') return 'phone'
  if (key.includes('email') || dt === 'email') return 'email'
  if (key.includes('nip')) return 'nip'
  if (key.includes('regon')) return 'regon'
  if (key.includes('bank') || key.includes('iban') || key.includes('account')) {
    return 'bank_account'
  }
  if (key.includes('end_time') || key.includes('coverage_end') || dt === 'time') {
    return 'time_of_day'
  }
  if (key.includes('coverage_hours') || key.includes('working_hours') || dt === 'hours') {
    return 'hours'
  }
  // Dates before money — keys like deposit_due_date must not become money.
  if (key.includes('date') || key.includes('deadline') || dt === 'date') {
    return 'date'
  }
  if (
    key.includes('price') ||
    key.includes('contract_value') ||
    key.endsWith('.deposit') ||
    key.includes('deposit_amount') ||
    key.includes('agreed_deposit') ||
    key.includes('remaining') ||
    key.includes('amount') ||
    dt === 'money'
  ) {
    return 'money'
  }
  if (key.includes('address') || dt === 'address') return 'address'
  if (
    key.includes('legal_name') ||
    (key.includes('company') && key.includes('name'))
  ) {
    return 'company_name'
  }
  return 'text'
}

function nfc(value: string): string {
  return value.normalize('NFC')
}

function collapseWs(value: string): string {
  return nfc(value)
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .trim()
}

function stripQuotes(value: string): string {
  return value.replace(/[“”„‟‘’‚‛"'`]/g, '')
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Parse common PL / ISO date forms → YYYY-MM-DD or null. */
export function parseFlexibleDate(value: string): string | null {
  const raw = collapseWs(value)
    .replace(/\s*r\.?\s*$/i, '')
    .replace(/\br\.?\b/gi, '')
    .replace(/,/g, ' ')
    .trim()
  if (!raw) return null

  // ISO YYYY-MM-DD
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) {
    const dd = m[1]!.padStart(2, '0')
    const mm = m[2]!.padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }

  // "19 czerwca 2025"
  m = raw.match(/^(\d{1,2})\s+([A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)\s+(\d{4})$/i)
  if (m) {
    const monthName = m[2]!.toLowerCase().normalize('NFC')
    const month =
      PL_MONTHS[monthName] ??
      PL_MONTHS[monthName.replace(/ł/g, 'l').replace(/ó/g, 'o')]
    if (month) {
      const dd = m[1]!.padStart(2, '0')
      const mm = String(month).padStart(2, '0')
      return `${m[3]}-${mm}-${dd}`
    }
  }

  return null
}

export function formatDotDateFromIso(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

function normalizeMoney(value: string): string {
  let v = collapseWs(value).toLowerCase()
  v = v.replace(/zł|pln|zl/g, '')
  v = v.replace(/\s/g, '')
  v = v.replace(',', '.')
  const n = Number(v)
  if (!Number.isFinite(n)) return collapseWs(value).toLowerCase()
  return n.toFixed(2)
}

function normalizePhone(value: string): string {
  let d = digitsOnly(value)
  if (d.startsWith('48') && d.length > 9) d = d.slice(2)
  if (d.startsWith('0048') && d.length > 11) d = d.slice(4)
  return d
}

function normalizeBank(value: string): string {
  return digitsOnly(value).replace(/^PL/i, '')
}

function normalizeCompanyName(value: string): string {
  return stripQuotes(collapseWs(value))
    .toLowerCase()
    .replace(/[.,;:/\\|–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeAddress(value: string): string {
  return stripQuotes(collapseWs(value))
    .toLowerCase()
    .replace(/\bulica\b/g, ' ')
    .replace(/\bul\.?\b/g, ' ')
    .replace(/\baleja\b/g, ' ')
    .replace(/\bal\.?\b/g, ' ')
    .replace(/\bplac\b/g, ' ')
    .replace(/\bpl\.?\b/g, ' ')
    .replace(/[.,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:\s]+$/g, '')
    .trim()
}

function normalizeTimeOfDay(value: string): string {
  const m = collapseWs(value).match(/(\d{1,2})[.:](\d{2})/)
  if (!m) return normalizeText(value)
  return `${m[1]!.padStart(2, '0')}:${m[2]}`
}

function normalizeHours(value: string): string {
  const m = collapseWs(value).match(/(\d+)/)
  return m ? m[1]! : normalizeText(value)
}

function normalizeText(value: string): string {
  return stripQuotes(collapseWs(value)).toLowerCase()
}

export function normalizeForEquality(
  value: string,
  kind: EqualityKind,
): string {
  switch (kind) {
    case 'phone':
      return normalizePhone(value)
    case 'email':
      return collapseWs(value).toLowerCase()
    case 'nip':
    case 'regon':
      return digitsOnly(value)
    case 'bank_account':
      return normalizeBank(value)
    case 'date': {
      const iso = parseFlexibleDate(value)
      return iso ?? normalizeText(value)
    }
    case 'money':
      return normalizeMoney(value)
    case 'address':
      return normalizeAddress(value)
    case 'company_name':
      return normalizeCompanyName(value)
    case 'time_of_day':
      return normalizeTimeOfDay(value)
    case 'hours':
      return normalizeHours(value)
    case 'text':
    default:
      return normalizeText(value)
  }
}

/**
 * True when document and canonical values are the same after field-aware normalization.
 */
export function semanticValuesEqual(
  documentValue: string,
  canonicalValue: string,
  kind: EqualityKind,
): boolean {
  const a = normalizeForEquality(documentValue, kind)
  const b = normalizeForEquality(canonicalValue, kind)
  if (!a || !b) return false
  return a === b
}

/** Package content item is present in a multi-line / comma package.contents blob.
 * @deprecated Prefer item-level comparePackageContentItem — do not use for Phase B status.
 */
export function packageContentsIncludes(
  packageContents: string,
  item: string,
): boolean {
  const hay = normalizeText(packageContents)
  const needle = normalizeText(item)
  if (!needle) return false
  if (hay.includes(needle)) return true
  // bullet / line split
  const parts = packageContents
    .split(/[\n;,•·\-–—]+/)
    .map((p) => normalizeText(p))
    .filter(Boolean)
  return parts.some((p) => p === needle || p.includes(needle) || needle.includes(p))
}
