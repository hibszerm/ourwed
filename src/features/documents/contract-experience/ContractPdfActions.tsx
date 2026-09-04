/**
 * Production contract PDF download: exact final DOCX → Cloudmersive via Edge.
 * Not experimental. No Gotenberg / localhost.
 */

import { Button } from '@/components/ui/Button'
import {
  useContractPdfDownload,
  type ContractPdfDownloadInput,
} from './useContractPdfDownload'
import styles from './ContractPdfActions.module.css'

export function ContractPdfActions(props: ContractPdfDownloadInput & {
  /** Compact = header row button only. */
  compact?: boolean
}) {
  const { downloadPdf, busy, error } = useContractPdfDownload(props)

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
