import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import styles from './AuthForms.module.css'

export function CheckEmailPanel({ email }: { email?: string }) {
  const navigate = useNavigate()

  return (
    <div className={styles.successPanel}>
      <div className={styles.successIcon} aria-hidden>
        ✓
      </div>
      <h2 className={styles.successTitle}>Sprawdź swoją skrzynkę e-mail.</h2>
      <p className={styles.successBody}>
        Kliknij link aktywacyjny, aby aktywować konto.
        {email ? (
          <>
            <br />
            Wiadomość została wysłana na <strong>{email}</strong>.
          </>
        ) : null}
      </p>
      <Button
        type="button"
        variant="primary"
        className={styles.submit}
        onClick={() => navigate('/login')}
      >
        Wróć do logowania
      </Button>
    </div>
  )
}
