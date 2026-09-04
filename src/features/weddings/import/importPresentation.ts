import type {
  ImportField,
  ImportRowIssue,
  WeddingImportReviewRow,
  WeddingImportReviewRowStatus,
} from './types'
import { IMPORT_FIELD_LABELS } from './types'

export { describeColumnMappingBlock } from './columnMapping'

export type ImportReviewFilter = 'all' | 'ready' | 'warning' | 'duplicate' | 'error'

export type ImportReviewTone = 'ready' | 'warning' | 'duplicate' | 'error'

export const REVIEW_FILTERS: Array<{ id: ImportReviewFilter; label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'ready', label: 'Gotowe' },
  { id: 'warning', label: 'Uwagi' },
  { id: 'duplicate', label: 'Duplikaty' },
  { id: 'error', label: 'Błędy' },
]

export function polishPlural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(count)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (abs === 1) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function reviewTone(
  status: WeddingImportReviewRowStatus,
): ImportReviewTone {
  if (status === 'invalid' || status === 'excluded') return 'error'
  if (status === 'possible_duplicate') return 'duplicate'
  if (status === 'warning') return 'warning'
  return 'ready'
}

export const REVIEW_TONE_LABEL: Record<ImportReviewTone, string> = {
  ready: 'Gotowe',
  warning: 'Uwaga',
  duplicate: 'Duplikat',
  error: 'Błąd',
}

export function countReviewTones(rows: WeddingImportReviewRow[]): {
  total: number
  ready: number
  warning: number
  duplicate: number
  error: number
} {
  const counts = { total: rows.length, ready: 0, warning: 0, duplicate: 0, error: 0 }
  for (const row of rows) {
    counts[reviewTone(row.status)] += 1
  }
  return counts
}

export function filterReviewRows(
  rows: WeddingImportReviewRow[],
  filter: ImportReviewFilter,
): WeddingImportReviewRow[] {
  if (filter === 'all') return rows
  return rows.filter((row) => reviewTone(row.status) === filter)
}

export function reviewSummaryParts(counts: {
  ready: number
  warning: number
  duplicate: number
  error: number
}): string[] {
  const parts: string[] = []
  if (counts.ready > 0) {
    parts.push(
      `${counts.ready} ${polishPlural(counts.ready, 'rekord gotowy', 'rekordy gotowe', 'rekordów gotowych')}`,
    )
  }
  if (counts.warning > 0) {
    parts.push(
      `${counts.warning} ${polishPlural(counts.warning, 'wymaga uwagi', 'wymagają uwagi', 'wymaga uwagi')}`,
    )
  }
  if (counts.duplicate > 0) {
    parts.push(
      `${counts.duplicate} ${polishPlural(counts.duplicate, 'możliwy duplikat', 'możliwe duplikaty', 'możliwych duplikatów')}`,
    )
  }
  if (counts.error > 0) {
    parts.push(
      `${counts.error} ${polishPlural(counts.error, 'błąd', 'błędy', 'błędów')}`,
    )
  }
  return parts
}

export function reviewHeadline(counts: {
  total: number
  ready: number
  warning: number
  duplicate: number
  error: number
}): string | null {
  if (counts.total === 0) return null
  const issueCount = counts.warning + counts.duplicate + counts.error
  if (issueCount === 0) {
    return `${counts.ready} ${polishPlural(
      counts.ready,
      'rekord gotowy do importu',
      'rekordy gotowe do importu',
      'rekordów gotowych do importu',
    )}.`
  }
  return reviewSummaryParts(counts).join(' · ')
}

export function mappedColumnsSummary(mapped: number, total: number): string {
  if (mapped === 1) return `1 z ${total} kolumn zostanie zaimportowana`
  return `${mapped} z ${total} kolumn zostanie zaimportowanych`
}

export function detectedRecordsLabel(count: number): string {
  return `${count} ${polishPlural(count, 'rekord wykryty', 'rekordy wykryte', 'rekordów wykrytych')}`
}

export function importWriteCtaLabel(selectedCount: number): string {
  return `Importuj ${selectedCount} ${polishPlural(selectedCount, 'ślub', 'śluby', 'ślubów')}`
}

export function selectedImportCount(rows: WeddingImportReviewRow[]): number {
  return rows.filter((row) => row.selectedForImport).length
}

export function selectedMissingAmountCount(rows: WeddingImportReviewRow[]): number {
  return rows.filter(
    (row) =>
      row.selectedForImport &&
      (row.priceState === 'unmapped' || row.priceState === 'empty'),
  ).length
}

