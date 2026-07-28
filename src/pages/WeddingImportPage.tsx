import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { packageService } from '@/lib/api/packageService'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/dates'
import {
  WeddingImportStepper,
  type WeddingImportStepId,
} from '@/features/weddings/import/WeddingImportStepper'
import {
  buildReviewRows,
  executeWeddingImport,
  createImportSessionId,
  loadSavedColumnMappings,
  parseImportWorkbook,
  revalidateReviewRow,
  saveColumnMappings,
  validateColumnMappings,
  spreadsheetCellDisplay,
  applyHeaderRowSelection,
  detectAndApplyHeaderRow,
  reviewDateInputValue,
  type ColumnMapping,
  type ImportField,
  type ParsedWorkbook,
  type ParsedWorkbookSheet,
  type RawImportRow,
  type WeddingImportResult,
  type WeddingImportReviewRow,
  IMPORT_FIELD_LABELS,
  SINGLE_TARGET_FIELDS,
} from '@/features/weddings/import'
import styles from './WeddingImportPage.module.css'

const STATUS_LABELS: Record<WeddingImportReviewRow['status'], string> = {
  ready: 'Gotowy',
  warning: 'Wymaga uwagi',
  invalid: 'Błąd',
  possible_duplicate: 'Możliwy duplikat',
  excluded: 'Pominięty',
}

