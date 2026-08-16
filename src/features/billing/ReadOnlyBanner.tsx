import { Link } from 'react-router-dom'
import { ProLockIcon } from '@/features/billing/ProLockIcon'
import styles from './ReadOnlyBanner.module.css'

type Props = {
  visible: boolean
  onHide?: () => void
}

export function ReadOnlyBanner({ visible, onHide }: Props) {
  if (!visible) return null
  return (
    <div className={styles.banner} data-testid="readonly-banner" role="status">
      <div className={styles.main}>
        <ProLockIcon className={styles.lock} />
        <div className={styles.copy}>
          <p className={styles.heading}>Tryb tylko do odczytu</p>
          <p className={styles.body}>
            Twój okres próbny PRO dobiegł końca. Nadal możesz przeglądać wszystkie swoje
            dane.
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Link to="/ustawienia/subskrypcja" className={styles.cta}>
          Zobacz plany
        </Link>
        {onHide ? (
          <button
            type="button"
            className={styles.hide}
            onClick={onHide}
            data-testid="readonly-banner-hide"
          >
            Ukryj
          </button>
        ) : null}
      </div>
    </div>
  )
}
