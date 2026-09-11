import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  useContractPdfDownload,
  type ContractPdfDownloadInput,
} from './useContractPdfDownload'
import styles from './ContractPdfActions.module.css'

export function ContractPdfActions(props: ContractPdfDownloadInput & {
  /** Compact = header row button only. */
  compact?: boolean
  /** Leading Download icon for Modern action rows. */
  withIcon?: boolean
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
        {props.withIcon ? (
          <Download size={16} strokeWidth={1.75} aria-hidden />
        ) : null}
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
