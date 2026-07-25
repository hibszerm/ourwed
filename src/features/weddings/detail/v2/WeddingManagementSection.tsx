import { useState } from 'react'
import { WeddingDangerZone } from '@/features/weddings/components/detail/WeddingDangerZone'
import styles from './WeddingDetailV2.module.css'

interface Props {
  onArchive: () => Promise<void>
  onDelete: () => Promise<void>
}

export function WeddingManagementSection({ onArchive, onDelete }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <section
      className={styles.management}
      data-testid="wedding-management"
    >
      <button
        type="button"
        className={styles.managementToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Zarządzanie zleceniem
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className={styles.managementBody}>
          <WeddingDangerZone onArchive={onArchive} onDelete={onDelete} />
        </div>
      ) : null}
    </section>
  )
}
