import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/layouts/AppLayout'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PageContainer } from '@/components/ui/PageContainer'
import { useToast } from '@/components/ui/Toast'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { invalidateFinanceQueries } from '@/features/finance/invalidateFinanceQueries'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { useProMutationPageGuard } from '@/features/billing/useProMutationPageGuard'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { packageService } from '@/lib/api/packageService'
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
  applyInFileDuplicateFlags,
  isWritableImportRow,
  saveColumnMappings,
  validateColumnMappings,
  spreadsheetCellDisplay,
  applyHeaderRowSelection,
  detectAndApplyHeaderRow,
  type ColumnMapping,
  type ImportField,
  type ParsedWorkbook,
  type ParsedWorkbookSheet,
  type RawImportRow,
  type WeddingImportResult,
  type WeddingImportReviewRow,
} from '@/features/weddings/import'
import type { ImportReviewFilter } from '@/features/weddings/import/importPresentation'
import { ImportUploadStep } from '@/features/weddings/import/components/ImportUploadStep'
import { ImportMappingStep } from '@/features/weddings/import/components/ImportMappingStep'
import { ImportReviewStep } from '@/features/weddings/import/components/ImportReviewStep'
import { ImportResultStep } from '@/features/weddings/import/components/ImportResultStep'
import styles from './WeddingImportPage.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

function mergeImportResults(
  previous: WeddingImportResult | null,
  next: WeddingImportResult,
): WeddingImportResult {
  if (!previous) return next
  const byId = new Map(previous.records.map((record) => [record.reviewRowId, record]))
  for (const record of next.records) {
    byId.set(record.reviewRowId, record)
  }
  const records = [...byId.values()]
  return {
    importSessionId: previous.importSessionId,
    requestedCount: previous.requestedCount,
    importedCount: records.filter((record) => record.status === 'imported').length,
    failedCount: records.filter((record) => record.status === 'failed').length,
    skippedCount: records.filter((record) => record.status === 'skipped').length,
    records,
  }
}

