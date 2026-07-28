import { parseImportDateDetailed, spreadsheetCellDisplay, spreadsheetCellRaw } from './parseDates'
import { parseImportMoney } from './parseMoney'
import { parseCoupleDisplayName, partner2ForCreate } from './parseNames'
import { isValidEmailStructure } from './normalizeContact'
import { detectDuplicateCandidates } from './detectDuplicates'
import { isLikelySummaryRow } from './detectSummaryRows'
import { matchPackageByName } from './packageMatch'
import { isHeaderLikeDataRow } from './detectHeaderRow'
import { logImportDateDiagnostics } from './importPipeline'
import type {
  ColumnMapping,
  ImportRowIssue,
  RawImportRow,
  SpreadsheetCellValue,
  WeddingImportReviewRow,
  WeddingImportReviewRowStatus,
} from './types'
import type { Wedding } from '@/types/wedding'
import type { CreateWeddingInput } from '@/types/wedding'
import type { PackageCatalogEntry } from './packageMatch'

function isDevEnvironment(): boolean {
  try {
    return Boolean(import.meta.env?.DEV)
  } catch {
    return false
  }
}

function createRowId(sourceRowNumber: number): string {
  return `row-${sourceRowNumber}`
}

function getMappedValue(
  row: RawImportRow,
  mappings: ColumnMapping[],
  field: ColumnMapping['targetField'],
): SpreadsheetCellValue | undefined {
  const mapping = mappings.find((m) => m.targetField === field)
  if (!mapping) return undefined
  return row.values[mapping.sourceColumnId]
}

function deriveStatus(issues: ImportRowIssue[]): WeddingImportReviewRowStatus {
  if (issues.some((i) => i.severity === 'error')) return 'invalid'
  if (issues.some((i) => i.code === 'POSSIBLE_DUPLICATE')) return 'possible_duplicate'
  if (issues.some((i) => i.severity === 'warning')) return 'warning'
  return 'ready'
}

