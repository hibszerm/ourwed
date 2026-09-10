import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils/dates'
import type { WeddingImportResult, WeddingImportReviewRow } from '../types'
import {
  failedImportRecordsHeadline,
  humanizeImportWriteError,
  importedResultHeadline,
  polishPlural,
} from '../importPresentation'
import styles from './importWorkspace.module.css'

type ImportResultStepProps = {
  result: WeddingImportResult
  rows: WeddingImportReviewRow[]
  onRetryFailures: () => void
  onImportAnother: () => void
  retrying: boolean
}

export function ImportResultStep({
  result,
  rows,
  onRetryFailures,
  onImportAnother,
  retrying,
}: ImportResultStepProps) {
  const navigate = useNavigate()
  const failed = result.records.filter((record) => record.status === 'failed')
  const byId = new Map(rows.map((row) => [row.id, row]))

  return (
    <section className={styles.stack} aria-labelledby="import-result-heading">
      <div>
        <h2 id="import-result-heading" className={styles.heading}>
          Import zakończony
        </h2>
        <p className={styles.lead}>
          {importedResultHeadline(result.importedCount, result.requestedCount)}
        </p>
      </div>

      <p className={styles.resultCounts}>
        <span>
          {result.importedCount} zaimportowano
        </span>
        <span>
          {result.skippedCount} pominięto
        </span>
        <span data-tone={result.failedCount > 0 ? 'error' : undefined}>
          {result.failedCount}{' '}
          {polishPlural(result.failedCount, 'błąd', 'błędy', 'błędów')}
        </span>
      </p>

      {result.importedCount > 0 ? (
        <p className={styles.resultNextStep}>
          Po imporcie możesz uzupełnić brakujące dane bezpośrednio na karcie
          zlecenia.
        </p>
      ) : null}

      {failed.length > 0 ? (
        <div className={styles.failedList}>
          <p className={styles.failedHeadline}>
            {failedImportRecordsHeadline(failed.length)}
          </p>
          {failed.map((record) => {
            const row = byId.get(record.reviewRowId)
            return (
              <div key={record.reviewRowId} className={styles.failedItem}>
                <div className={styles.couple}>
                  {row?.coupleDisplayName || `Wiersz ${record.sourceRowNumber}`}
                </div>
                <div className={styles.muted}>
                  {row?.weddingDate ? formatDate(row.weddingDate) : null}
                </div>
                <p className={styles.issue}>{humanizeImportWriteError(record.message)}</p>
              </div>
            )
          })}
          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              disabled={retrying}
              onClick={onRetryFailures}
            >
              {retrying ? 'Ponawianie…' : `Spróbuj ponownie (${failed.length})`}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={`${styles.actions} ${styles.resultActions}`}>
        <Button type="button" variant="primary" onClick={() => navigate('/sluby')}>
          Przejdź do ślubów
        </Button>
        <Button type="button" variant="secondary" onClick={onImportAnother}>
          Importuj kolejny plik
        </Button>
      </div>
    </section>
  )
}
