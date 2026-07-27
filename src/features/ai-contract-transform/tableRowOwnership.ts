/**
 * Deterministic table row ownership for transform blocks.
 */

export type TableRowOwnershipFamily =
  | 'customer'
  | 'provider'
  | 'wedding_date'
  | 'wedding_location'
  | 'service_scope'
  | 'unknown'

export type TableCellContext = {
  tableIndex: number
  rowIndex: number
  cellIndex: number
  rowLabelText: string
  columnHeaderText?: string
  neighboringCellTexts: string[]
  ownershipFamily: TableRowOwnershipFamily
}

const CUSTOMER_LABELS = [
  'zamawiajacy',
  'klient',
  'klienci',
  'para mloda',
  'malzonkowie',
  'malzonki',
  'narzeczeni',
  'zleceniodawca',
]

const PROVIDER_LABELS = [
  'wykonawca',
  'uslugodawca',
  'fotograf',
  'kamerzysta',
  'filmowiec',
  'studio',
  'firma',
]

const DATE_LABELS = [
  'data wydarzenia',
  'data slubu',
  'termin wydarzenia',
  'termin',
]

const LOCATION_LABELS = [
  'lokalizacja',
  'miejsce',
  'miejsce wydarzenia',
  'miejsce slubu',
]

const SERVICE_HEADERS = ['material', 'dlugosc', 'w cenie', 'w cenie?']

export function normalizeLabel(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.:;!?()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelMatches(normalized: string, candidates: string[]): boolean {
  if (!normalized) return false
  return candidates.some(
    (c) => normalized === c || normalized.startsWith(`${c} `) || normalized.includes(c),
  )
}

export function classifyRowLabel(labelText: string): TableRowOwnershipFamily {
  const n = normalizeLabel(labelText)
  if (!n) return 'unknown'
  if (labelMatches(n, CUSTOMER_LABELS)) return 'customer'
  if (labelMatches(n, PROVIDER_LABELS)) return 'provider'
  if (labelMatches(n, LOCATION_LABELS)) return 'wedding_location'
  if (labelMatches(n, DATE_LABELS)) return 'wedding_date'
  return 'unknown'
}

export function isServiceScopeHeaderRow(cellTexts: string[]): boolean {
  const norms = cellTexts.map(normalizeLabel).filter(Boolean)
  if (norms.length < 2) return false
  let hits = 0
  for (const h of SERVICE_HEADERS) {
    if (norms.some((n) => n === h || n.includes(h))) hits += 1
  }
  return hits >= 2
}

export type TableGrid = {
  tableIndex: number
  rows: Array<{ rowIndex: number; cells: Array<{ cellIndex: number; text: string }> }>
}

/**
 * Build per-block table context from a table grid + block coordinates.
 */
export function buildTableCellContext(input: {
  table: TableGrid
  rowIndex: number
  cellIndex: number
  isServiceScopeTable: boolean
}): TableCellContext {
  const row = input.table.rows.find((r) => r.rowIndex === input.rowIndex)
  const cells = row?.cells ?? []
  const neighboringCellTexts = cells
    .filter((c) => c.cellIndex !== input.cellIndex)
    .map((c) => c.text)
  const labelCell =
    cells.find((c) => c.cellIndex === 0) ??
    cells.find((c) => c.cellIndex !== input.cellIndex)
  const rowLabelText = labelCell?.text?.trim() ?? ''
  const headerRow = input.table.rows.find((r) => r.rowIndex === 0)
  const headerCell = headerRow?.cells.find((c) => c.cellIndex === input.cellIndex)
  const columnHeaderText = headerCell?.text?.trim() || undefined

  let ownershipFamily: TableRowOwnershipFamily = 'unknown'
  if (input.isServiceScopeTable) {
    ownershipFamily = 'service_scope'
  } else if (input.cellIndex === 0) {
    // Label cell itself — ownership of the label row
    ownershipFamily = classifyRowLabel(rowLabelText || cells[0]?.text || '')
  } else {
    ownershipFamily = classifyRowLabel(rowLabelText)
  }

  return {
    tableIndex: input.table.tableIndex,
    rowIndex: input.rowIndex,
    cellIndex: input.cellIndex,
    rowLabelText,
    columnHeaderText,
    neighboringCellTexts,
    ownershipFamily,
  }
}

export function detectServiceScopeTables(tables: TableGrid[]): Set<number> {
  const out = new Set<number>()
  for (const table of tables) {
    const header = table.rows.find((r) => r.rowIndex === 0)
    if (!header) continue
    if (isServiceScopeHeaderRow(header.cells.map((c) => c.text))) {
      out.add(table.tableIndex)
    }
  }
  return out
}