export function buildReviewRow(input: {
  row: RawImportRow
  mappings: ColumnMapping[]
  existingWeddings: Wedding[]
  catalog: PackageCatalogEntry[]
  sheetName?: string
  date1904?: boolean
  confirmedHeaderRowIndexZeroBased?: number
  logDateDiagnostics?: boolean
}): WeddingImportReviewRow {
  const issues: ImportRowIssue[] = []

  if (isHeaderLikeDataRow({ row: input.row, mappings: input.mappings })) {
    issues.push({
      code: 'IMPORT_HEADER_ROW_DETECTED_AS_DATA',
      severity: 'error',
      message: 'Ten wiersz wygląda na nagłówek tabeli, a nie rekord ślubu.',
    })
  }

  const dateMapping = input.mappings.find((m) => m.targetField === 'weddingDate')
  const dateCell = getMappedValue(input.row, input.mappings, 'weddingDate')
  const dateResult = parseImportDateDetailed(dateCell, {
    sheetName: input.sheetName,
    date1904: input.date1904,
  })
  const weddingDate = dateResult.date

  if (input.logDateDiagnostics) {
    logImportDateDiagnostics({
      confirmedHeaderRowIndexZeroBased: input.confirmedHeaderRowIndexZeroBased ?? -1,
      sourceRowNumberOneBased: input.row.sourceRowNumber,
      mappedDateColumn: dateMapping?.sourceColumnId ?? null,
      rawDateCell: dateCell?.raw ?? null,
      formattedDateCell: dateCell?.formatted ?? null,
      parsedDate: dateResult.date,
      dateIssueCode: dateResult.issueCode ?? null,
      reviewWeddingDate: weddingDate,
    })
  }

  if (!weddingDate) {
    const label = dateResult.sourceDisplay
      ? `Nie udało się odczytać daty „${dateResult.sourceDisplay}”. Wybierz poprawną datę.`
      : 'Nie udało się odczytać daty. Wybierz poprawną datę.'
    issues.push({
      code: dateResult.issueCode ?? 'IMPORT_DATE_PARSE_FAILED',
      field: 'weddingDate',
      severity: 'error',
      message: label,
    })
  }

  const coupleRaw =
    spreadsheetCellDisplay(
      getMappedValue(input.row, input.mappings, 'coupleDisplayName'),
    ) ||
    [
      getMappedValue(input.row, input.mappings, 'partner1Name'),
      getMappedValue(input.row, input.mappings, 'partner2Name'),
    ]
      .map((cell) => spreadsheetCellDisplay(cell))
      .filter(Boolean)
      .join(' i ')

  const parsedCouple = parseCoupleDisplayName(coupleRaw)
  if (!parsedCouple) {
    issues.push({
      code: 'MISSING_COUPLE_NAME',
      field: 'coupleDisplayName',
      severity: 'error',
      message: 'Brak nazwy pary lub klienta.',
    })
  }

  const partner1FromColumns = spreadsheetCellDisplay(
    getMappedValue(input.row, input.mappings, 'partner1Name'),
  ).trim()
  const partner2FromColumns = spreadsheetCellDisplay(
    getMappedValue(input.row, input.mappings, 'partner2Name'),
  ).trim()

  const partner1Name = partner1FromColumns || parsedCouple?.partner1Name || ''
  const partner2Name = partner2FromColumns || parsedCouple?.partner2Name || ''
  const coupleDisplayName =
    parsedCouple?.displayName ||
    [partner1Name, partner2Name].filter(Boolean).join(' i ')

  const contractValue = parseImportMoney(
    spreadsheetCellRaw(getMappedValue(input.row, input.mappings, 'contractValue')),
  )
  if (contractValue == null) {
    issues.push({
      code: 'MISSING_CONTRACT_VALUE',
      field: 'contractValue',
      severity: 'warning',
      message: 'Brak wartości umowy.',
    })
  }

  const phone = spreadsheetCellDisplay(
    getMappedValue(input.row, input.mappings, 'phone'),
  ).trim()
  const email = spreadsheetCellDisplay(
    getMappedValue(input.row, input.mappings, 'email'),
  ).trim()
  if (email && !isValidEmailStructure(email)) {
    issues.push({
      code: 'INVALID_EMAIL',
      field: 'email',
      severity: 'warning',
      message: 'Niepoprawny adres e-mail.',
    })
  }

  const note = spreadsheetCellDisplay(
    getMappedValue(input.row, input.mappings, 'note'),
  ).trim()
  const packageRaw = spreadsheetCellDisplay(
    getMappedValue(input.row, input.mappings, 'packageName'),
  ).trim()
  const packageMatch = matchPackageByName(packageRaw, input.catalog)
  let packageName = packageMatch.packageName
  let matchedPackageId = packageMatch.packageId
  let mergedNote = note

  if (packageRaw && !packageMatch.exact) {
    const suffix = `Pakiet z importu: ${packageRaw}`
    mergedNote = mergedNote ? `${mergedNote}\n${suffix}` : suffix
    packageName = undefined
    matchedPackageId = undefined
    issues.push({
      code: 'PACKAGE_NOT_MATCHED',
      field: 'packageName',
      severity: 'warning',
      message: 'Nie znaleziono dokładnego dopasowania pakietu.',
    })
  }

  if (
    isLikelySummaryRow({
      coupleDisplayName,
      weddingDate,
      contractValue,
      note: mergedNote,
    })
  ) {
    issues.push({
      code: 'LIKELY_SUMMARY_ROW',
      severity: 'error',
      message: 'Wiersz wygląda na podsumowanie arkusza.',
    })
  }

  const duplicateCandidates = detectDuplicateCandidates({
    weddingDate,
    coupleDisplayName,
    partner1Name,
    partner2Name,
    email: email || undefined,
    phone: phone || undefined,
    contractValue,
    existingWeddings: input.existingWeddings,
  })

  if (duplicateCandidates.length) {
    issues.push({
      code: 'POSSIBLE_DUPLICATE',
      severity: 'warning',
      message: 'Możliwy duplikat istniejącego ślubu.',
    })
  }

  const status = deriveStatus(issues)
  const selectedForImport =
    status === 'ready' || status === 'warning'

  return {
    id: createRowId(input.row.sourceRowNumber),
    sourceRowNumber: input.row.sourceRowNumber,
    weddingDate,
    weddingDateSourceDisplay: dateResult.sourceDisplay,
    coupleDisplayName,
    partner1Name,
    partner2Name,
    contractValue,
    phone: phone || undefined,
    email: email || undefined,
    packageName,
    matchedPackageId,
    note: mergedNote || undefined,
    status,
    issues,
    duplicateCandidates,
    selectedForImport:
      status === 'possible_duplicate' || issues.some((i) => i.code === 'IMPORT_HEADER_ROW_DETECTED_AS_DATA')
        ? false
        : selectedForImport,
    duplicateDecision:
      status === 'possible_duplicate' ? 'skip' : undefined,
  }
}