export function WeddingImportPage() {
  const navigate = useNavigate()
  const userId = useStudioAuthId()
  const { requirePro } = useProAccessGate()
  useProMutationPageGuard('/sluby')
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { data: existingWeddings = [] } = useWeddings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<WeddingImportStepId>('upload')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null)
  const [date1904, setDate1904] = useState(false)
  const [sheetName, setSheetName] = useState('')
  const [confirmedHeaderRowIndexZeroBased, setConfirmedHeaderRowIndexZeroBased] =
    useState(0)
  const [headerAutoDetected, setHeaderAutoDetected] = useState(true)
  const [leftUpload, setLeftUpload] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [columnIds, setColumnIds] = useState<string[]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [rawRows, setRawRows] = useState<RawImportRow[]>([])
  const [reviewRows, setReviewRows] = useState<WeddingImportReviewRow[]>([])
  const [reviewFilter, setReviewFilter] = useState<ImportReviewFilter>('all')
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [savedMappingApplied, setSavedMappingApplied] = useState(false)
  const [importSessionId, setImportSessionId] = useState(() => createImportSessionId())
  const [importResult, setImportResult] = useState<WeddingImportResult | null>(null)
  const [importedRowIds] = useState(() => new Set<string>())
  const [changeFileOpen, setChangeFileOpen] = useState(false)
  const [exitPrompt, setExitPrompt] = useState(false)

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

  const hasMeaningfulWork = Boolean(workbook) && step !== 'done'
  const blocker = useBlocker(hasMeaningfulWork)
  const leaveOpen = blocker.state === 'blocked' || exitPrompt

  useEffect(() => {
    if (!hasMeaningfulWork) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasMeaningfulWork])

  function stayInWizard() {
    if (blocker.state === 'blocked') blocker.reset()
    setExitPrompt(false)
  }

  function leaveWizard() {
    setExitPrompt(false)
    if (blocker.state === 'blocked') blocker.proceed()
    else navigate('/sluby')
  }

  function resetImportWizard() {
    setStep('upload')
    setParsing(false)
    setImporting(false)
    setError(null)
    setSourceFile(null)
    setWorkbook(null)
    setSelectedSheetId(null)
    setDate1904(false)
    setSheetName('')
    setConfirmedHeaderRowIndexZeroBased(0)
    setHeaderAutoDetected(true)
    setLeftUpload(false)
    setHeaders([])
    setColumnIds([])
    setMappings([])
    setRawRows([])
    setReviewRows([])
    setReviewFilter('all')
    setEditingRowId(null)
    setSavedMappingApplied(false)
    setImportSessionId(createImportSessionId())
    setImportResult(null)
    importedRowIds.clear()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(file: File) {
    setError(null)
    setParsing(true)
    try {
      const parsed = await parseImportWorkbook(file)
      setSourceFile(file)
      setWorkbook(parsed)
      const firstSheet = parsed.sheets[0]!
      applySheet(firstSheet)
      setReviewRows([])
      setImportResult(null)
      setHeaderAutoDetected(true)
      setLeftUpload(false)
      if (step === 'mapping' || step === 'review' || step === 'done') {
        setStep('upload')
      }
    } catch (err) {
      setError(
        getUserFacingErrorMessage(err, 'Nie udało się odczytać tego pliku. Wybierz plik XLSX lub CSV.'),
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

  function applySheet(sheet: ParsedWorkbookSheet) {
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
    setHeaderAutoDetected(false)
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
    setError(null)
    setLeftUpload(true)
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
    setReviewFilter('all')
    setEditingRowId(null)
    setError(null)
    setStep('review')
  }

  function updateMapping(sourceColumnId: string, targetField: ImportField) {
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

  function updateReviewRow(rowId: string, patch: Partial<WeddingImportReviewRow>) {
    setReviewRows((prev) =>
      applyInFileDuplicateFlags(
        prev.map((row) => {
          if (row.id !== rowId) return row
          return revalidateReviewRow({ ...row, ...patch }, existingWeddings, catalog)
        }),
      ),
    )
  }

  async function runImport() {
    if (!requirePro()) return
    const selected = reviewRows.filter((row) => row.selectedForImport)
    if (!selected.length) {
      setError('Wybierz co najmniej jeden rekord do importu.')
      return
    }
    if (selected.some((row) => !isWritableImportRow(row))) {
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
      setImportResult((prev) => mergeImportResults(prev, result))
      await queryClient.invalidateQueries({ queryKey: ['weddings'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      await invalidateFinanceQueries(queryClient)
      setStep('done')
      if (result.failedCount > 0) {
        showToast(
          'Nie udało się zaimportować części ślubów. Pozostałe rekordy zostały zapisane poprawnie.',
          'error',
        )
      } else if (result.importedCount > 0) {
        showToast(`Zaimportowano ${result.importedCount} ślubów.`, 'success')
      }
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Nie udało się zakończyć importu.'))
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

  const confirmChangeFile = leftUpload || step === 'mapping' || step === 'review'

  return (
    <AppLayout>
      <PageContainer width="wide">
        <div className={styles.workspace}>
          <header className={styles.pageHeader}>
            <button
              type="button"
              className={styles.exit}
              onClick={() => {
                if (hasMeaningfulWork) setExitPrompt(true)
                else navigate('/sluby')
              }}
            >
              ← Śluby
            </button>
            <h1 className={styles.pageTitle}>Importuj śluby</h1>
            <p className={styles.pageLead}>
              Przenieś zlecenia z arkusza do OurWed. Przed zapisaniem sprawdzisz wszystkie dane.
            </p>
          </header>
          <WeddingImportStepper current={step} />

          {error ? <div className={styles.error}>{error}</div> : null}

          {step === 'upload' ? (
            <ImportUploadStep
              parsing={parsing}
              workbook={workbook}
              sourceFile={sourceFile}
              selectedSheet={selectedSheet}
              selectedSheetId={selectedSheetId}
              confirmedHeaderRowIndexZeroBased={confirmedHeaderRowIndexZeroBased}
              headerAutoDetected={headerAutoDetected}
              fileInputRef={fileInputRef}
              recordCount={rawRows.length}
              onFileInputChange={(file) => void handleFile(file)}
              onRequestChangeFile={() => {
                if (confirmChangeFile) setChangeFileOpen(true)
                else fileInputRef.current?.click()
              }}
              onSelectSheet={applySheet}
              onHeaderRowChange={(index) => {
                if (!selectedSheet) return
                rebuildFromConfirmedHeader(selectedSheet, index)
              }}
              onContinue={continueToMapping}
            />
          ) : null}

          {step === 'mapping' ? (
            <ImportMappingStep
              mappings={mappings}
              sampleValues={sampleValues}
              savedMappingApplied={savedMappingApplied}
              onChangeMapping={updateMapping}
              onBack={() => setStep('upload')}
              onContinue={continueToReview}
            />
          ) : null}

          {step === 'review' ? (
            <ImportReviewStep
              rows={reviewRows}
              filter={reviewFilter}
              editingRowId={editingRowId}
              importing={importing}
              onFilterChange={setReviewFilter}
              onToggleRow={(rowId, selected) =>
                updateReviewRow(rowId, { selectedForImport: selected })
              }
              onUpdateRow={updateReviewRow}
              onEditRow={setEditingRowId}
              onDuplicateDecision={(rowId, decision) =>
                updateReviewRow(rowId, {
                  duplicateDecision: decision,
                  selectedForImport: decision === 'import_anyway',
                })
              }
              onBack={() => setStep('mapping')}
              onImport={() => void runImport()}
            />
          ) : null}

          {step === 'done' && importResult ? (
            <ImportResultStep
              result={importResult}
              rows={reviewRows}
              retrying={importing}
              onRetryFailures={() => void runImport()}
              onImportAnother={resetImportWizard}
            />
          ) : null}
        </div>
      </PageContainer>

      <Modal
        open={leaveOpen}
        title="Przerwać import?"
        description="Postęp importu nie zostanie zapisany."
        onClose={stayInWizard}
        cancelLabel="Zostań"
        mobilePresentation="center"
        primaryAction={
          <Button type="button" variant="danger" onClick={leaveWizard}>
            Przerwij import
          </Button>
        }
      >
        <p className={styles.dialogBody}>Możesz wrócić do listy ślubów i zacząć import od nowa później.</p>
      </Modal>

      <Modal
        open={changeFileOpen}
        title="Zmienić plik?"
        description="Dopasowanie kolumn i poprawki w danych zostaną utracone."
        onClose={() => setChangeFileOpen(false)}
        cancelLabel="Zostań"
        mobilePresentation="center"
        primaryAction={
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setChangeFileOpen(false)
              fileInputRef.current?.click()
            }}
          >
            Zmień plik
          </Button>
        }
      >
        <p className={styles.dialogBody}>Wybierz nowy arkusz tylko wtedy, gdy chcesz zacząć dopasowanie od nowa.</p>
      </Modal>
    </AppLayout>
  )
}