export function humanizeImportIssue(
  issue: ImportRowIssue,
  row?: WeddingImportReviewRow,
): string {
  switch (issue.code) {
    case 'IMPORT_DATE_PARSE_FAILED':
      return 'Nie udało się odczytać daty.'
    case 'INVALID_CONTRACT_VALUE':
      return 'Nie udało się odczytać kwoty. Popraw wartość przed importem.'
    case 'MISSING_CONTRACT_VALUE':
      return 'Brak kwoty — zlecenie zostanie utworzone z wartością 0 zł.'
    case 'DUPLICATE_IN_FILE':
      return 'Ten rekord powtarza się w tym pliku.'
    case 'DUPLICATE_EXISTING_WEDDING':
    case 'POSSIBLE_DUPLICATE':
      return 'Podobne zlecenie jest już w OurWed.'
    case 'PACKAGE_NOT_MATCHED': {
      const fromNote = row?.note?.match(/Pakiet z importu:\s*(.+)$/m)?.[1]?.trim()
      if (fromNote) {
        return `Nie znaleziono pakietu „${fromNote}”. Kwota z pliku zostanie zachowana, a nazwa trafi do notatki.`
      }
      return issue.message
    }
    case 'INVALID_EMAIL':
      return 'Niepoprawny adres e-mail.'
    case 'MISSING_COUPLE_NAME':
      return 'Brak nazwy pary lub klienta.'
    default:
      return issue.message
  }
}

export function visibleImportIssues(row: WeddingImportReviewRow): ImportRowIssue[] {
  const seen = new Set<string>()
  const issues: ImportRowIssue[] = []
  for (const issue of row.issues) {
    if (seen.has(issue.code)) continue
    seen.add(issue.code)
    issues.push(issue)
  }
  return issues
}

export function formatImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  const mb = bytes / (1024 * 1024)
  const rounded = mb >= 10 ? String(Math.round(mb)) : mb.toFixed(1).replace('.', ',')
  return `${rounded} MB`
}

/** Review/result amount — keeps grosze. Do not use contract integer rounding. */
export function formatImportAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '0 zł'
  const cents = Math.round(amount * 100) / 100
  if (Number.isInteger(cents)) {
    const grouped = String(Math.trunc(cents)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    return `${grouped} zł`
  }
  return `${new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents)} zł`
}

export function isRequiredImportField(field: ImportField): boolean {
  return (
    field === 'weddingDate' ||
    field === 'coupleDisplayName' ||
    field === 'partner1Name' ||
    field === 'partner2Name'
  )
}

export function mappingFieldLabel(field: ImportField): string {
  return IMPORT_FIELD_LABELS[field]
}

export function importWriteCaption(selectedCount: number): string {
  if (selectedCount <= 0) return 'Wybierz rekordy, które OurWed ma zapisać.'
  return `Zapisze ${selectedCount} ${polishPlural(selectedCount, 'nowy ślub', 'nowe śluby', 'nowych ślubów')} w OurWed.`
}

export function missingAmountNotice(count: number): string {
  if (count === 1) {
    return '1 wybrane zlecenie zostanie utworzone z wartością 0 zł.'
  }
  const noun = polishPlural(count, 'wybrane zlecenie', 'wybrane zlecenia', 'wybranych zleceń')
  const verb = polishPlural(count, 'zostanie utworzone', 'zostaną utworzone', 'zostanie utworzonych')
  return `${count} ${noun} ${verb} z wartością 0 zł.`
}

export function importedResultHeadline(imported: number, requested: number): string {
  if (imported <= 0) return 'Nie udało się zaimportować ślubów.'
  if (requested > 0 && imported < requested) {
    return `Zaimportowano ${imported} z ${requested} ${polishPlural(requested, 'ślubu', 'ślubów', 'ślubów')}.`
  }
  return `Zaimportowano ${imported} ${polishPlural(imported, 'ślub', 'śluby', 'ślubów')}.`
}

export function failedImportRecordsHeadline(count: number): string {
  return `Nie udało się zaimportować ${count} ${polishPlural(count, 'rekordu', 'rekordów', 'rekordów')}.`
}

export function humanizeImportWriteError(message: string | undefined): string {
  if (!message) return 'Nie udało się zapisać tego zlecenia. Spróbuj ponownie.'
  const trimmed = message.trim()
  if (!trimmed) return 'Nie udało się zapisać tego zlecenia. Spróbuj ponownie.'
  if (/[ąćęłńóśźż]/i.test(trimmed) && trimmed.length < 160) return trimmed
  return 'Nie udało się zapisać tego zlecenia. Spróbuj ponownie.'
}

export function contactLines(row: WeddingImportReviewRow): string[] {
  return [row.phone?.trim(), row.email?.trim()].filter((value): value is string => Boolean(value))
}