export function buildReviewRows(input: {
  rows: RawImportRow[]
  mappings: ColumnMapping[]
  existingWeddings: Wedding[]
  catalog: PackageCatalogEntry[]
  sheetName?: string
  date1904?: boolean
  confirmedHeaderRowIndexZeroBased?: number
}): WeddingImportReviewRow[] {
  return input.rows.map((row, index) =>
    buildReviewRow({
      row,
      mappings: input.mappings,
      existingWeddings: input.existingWeddings,
      catalog: input.catalog,
      sheetName: input.sheetName,
      date1904: input.date1904,
      confirmedHeaderRowIndexZeroBased: input.confirmedHeaderRowIndexZeroBased,
      logDateDiagnostics: isDevEnvironment() && index === 0,
    }),
  )
}

export function revalidateReviewRow(
  row: WeddingImportReviewRow,
  existingWeddings: Wedding[],
  _catalog: PackageCatalogEntry[],
): WeddingImportReviewRow {
  const issues: ImportRowIssue[] = []

  if (!row.weddingDate) {
    issues.push({
      code: 'IMPORT_DATE_PARSE_FAILED',
      field: 'weddingDate',
      severity: 'error',
      message: row.weddingDateSourceDisplay
        ? `Nie udało się odczytać daty „${row.weddingDateSourceDisplay}”. Wybierz poprawną datę.`
        : 'Nie udało się odczytać daty. Wybierz poprawną datę.',
    })
  }

  if (!row.coupleDisplayName.trim() && !row.partner1Name.trim()) {
    issues.push({
      code: 'MISSING_COUPLE_NAME',
      field: 'coupleDisplayName',
      severity: 'error',
      message: 'Brak nazwy pary lub klienta.',
    })
  }

  if (row.contractValue == null) {
    issues.push({
      code: 'MISSING_CONTRACT_VALUE',
      field: 'contractValue',
      severity: 'warning',
      message: 'Brak wartości umowy.',
    })
  }

  if (row.email && !isValidEmailStructure(row.email)) {
    issues.push({
      code: 'INVALID_EMAIL',
      field: 'email',
      severity: 'warning',
      message: 'Niepoprawny adres e-mail.',
    })
  }

  if (row.packageName && !row.matchedPackageId) {
    issues.push({
      code: 'PACKAGE_NOT_MATCHED',
      field: 'packageName',
      severity: 'warning',
      message: 'Nie znaleziono dokładnego dopasowania pakietu.',
    })
  }

  const duplicateCandidates = detectDuplicateCandidates({
    weddingDate: row.weddingDate,
    coupleDisplayName: row.coupleDisplayName,
    partner1Name: row.partner1Name,
    partner2Name: row.partner2Name,
    email: row.email,
    phone: row.phone,
    contractValue: row.contractValue,
    existingWeddings,
  })

  if (duplicateCandidates.length) {
    issues.push({
      code: 'POSSIBLE_DUPLICATE',
      severity: 'warning',
      message: 'Możliwy duplikat istniejącego ślubu.',
    })
  }

  const status = deriveStatus(issues)
  const duplicateBlocked =
    status === 'possible_duplicate' && row.duplicateDecision !== 'import_anyway'

  return {
    ...row,
    partner2Name: row.partner2Name,
    issues,
    duplicateCandidates,
    status: row.status === 'excluded' ? 'excluded' : status,
    selectedForImport:
      row.status === 'excluded'
        ? false
        : duplicateBlocked
          ? false
          : status !== 'invalid' && row.selectedForImport,
  }
}

export function reviewRowToCreateInput(row: WeddingImportReviewRow): CreateWeddingInput {
  const packageLabel =
    row.matchedPackageId && row.packageName
      ? row.packageName
      : row.packageName?.trim() || 'Bez pakietu'

  const importedTitle = row.coupleDisplayName.trim()

  return {
    partner1: row.partner1Name.trim() || importedTitle,
    partner2: partner2ForCreate(row.partner2Name),
    date: row.weddingDate!,
    packageId: row.matchedPackageId ?? null,
    packageName: packageLabel,
    price: row.contractValue ?? 0,
    depositPaid: false,
    phone: row.phone,
    email: row.email,
    notes: row.note,
    /** Original spreadsheet client/couple title — UI presentation only. */
    displayName: importedTitle || null,
    creationOptions: {
      source: 'spreadsheet_import',
      preserveImportedPrice: true,
    },
  }
}
