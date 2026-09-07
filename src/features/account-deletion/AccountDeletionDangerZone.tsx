import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { AccountDeletionDialog } from '@/features/account-deletion/AccountDeletionDialog'
import styles from '@/features/account-deletion/AccountDeletionDangerZone.module.css'

export function AccountDeletionDangerZone() {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.zone} data-testid="account-deletion-danger-zone">
      <p className={styles.eyebrow}>Strefa niebezpieczna</p>
      <h3 className={styles.title}>Usuń konto</h3>
      <p className={styles.body}>
        Trwale usuń konto OurWed oraz dane zapisane w ramach konta. Tej operacji
        nie można cofnąć.
      </p>
      <p className={styles.hint}>
        Przed usunięciem pobierz dokumenty i materiały, które chcesz zachować.
        Usunięcie dotyczy danych konta w usłudze OurWed i nie obejmuje niezależnych
        kopii zapasowych infrastruktury ani obowiązków wynikających z przepisów.
      </p>
      <div className={styles.actions}>
        <Button
          type="button"
          variant="danger"
          size="md"
          onClick={() => setOpen(true)}
          data-testid="account-deletion-open"
        >
          Usuń konto
        </Button>
      </div>

      <AccountDeletionDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
