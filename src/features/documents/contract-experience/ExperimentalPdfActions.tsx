/**
 * Experimental DOCX→PDF action (Gotenberg via Edge Function).
 * Shared by production ready preview and Transform Lab results.
 * Conversion only — never rebuilds DOCX or reruns AI.
 */

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { isExperimentalPdfExportEnabled } from '@/features/documents/template/experimentalPdfFlags'
import { createGotenbergPdfAdapter } from '@/features/documents/template/gotenbergPdfAdapter'
import styles from './ExperimentalPdfActions.module.css'

export function ExperimentalPdfActions(props: {
  /** Exact final DOCX for this artifact (already generated). */
  docxBytes: ArrayBuffer | null | undefined
  fileName: string
  runId?: string
  /** When false, render nothing even if the Vite flag is on. */
  enabled?: boolean
  /** Compact layout for lab action rows. */
  compact?: boolean
}) {
  const flagOn = isExperimentalPdfExportEnabled()
  const show = flagOn && (props.enabled ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  if (!show) return null

  async function convert() {
    if (!props.docxBytes) {
      setError(
        'Brak pliku DOCX do konwersji. Najpierw pobierz lub wygeneruj dokument.',
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pdfBytes = await createGotenbergPdfAdapter({
        runId: props.runId,
      }).convertDocx({
        docxBytes: props.docxBytes,
        fileName: props.fileName.endsWith('.docx')
          ? props.fileName
          : `${props.fileName}.docx`,
      })
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(
          new Blob([pdfBytes], { type: 'application/pdf' }),
        )
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Nie udało się utworzyć testowego PDF. Dokument DOCX jest nadal gotowy i możesz go pobrać.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={props.compact ? styles.compact : styles.panel}
      data-testid="experimental-pdf-actions"
    >
      {!props.compact ? (
        <div>
          <h3 className={styles.title}>Testowy PDF</h3>
          <p className={styles.desc}>
            PDF jest tworzony przez LibreOffice i może nieznacznie różnić się od
            dokumentu otwartego w Microsoft Word.
          </p>
        </div>
      ) : null}
      <div className={styles.row}>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !props.docxBytes}
          onClick={() => void convert()}
        >
          {busy
            ? 'Tworzymy PDF…'
            : pdfUrl
              ? 'Ponów tworzenie PDF'
              : 'Utwórz testowy PDF'}
        </Button>
        {pdfUrl ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}
          >
            Pobierz PDF
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {pdfUrl ? (
        <iframe title="Testowy PDF" src={pdfUrl} className={styles.frame} />
      ) : null}
    </div>
  )
}
