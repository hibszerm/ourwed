/**
 * Production contract ready screen: DOCX preview + Cloudmersive PDF download.
 * PDF converts the exact final generated DOCX (no HTML rewrite).
 */

import { useState } from 'react'
import { Download, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { FriendlyQualitySummary } from '@/features/documents/template/payment-schedule'
import { ContractDocxPreview } from './ContractDocxPreview'
import { ContractPdfActions } from './ContractPdfActions'
import styles from './ContractReadyPreview.module.css'

const PREVIEW_FIDELITY_NOTE =
  'Podgląd może nieznacznie różnić się od wyglądu dokumentu otwartego w Wordzie. Pobrany DOCX zachowuje oryginalną strukturę i formatowanie szablonu.'

export function ContractReadyPreview(props: {
  fileName: string
  /** Exact final DOCX artifact. */
  docxBytes: ArrayBuffer | null
  onDownloadDocx?: () => void
  onRegenerate?: () => void
  onEditPaymentSchedule?: () => void
  qualitySummary?: FriendlyQualitySummary | null
  runId?: string
  weddingId?: string
  documentId?: string
  /**
   * `full` — identity + actions (generation saved step).
   * `document` — note + preview only; parent page owns chrome/actions.
   */
  chrome?: 'full' | 'document'
}) {
  const [docxRetryKey, setDocxRetryKey] = useState(0)
  const chrome = props.chrome ?? 'full'

  return (
    <section
      className={styles.wrap}
      data-chrome={chrome}
      data-testid="contract-ready-preview"
    >
      {chrome === 'full' ? (
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Podgląd dokumentu</p>
            <h2>Umowa jest gotowa</h2>
            <p className={styles.fileName}>{props.fileName}</p>
          </div>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              onClick={props.onDownloadDocx}
            >
              <Download size={16} strokeWidth={1.75} aria-hidden />
              Pobierz DOCX
            </Button>
            <ContractPdfActions
              compact
              withIcon
              docxBytes={props.docxBytes}
              fileName={props.fileName}
              weddingId={props.weddingId}
              documentId={props.documentId}
            />
            {props.onEditPaymentSchedule ? (
              <Button
                type="button"
                variant="ghost"
                onClick={props.onEditPaymentSchedule}
              >
                Edytuj harmonogram płatności
              </Button>
            ) : null}
            {props.onRegenerate ? (
              <Button
                type="button"
                variant="ghost"
                onClick={props.onRegenerate}
              >
                <RefreshCw size={15} strokeWidth={1.75} aria-hidden />
                Wygeneruj ponownie
              </Button>
            ) : null}
          </div>
        </header>
      ) : null}

      <p className={styles.note}>
        <Info
          className={styles.noteIcon}
          size={15}
          strokeWidth={1.75}
          aria-hidden
        />
        <span>{PREVIEW_FIDELITY_NOTE}</span>
      </p>

      {props.qualitySummary ? (
        <details className={styles.quality}>
          <summary>Sprawdzone automatycznie</summary>
          <ul>
            {props.qualitySummary.rows.map((row) => (
              <li key={row.id}>
                <span>{row.label}</span>
                <strong>
                  {row.status === 'ok'
                    ? 'Poprawne'
                    : row.status === 'manual'
                      ? 'Uzupełniono ręcznie'
                      : 'Wymaga uwagi'}
                </strong>
                {row.detail ? <p>{row.detail}</p> : null}
              </li>
            ))}
          </ul>
          {props.qualitySummary.paymentScheduleManual ? (
            <div className={styles.scheduleDetail}>
              <p>Harmonogram płatności — uzupełniono ręcznie</p>
              <ul>
                {props.qualitySummary.paymentScheduleManual.entries.map((e) => (
                  <li key={e.label}>
                    {e.label}: {e.amountFormatted}
                  </li>
                ))}
                <li>
                  Razem:{' '}
                  {props.qualitySummary.paymentScheduleManual.totalFormatted}
                </li>
              </ul>
            </div>
          ) : null}
        </details>
      ) : null}

      <ContractDocxPreview
        key={docxRetryKey}
        source={props.docxBytes}
        onRetry={() => setDocxRetryKey((n) => n + 1)}
      />
    </section>
  )
}
