import styles from './AuthForms.module.css'

export function CheckEmailPanel({ email }: { email?: string }) {
  return (
    <div className={styles.successPanel}>
      <div className={styles.successIcon} aria-hidden>
        ✓
      </div>
      <p className={styles.successBody}>
        Kliknij link aktywacyjny w wiadomości, aby aktywować konto.
        {email ? (
          <>
            <br />
            Wiadomość została wysłana na <strong>{email}</strong>.
          </>
        ) : null}
      </p>
    </div>
  )
}
