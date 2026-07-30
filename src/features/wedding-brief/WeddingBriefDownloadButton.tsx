import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { convertWeddingBriefHtmlToPdf, downloadPdfBytes } from '@/features/wedding-brief/convertWeddingBriefHtmlToPdf'
import { loadWeddingBriefPdfData } from '@/features/wedding-brief/loadWeddingBriefPdfData'
import { renderWeddingBriefFooterHtml } from '@/features/wedding-brief/renderWeddingBriefFooterHtml'
import {
  buildWeddingBriefFilename,
  renderWeddingBriefHtml,
} from '@/features/wedding-brief/renderWeddingBriefHtml'
import styles from '@/features/weddings/detail/v2/WeddingDetailV2.module.css'

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
      const data = await loadWeddingBriefPdfData(weddingId)
      const html = renderWeddingBriefHtml(data)
      const footerHtml = renderWeddingBriefFooterHtml(data)
      const filename = buildWeddingBriefFilename(data)
      const pdf = await convertWeddingBriefHtmlToPdf({
        html,
        filename,
        footerHtml,
      })
      downloadPdfBytes(pdf, filename)
    } catch (e) {
      const raw = e instanceof Error ? e.message : ''
      setError(
        !raw || /failed to fetch|networkerror|load failed/i.test(raw)
          ? 'Nie udało się przygotować briefu PDF.'
          : raw,
      )
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
