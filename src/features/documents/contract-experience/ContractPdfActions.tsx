/**
 * Production contract PDF download: exact final DOCX → Cloudmersive via Edge.
 * Not experimental. No Gotenberg / localhost.
 */

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { convertContractDocxToPdf } from '@/features/documents/pdf/contractPdfAdapter'
import {
  ContractPdfError,
  mapContractPdfErrorForUser,
} from '@/features/documents/pdf/docxToPdf/errors'
import { downloadPdfBytes } from '@/features/wedding-brief/convertWeddingBriefHtmlToPdf'
import styles from './ContractPdfActions.module.css'

function pdfFileNameFromDocx(fileName: string): string {
  const base = fileName.replace(/\.docx$/i, '') || 'umowa'
  return `${base}.pdf`
}

export function ContractPdfActions(props: {
  /** Exact final DOCX for this artifact (already generated). */
  docxBytes: ArrayBuffer | null | undefined
  fileName: string
  weddingId?: string
  documentId?: string
  /** Compact = header row button only. */
  compact?: boolean
}) {
  const { requirePro } = useProAccessGate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  async function downloadPdf() {
    // Double-click / StrictMode: one in-flight conversion max.
    if (inFlightRef.current || busy) return
    if (!props.docxBytes) {
      setError(
        'Brak pliku DOCX do konwersji. Najpierw wygeneruj lub pobierz dokument.',
      )
      return
    }

    const allowed = requirePro(undefined, {
      variant: 'pro_required_action',
      actionKey: 'generate_contract_pdf',
    })
    if (!allowed) return

    inFlightRef.current = true
    setBusy(true)
    setError(null)
    try {
      const pdfBytes = await convertContractDocxToPdf({
        docxBytes: props.docxBytes,
        filename: props.fileName.endsWith('.docx')
          ? props.fileName
          : `${props.fileName}.docx`,
        weddingId: props.weddingId,
        documentId: props.documentId,
      })
      downloadPdfBytes(pdfBytes, pdfFileNameFromDocx(props.fileName))
    } catch (e) {
      if (e instanceof ContractPdfError) {
        setError(mapContractPdfErrorForUser(e.code))
      } else {
        const raw = e instanceof Error ? e.message : ''
        setError(mapContractPdfErrorForUser(raw))
      }
    } finally {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  return (
    <div
      className={props.compact ? styles.compact : styles.wrap}
      data-testid="contract-pdf-actions"
    >
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !props.docxBytes}
        data-testid="contract-pdf-download-button"
        onClick={() => void downloadPdf()}
      >
        {busy ? 'Przygotowywanie PDF…' : 'Pobierz PDF'}
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
