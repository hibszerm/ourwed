import { useState, type DragEvent, type RefObject } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import type { ParsedWorkbook, ParsedWorkbookSheet } from '../types'
import { detectedRecordsLabel, formatImportFileSize } from '../importPresentation'
import styles from './importWorkspace.module.css'

type ImportUploadStepProps = {
  parsing: boolean
  workbook: ParsedWorkbook | null
  sourceFile: File | null
  selectedSheet: ParsedWorkbookSheet | null
  selectedSheetId: string | null
  confirmedHeaderRowIndexZeroBased: number
  headerAutoDetected: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  recordCount: number
  /** When true, omit client-comms line (shown in first-run support column). */
  hideClientCommsTrust?: boolean
  onFileInputChange: (file: File) => void
  onRequestChangeFile: () => void
  onSelectSheet: (sheet: ParsedWorkbookSheet) => void
  onHeaderRowChange: (index: number) => void
  onContinue: () => void
}

export function ImportUploadStep({
  parsing,
  workbook,
  sourceFile,
  selectedSheet,
  selectedSheetId,
  confirmedHeaderRowIndexZeroBased,
  headerAutoDetected,
  fileInputRef,
  recordCount,
  hideClientCommsTrust = false,
  onFileInputChange,
  onRequestChangeFile,
  onSelectSheet,
  onHeaderRowChange,
  onContinue,
}: ImportUploadStepProps) {
  const [dragActive, setDragActive] = useState(false)

  function openPicker() {
    fileInputRef.current?.click()
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files[0]
    if (file) onFileInputChange(file)
  }

  return (
    <section className={styles.stack} aria-labelledby="import-upload-heading">
      <div>
        <p className={styles.eyebrow}>Plik źródłowy</p>
        <h2 id="import-upload-heading" className={styles.heading}>
          Przenieś dane z arkusza
        </h2>
        <p className={styles.lead}>
          Wybierz plik Excel lub CSV. Nic nie zostanie zapisane bez Twojego
          potwierdzenia.
        </p>
        {!hideClientCommsTrust ? (
          <p className={styles.trustLine}>
            Nic nie zostanie wysłane do Twoich klientów.
          </p>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className={styles.fileInput}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFileInputChange(file)
          event.target.value = ''
        }}
      />

      {!workbook ? (
        <div
          className={styles.dropzone}
          data-active={dragActive ? 'true' : 'false'}
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={openPicker}
        >
          <Upload className={styles.fileIcon} size={28} strokeWidth={1.6} aria-hidden />
          <p className={styles.dropTitle}>
            <span className={styles.fromDesktop}>Przeciągnij plik tutaj</span>
            <span className={styles.fromMobile}>Wybierz plik z urządzenia</span>
          </p>
          <p className={`${styles.dropMeta} ${styles.fromDesktop}`}>lub wybierz z komputera</p>
          <p className={styles.dropMeta}>Excel (.xlsx, .xls) lub CSV (UTF-8) · maks. 10 MB</p>
          <div className={styles.fromDesktop}>
            <Button
              type="button"
              variant="secondary"
              disabled={parsing}
              onClick={(event) => {
                event.stopPropagation()
                openPicker()
              }}
            >
              {parsing ? 'Odczytywanie pliku…' : 'Wybierz z komputera'}
            </Button>
          </div>
          <div className={styles.fromMobile}>
            <Button
              type="button"
              variant="primary"
              disabled={parsing}
              onClick={(event) => {
                event.stopPropagation()
                openPicker()
              }}
            >
              {parsing ? 'Odczytywanie pliku…' : 'Wybierz plik'}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.selectedFile}>
          <div className={styles.fileIdentity}>
            <FileSpreadsheet size={24} strokeWidth={1.6} className={styles.fileIcon} aria-hidden />
            <div className={styles.fileCopy}>
              <p className={styles.fileName}>{workbook.fileName}</p>
              <p className={styles.fileMeta}>
                {[
                  sourceFile ? formatImportFileSize(sourceFile.size) : null,
                  selectedSheet ? selectedSheet.name : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className={styles.fileCount}>{detectedRecordsLabel(recordCount)}</p>
            </div>
          </div>
          <div className={styles.fileControls}>
            {workbook.sheets.length > 1 ? (
              <Select
                label="Arkusz"
                value={selectedSheetId ?? ''}
                onChange={(event) => {
                  const next = workbook.sheets.find((sheet) => sheet.id === event.target.value)
                  if (next) onSelectSheet(next)
                }}
              >
                {workbook.sheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {selectedSheet ? (
              <Select
                label="Wiersz z nagłówkami"
                value={String(confirmedHeaderRowIndexZeroBased)}
                onChange={(event) => onHeaderRowChange(Number(event.target.value))}
              >
                {selectedSheet.rows.slice(0, 20).map((row) => (
                  <option
                    key={row.sheetRowIndexZeroBased}
                    value={row.sheetRowIndexZeroBased}
                  >
                    Wiersz {row.sheetRowIndexZeroBased + 1}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          {headerAutoDetected ? (
            <p className={styles.hint}>Wykryto automatycznie</p>
          ) : null}
          <div className={styles.uploadActions}>
            <div className={styles.fromDesktop}>
              <Button type="button" variant="ghost" onClick={onRequestChangeFile}>
                Zmień plik
              </Button>
            </div>
            <div className={styles.fromMobile}>
              <button
                type="button"
                className={styles.rowAction}
                onClick={onRequestChangeFile}
              >
                Zmień plik
              </button>
            </div>
            <Button
              type="button"
              variant="primary"
              className={styles.uploadContinue}
              disabled={!selectedSheet || parsing}
              onClick={onContinue}
            >
              Dopasuj kolumny
            </Button>
          </div>
        </div>
      )}

      {!workbook ? (
        <p className={styles.trust}>Nic nie zostanie zapisane bez Twojego potwierdzenia.</p>
      ) : null}
    </section>
  )
}
