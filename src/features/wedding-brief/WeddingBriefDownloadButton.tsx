import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { downloadWeddingBriefPdf } from '@/features/wedding-brief/downloadWeddingBriefPdf'
import { mapPdfRenderErrorForUser } from '@/features/documents/pdf/pdfRenderErrors'
import styles from '@/features/weddings/detail/v2/WeddingDetailV2.module.css'
import { getUserFacingErrorMessage } from '@/lib/errors/userFacingError'

type Props = {
  weddingId: string
  compact?: boolean
}

/**
 * Wedding Details action — generate offline Wedding Brief PDF.
 */
export function WeddingBriefDownloadButton({ weddingId, compact }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await downloadWeddingBriefPdf(weddingId)
    } catch (e) {
      const raw = getUserFacingErrorMessage(e, '')
      setError(mapPdfRenderErrorForUser(raw))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={compact ? undefined : styles.briefCard}
      data-testid="wedding-brief-download"
    >
      {!compact ? (
        <>
          <h3 className={styles.briefCardTitle}>Brief zlecenia</h3>
          <p className={styles.briefCardCopy}>
            Pobierz najważniejsze informacje na telefon przed wyjazdem.
          </p>
        </>
      ) : null}
      <Button
        type="button"
        variant={compact ? 'secondary' : 'primary'}
        size="sm"
        disabled={busy}
        data-testid="wedding-brief-download-button"
        onClick={() => void handleClick()}
      >
        {busy ? 'Przygotowywanie briefu…' : 'Pobierz brief PDF'}
      </Button>
      {error ? (
        <div className={styles.briefError} role="alert">
          <p>{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="wedding-brief-retry"
            onClick={() => void handleClick()}
          >
            Spróbuj ponownie
          </Button>
        </div>
      ) : null}
    </div>
  )
}
