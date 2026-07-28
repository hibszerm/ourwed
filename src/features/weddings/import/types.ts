export type ImportField =
  | 'weddingDate'
  | 'coupleDisplayName'
  | 'partner1Name'
  | 'partner2Name'
  | 'contractValue'
  | 'phone'
  | 'email'
  | 'packageName'
  | 'note'
  | 'ignore'

export type RawImportRow = {
  sourceRowNumber: number
  values: Record<string, SpreadsheetCellValue>
}

export type SpreadsheetCellValue = {
  raw: unknown
  formatted?: string
  cellType?: string
  numberFormat?: string
}

/** One physical sheet row with a stable Excel zero-based row index. */
export type SpreadsheetMatrixRow = {
  sheetRowIndexZeroBased: number
  cells: SpreadsheetCellValue[]
}

export type ColumnMapping = {
  sourceColumnId: string
  sourceHeader: string
  targetField: ImportField
  confidence?: number
  suggestedBy?: 'deterministic' | 'saved_mapping' | 'manual'
}

export type ImportRowIssue = {
  code: string
  field?: string
  severity: 'warning' | 'error'
  message: string
}

export type ImportDuplicateCandidate = {
  weddingId: string
  displayName: string
  weddingDate: string | null
  contractValue: number | null
  reason: string
}

export type WeddingImportReviewRowStatus =
  | 'ready'
  | 'warning'
  | 'invalid'
  | 'possible_duplicate'
  | 'excluded'

export type WeddingImportReviewRow = {
  id: string
  sourceRowNumber: number
  weddingDate: string | null
  weddingDateSourceDisplay?: string
  coupleDisplayName: string
  partner1Name: string
  partner2Name: string
  contractValue: number | null
  phone?: string
  email?: string
  packageName?: string
  matchedPackageId?: string
  note?: string
  status: WeddingImportReviewRowStatus
  issues: ImportRowIssue[]
  duplicateCandidates: ImportDuplicateCandidate[]
  selectedForImport: boolean
  duplicateDecision?: 'skip' | 'import_anyway'
}

export type ParsedWorkbookSheet = {
  id: string
  name: string
  rowCount: number
  rows: SpreadsheetMatrixRow[]
  date1904?: boolean
}

export type ParsedWorkbook = {
  fileName: string
  sheets: ParsedWorkbookSheet[]
}

export type WeddingImportResultRecord = {
  reviewRowId: string
  sourceRowNumber: number
  status: 'imported' | 'failed' | 'skipped'
  weddingId?: string
  errorCode?: string
  message?: string
}

export type WeddingImportResult = {
  importSessionId: string
  requestedCount: number
  importedCount: number
  failedCount: number
  skippedCount: number
  records: WeddingImportResultRecord[]
}

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  weddingDate: 'Data ślubu',
  coupleDisplayName: 'Para lub klient',
  partner1Name: 'Osoba 1',
  partner2Name: 'Osoba 2',
  contractValue: 'Wartość umowy',
  phone: 'Telefon',
  email: 'E-mail',
  packageName: 'Pakiet',
  note: 'Notatka',
  ignore: 'Nie importuj',
}

export const SINGLE_TARGET_FIELDS: ImportField[] = [
  'weddingDate',
  'coupleDisplayName',
  'partner1Name',
  'partner2Name',
  'contractValue',
  'phone',
  'email',
  'packageName',
  'note',
]
