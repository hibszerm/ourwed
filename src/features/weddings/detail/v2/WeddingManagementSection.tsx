import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { WeddingBriefDownloadButton } from '@/features/wedding-brief/WeddingBriefDownloadButton'
import { WeddingDangerZone } from '@/features/weddings/components/detail/WeddingDangerZone'
import styles from './WeddingDetailV2.module.css'

interface Props {
  weddingId: string
  onEditWedding: () => void
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}

/**
 * Bottom Overview management — edit wedding + collapsed archive/delete.
 */
export function WeddingManagementSection({
  weddingId,
  onEditWedding,
  onArchive,
  onDelete,
}: Props) {
  const [dangerOpen, setDangerOpen] = useState(false)

  return (
    <section
      className={styles.management}
      data-testid="wedding-management"
      aria-labelledby="wedding-management-title"
    >
      <h2 id="wedding-management-title" className={styles.sectionHeading}>
        Zarządzanie zleceniem
      </h2>
      <div className={styles.managementActions}>
        <WeddingBriefDownloadButton weddingId={weddingId} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="wedding-edit-from-management"
          onClick={onEditWedding}
        >
          Edytuj dane ślubu
        </Button>
      </div>
      <button
        type="button"
        className={styles.managementToggle}
        aria-expanded={dangerOpen}
        onClick={() => setDangerOpen((v) => !v)}
      >
        Archiwizacja i usuwanie
        <span aria-hidden>{dangerOpen ? '−' : '+'}</span>
      </button>
      {dangerOpen ? (
        <div className={styles.managementBody}>
          <WeddingDangerZone onArchive={onArchive} onDelete={onDelete} />
        </div>
      ) : null}
    </section>
  )
}