export function WeddingImportPage() {
  const userId = useStudioAuthId()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { data: existingWeddings = [] } = useWeddings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<WeddingImportStepId>('upload')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null)
  const [date1904, setDate1904] = useState(false)
  const [sheetName, setSheetName] = useState('')
  const [confirmedHeaderRowIndexZeroBased, setConfirmedHeaderRowIndexZeroBased] =
    useState(0)
  const [headers, setHeaders] = useState<string[]>([])
  const [columnIds, setColumnIds] = useState<string[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [rawRows, setRawRows] = useState<RawImportRow[]>([])
  const [reviewRows, setReviewRows] = useState<WeddingImportReviewRow[]>([])
  const [savedMappingApplied, setSavedMappingApplied] = useState(false)
  const [importSessionId] = useState(() => createImportSessionId())
  const [importResult, setImportResult] = useState<WeddingImportResult | null>(
    null,
  )
  const [importedRowIds] = useState(() => new Set<string>())

  const { data: packages = [] } = useQuery({
    queryKey: ['packages', userId],
    queryFn: () => packageService.list({ activeOnly: false }),
    enabled: Boolean(userId),
  })

  const catalog = useMemo(
    () => packages.map((pkg) => ({ id: pkg.id, name: pkg.name })),
    [packages],
  )

  const selectedSheet: ParsedWorkbookSheet | null =
    workbook?.sheets.find((s) => s.id === selectedSheetId) ?? null

  async function handleFile(file: File) {
    setError(null)
    setParsing(true)
    try {
      const parsed = await parseImportWorkbook(file)
      setWorkbook(parsed)
      const firstSheet = parsed.sheets[0]!
      applySheet(firstSheet, parsed)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nie udało się odczytać tego pliku. Wybierz plik XLSX lub CSV.',
      )
    } finally {
      setParsing(false)
    }
  }

  function applySheetSelection(
    sheet: ParsedWorkbookSheet,
    savedMappings?: ColumnMapping[] | null,
  ) {
    const applied = detectAndApplyHeaderRow({ sheet, savedMappings })
    setSelectedSheetId(sheet.id)
    setSheetName(sheet.name)
    setDate1904(Boolean(sheet.date1904))
    setConfirmedHeaderRowIndexZeroBased(applied.confirmedHeaderRowIndexZeroBased)
    setHeaders(applied.headers)
    setColumnIds(applied.columnIds)
    setRawRows(applied.rawRows)
    setMappings(applied.mappings)
    return applied
  }

  function applySheet(sheet: ParsedWorkbookSheet, _wb?: ParsedWorkbook) {
    const applied = applySheetSelection(sheet, null)
    if (userId) {
      const savedForHeaders = loadSavedColumnMappings({
        userId,
        headers: applied.headers,
      })
      if (savedForHeaders) {
        const remapped = applyHeaderRowSelection({
          sheet,
          headerRowIndexZeroBased: applied.confirmedHeaderRowIndexZeroBased,
          savedMappings: savedForHeaders,
        })
        setMappings(remapped.mappings)
        setSavedMappingApplied(true)
        return
      }
    }
    setSavedMappingApplied(false)
  }

  function rebuildFromConfirmedHeader(
    sheet: ParsedWorkbookSheet,
    headerRowIndexZeroBased: number,
  ) {
    const applied = applyHeaderRowSelection({
      sheet,
      headerRowIndexZeroBased,
      savedMappings: null,
    })
    if (userId) {
      const saved = loadSavedColumnMappings({ userId, headers: applied.headers })
      if (saved) {
        const remapped = applyHeaderRowSelection({
          sheet,
          headerRowIndexZeroBased,
          savedMappings: saved,
        })
        setMappings(remapped.mappings)
        setSavedMappingApplied(true)
      } else {
        setMappings(applied.mappings)
        setSavedMappingApplied(false)
      }
    } else {
      setMappings(applied.mappings)
    }
    setConfirmedHeaderRowIndexZeroBased(applied.confirmedHeaderRowIndexZeroBased)
    setHeaders(applied.headers)
    setColumnIds(applied.columnIds)
    setRawRows(applied.rawRows)
  }

  function continueToMapping() {
    if (!selectedSheet) {
      setError('Wybierz arkusz do importu.')
      return
    }
    setStep('mapping')
  }

  function continueToReview() {
    const validation = validateColumnMappings(mappings)
    if (validation) {
      setError(validation)
      return
    }
    if (!selectedSheet) {
      setError('Wybierz arkusz do importu.')
      return
    }
    if (userId) {
      saveColumnMappings({ userId, headers, mappings })
    }

    const applied = applyHeaderRowSelection({
      sheet: selectedSheet,
      headerRowIndexZeroBased: confirmedHeaderRowIndexZeroBased,
      savedMappings: mappings,
    })
    setRawRows(applied.rawRows)
    setHeaders(applied.headers)
    setColumnIds(applied.columnIds)

    const rows = buildReviewRows({
      rows: applied.rawRows,
      mappings,
      existingWeddings,
      catalog,
      sheetName,
      date1904,
      confirmedHeaderRowIndexZeroBased,
    })
    setReviewRows(rows)
    setError(null)
    setStep('review')
  }

  function updateMapping(
    sourceColumnId: string,
    targetField: ImportField,
  ) {
    setMappings((prev) =>
      prev.map((mapping) => {
        if (mapping.sourceColumnId !== sourceColumnId) {
          if (mapping.targetField === targetField && targetField !== 'ignore') {
            return { ...mapping, targetField: 'ignore' as const }
          }
          return mapping
        }
        return {
          ...mapping,
          targetField,
          suggestedBy: 'manual',
        }
      }),
    )
  }

  function updateReviewRow(
    rowId: string,
    patch: Partial<WeddingImportReviewRow>,
  ) {
    setReviewRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        const next = revalidateReviewRow({ ...row, ...patch }, existingWeddings, catalog)
        return next
      }),
    )
  }

  async function runImport() {
    const selected = reviewRows.filter((row) => row.selectedForImport)
    if (!selected.length) {
      setError('Wybierz co najmniej jeden rekord do importu.')
      return
    }
    if (selected.some((row) => row.status === 'invalid')) {
      setError('Część rekordów wymaga poprawy przed importem.')
      return
    }

    setImporting(true)
    setError(null)
    try {
      const result = await executeWeddingImport({
        importSessionId,
        rows: reviewRows,
        importedRowIds,
      })
      for (const record of result.records) {
        if (record.status === 'imported') {
          importedRowIds.add(record.reviewRowId)
        }
      }
      setImportResult(result)
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setStep('done')
      if (result.failedCount > 0) {
        showToast(
          'Nie udało się zaimportować części ślubów. Pozostałe rekordy zostały zapisane poprawnie.',
          'error',
        )
      } else {
        showToast(`Zaimportowano ${result.importedCount} ślubów.`, 'success')
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nie udało się zakończyć importu.',
      )
    } finally {
      setImporting(false)
    }
  }

  const sampleValues = useMemo(() => {
    const samples = new Map<string, string[]>()
    for (const columnId of columnIds) {
      const values = rawRows
        .slice(0, 3)
        .map((row) => spreadsheetCellDisplay(row.values[columnId]).trim())
        .filter(Boolean)
      samples.set(columnId, values)
    }
    return samples
  }, [columnIds, rawRows])

  const selectedCount = reviewRows.filter((row) => row.selectedForImport).length

  return (
    <AppLayout
      title="Import ślubów"
      subtitle="Przenieś podstawowe dane z Excela lub CSV"
      action={
        <Link to="/sluby">
          <Button variant="secondary">Wróć do listy</Button>
        </Link>
      }
    >
      <PageContainer width="full">
        <WeddingImportStepper current={step} />

        {error ? <div className={styles.error}>{error}</div> : null}

        {step === 'upload' ? (
          <section className={styles.panel}>
            <h2 className={styles.heading}>Wybierz plik</h2>
            <p className={styles.lead}>
              Przenieś podstawowe dane swoich zleceń z Excela lub pliku CSV.
            </p>
            <p className={styles.hint}>
              Plik nie zostanie zaimportowany, dopóki nie sprawdzisz danych.
            </p>

            <div
              className={styles.dropzone}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files[0]
                if (file) void handleFile(file)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className={styles.fileInput}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                {parsing ? 'Odczytywanie pliku…' : 'Wybierz plik XLSX lub CSV'}
              </Button>
              {workbook ? (
                <p className={styles.fileName}>{workbook.fileName}</p>
              ) : null}
            </div>

            {workbook && workbook.sheets.length > 1 ? (
              <div className={styles.sheetList}>
                <h3 className={styles.subheading}>Wybierz arkusz</h3>
                {workbook.sheets.map((sheet) => (
                  <button
                    key={sheet.id}
                    type="button"
                    className={styles.sheetButton}
                    data-selected={sheet.id === selectedSheetId}
                    onClick={() => applySheet(sheet)}
                  >
                    {sheet.name} — {sheet.rowCount} wierszy
                  </button>
                ))}
              </div>
            ) : null}

            {selectedSheet ? (
              <div className={styles.headerPicker}>
                <label className={styles.label} htmlFor="header-row">
                  Wiersz nagłówków
                </label>
                <select
                  id="header-row"
                  className={styles.select}
                  value={confirmedHeaderRowIndexZeroBased}
                  onChange={(event) => {
                    const nextIndex = Number(event.target.value)
                    if (!selectedSheet) return
                    rebuildFromConfirmedHeader(selectedSheet, nextIndex)
                  }}
                >
                  {selectedSheet.rows.slice(0, 20).map((row) => (
                    <option
                      key={row.sheetRowIndexZeroBased}
                      value={row.sheetRowIndexZeroBased}
                    >
                      Wiersz {row.sheetRowIndexZeroBased + 1}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className={styles.actions}>
              <Button
                type="button"
                variant="primary"
                disabled={!selectedSheet || parsing}
                onClick={continueToMapping}
              >
                Dalej
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'mapping' ? (
          <section className={styles.panel}>
            <h2 className={styles.heading}>Dopasuj kolumny</h2>
            {savedMappingApplied ? (
              <p className={styles.hint}>
                Rozpoznano wcześniej używany układ kolumn. Zastosowano zapisane
                dopasowanie.
              </p>
            ) : null}
            <div className={styles.mappingTableWrap}>
              <table className={styles.mappingTable}>
                <thead>
                  <tr>
                    <th>Kolumna z pliku</th>
                    <th>Przykładowe wartości</th>
                    <th>Pole w OurWed</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping) => (
                    <tr key={mapping.sourceColumnId}>
                      <td>{mapping.sourceHeader}</td>
                      <td className={styles.samples}>
                        {(sampleValues.get(mapping.sourceColumnId) ?? []).join(
                          ' · ',
                        ) || '—'}
                      </td>
                      <td>
                        <select
                          className={styles.select}
                          value={mapping.targetField}
                          onChange={(event) =>
                            updateMapping(
                              mapping.sourceColumnId,
                              event.target.value as ImportField,
                            )
                          }
                        >
                          {(['ignore', ...SINGLE_TARGET_FIELDS] as ImportField[]).map(
                            (field) => (
                              <option key={field} value={field}>
                                {IMPORT_FIELD_LABELS[field]}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('upload')}
              >
                Wstecz
              </Button>
              <Button type="button" variant="primary" onClick={continueToReview}>
                Dalej
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'review' ? (
          <section className={styles.panel}>
            <h2 className={styles.heading}>Sprawdź dane</h2>
            <p className={styles.hint}>
              Wybrano {selectedCount} z {reviewRows.length} rekordów.
            </p>

            <div className={styles.reviewTableWrap}>
              <table className={styles.reviewTable}>
                <thead>
                  <tr>
                    <th />
                    <th>Status</th>
                    <th>Wiersz</th>
                    <th>Data</th>
                    <th>Para / klient</th>
                    <th>Wartość</th>
                    <th>Kontakt</th>
                    <th>Pakiet</th>
                    <th>Uwagi</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((row) => (
                    <tr key={row.id} data-status={row.status}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.selectedForImport}
                          disabled={row.status === 'invalid'}
                          onChange={(event) =>
                            updateReviewRow(row.id, {
                              selectedForImport: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td>
                        <span className={styles.badge} data-status={row.status}>
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td>{row.sourceRowNumber}</td>
                      <td>
                        <input
                          className={styles.cellInput}
                          type="date"
                          value={reviewDateInputValue(row.weddingDate)}
                          onChange={(event) =>
                            updateReviewRow(row.id, {
                              weddingDate: event.target.value || null,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className={styles.cellInput}
                          value={row.coupleDisplayName}
                          onChange={(event) =>
                            updateReviewRow(row.id, {
                              coupleDisplayName: event.target.value,
                              partner1Name: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className={styles.cellInput}
                          inputMode="decimal"
                          value={row.contractValue ?? ''}
                          onChange={(event) =>
                            updateReviewRow(row.id, {
                              contractValue:
                                event.target.value === ''
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className={styles.cellInput}
                          value={row.phone ?? ''}
                          onChange={(event) =>
                            updateReviewRow(row.id, { phone: event.target.value })
                          }
                          placeholder="Telefon"
                        />
                        <input
                          className={styles.cellInput}
                          value={row.email ?? ''}
                          onChange={(event) =>
                            updateReviewRow(row.id, { email: event.target.value })
                          }
                          placeholder="E-mail"
                        />
                      </td>
                      <td>{row.packageName ?? '—'}</td>
                      <td>
                        {row.issues.map((issue) => (
                          <div key={issue.code} className={styles.issue}>
                            {issue.message}
                          </div>
                        ))}
                        {row.status === 'possible_duplicate' ? (
                          <div className={styles.duplicateActions}>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                updateReviewRow(row.id, {
                                  duplicateDecision: 'skip',
                                  selectedForImport: false,
                                })
                              }
                            >
                              Pomiń rekord
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              onClick={() =>
                                updateReviewRow(row.id, {
                                  duplicateDecision: 'import_anyway',
                                  selectedForImport: true,
                                })
                              }
                            >
                              Importuj mimo to
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.reviewCards}>
              {reviewRows.map((row) => (
                <article key={row.id} className={styles.reviewCard}>
                  <div className={styles.reviewCardHeader}>
                    <label>
                      <input
                        type="checkbox"
                        checked={row.selectedForImport}
                        disabled={row.status === 'invalid'}
                        onChange={(event) =>
                          updateReviewRow(row.id, {
                            selectedForImport: event.target.checked,
                          })
                        }
                      />{' '}
                      Wiersz {row.sourceRowNumber}
                    </label>
                    <span className={styles.badge} data-status={row.status}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <div className={styles.reviewCardBody}>
                    <div>{row.coupleDisplayName || '—'}</div>
                    <div>{row.weddingDate ? formatDate(row.weddingDate) : '—'}</div>
                    <div>
                      {row.contractValue != null
                        ? formatCurrency(row.contractValue)
                        : '—'}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('mapping')}
              >
                Wstecz
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={importing || selectedCount === 0}
                onClick={() => void runImport()}
              >
                {importing ? 'Importowanie…' : `Importuj wybrane (${selectedCount})`}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'done' && importResult ? (
          <section className={styles.panel}>
            <h2 className={styles.heading}>Import zakończony</h2>
            <div className={styles.resultGrid}>
              <div>Zaimportowano: {importResult.importedCount}</div>
              <div>Pominięto: {importResult.skippedCount}</div>
              <div>Nie udało się zaimportować: {importResult.failedCount}</div>
            </div>
            {importResult.failedCount > 0 ? (
              <div className={styles.failedList}>
                <h3 className={styles.subheading}>Błędy</h3>
                {importResult.records
                  .filter((record) => record.status === 'failed')
                  .map((record) => (
                    <div key={record.reviewRowId} className={styles.issue}>
                      Wiersz {record.sourceRowNumber}: {record.message}
                    </div>
                  ))}
              </div>
            ) : null}
            <p className={styles.hint}>
              Zaimportowane śluby możesz sprawdzić na liście ślubów.
            </p>
            <div className={styles.actions}>
              <Link to="/sluby">
                <Button variant="primary">Przejdź do ślubów</Button>
              </Link>
              <Button
                type="button"
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Importuj kolejny plik
              </Button>
            </div>
          </section>
        ) : null}
      </PageContainer>
    </AppLayout>
  )
}
