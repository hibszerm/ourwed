import { Button } from '@/components/ui/Button'
import { useWeddingBriefAction } from '@/features/wedding-brief/useWeddingBriefAction'
import styles from '@/features/weddings/detail/v2/WeddingDetailV2.module.css'

type Props = {
  weddingId: string
  compact?: boolean
}

/**
 * Shared Brief action — uses persisted PDF when current.
 * Not currently mounted on production pages; kept aligned so remounting
 * cannot restore pay-per-click generation.
 */
export function WeddingBriefDownloadButton({ weddingId, compact }: Props) {
  const brief = useWeddingBriefAction(weddingId)

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
        disabled={brief.busy}
        data-testid="wedding-brief-download-button"
        onClick={() => {
          if (brief.busy) return
          void brief.run()
        }}
      >
        {brief.label}
      </Button>
      {brief.error ? (
        <div className={styles.briefError} role="alert">
          <p>{brief.error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="wedding-brief-retry"
            onClick={() => void brief.run()}
          >
            Spróbuj ponownie
          </Button>
        </div>
      ) : null}
    </div>
  )
}
