import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { RegisterForm } from '@/features/auth/components/RegisterForm'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'
import { IconClose } from '@/components/icons'
import styles from './LandingAuthDialog.module.css'

export type AuthDialogView =
  | 'login'
  | 'register'
  | 'forgot'
  | 'forgot-sent'
  | 'check-email'

interface LandingAuthDialogProps {
  open: boolean
  view: AuthDialogView
  emailHint?: string
  onClose: () => void
  onChangeView: (view: AuthDialogView, email?: string) => void
}

const TITLES: Record<AuthDialogView, string> = {
  login: 'Zaloguj się',
  register: 'Utwórz konto',
  forgot: 'Reset hasła',
  'forgot-sent': 'Sprawdź skrzynkę',
  'check-email': 'Potwierdź e-mail',
}

export function LandingAuthDialog({
  open,
  view,
  emailHint = '',
  onClose,
  onChangeView,
}: LandingAuthDialogProps) {
  const navigate = useNavigate()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, view])

  if (!open) return null

  return createPortal(
    <div className={styles.root} role="presentation">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.handle} aria-hidden />
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {TITLES[view]}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Zamknij"
            onClick={onClose}
          >
            <IconClose width={18} height={18} />
          </button>
        </header>

        <div className={styles.body}>
          {view === 'login' ? (
            <>
              <LoginForm
                onSuccess={() => {
                  onClose()
                  navigate('/dashboard', { replace: true })
                }}
                onForgotPassword={() => onChangeView('forgot')}
              />
              <p className={styles.switch}>
                Nie masz konta?{' '}
                <button type="button" onClick={() => onChangeView('register')}>
                  Zarejestruj się
                </button>
              </p>
            </>
          ) : null}

          {view === 'register' ? (
            <>
              <RegisterForm
                onRegistered={(email) => onChangeView('check-email', email)}
              />
              <p className={styles.switch}>
                Masz już konto?{' '}
                <button type="button" onClick={() => onChangeView('login')}>
                  Zaloguj się
                </button>
              </p>
            </>
          ) : null}

          {view === 'forgot' ? (
            <>
              <p className={styles.lead}>
                Podaj adres e-mail — wyślemy link do resetu hasła.
              </p>
              <ForgotPasswordForm
                onSent={(email) => onChangeView('forgot-sent', email)}
              />
              <p className={styles.switch}>
                <button type="button" onClick={() => onChangeView('login')}>
                  Wróć do logowania
                </button>
              </p>
            </>
          ) : null}

          {view === 'forgot-sent' ? (
            <div className={styles.message}>
              <p>
                Jeśli konto istnieje, wysłaliśmy instrukcję na{' '}
                <strong>{emailHint || 'podany adres'}</strong>.
              </p>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onChangeView('login')}
              >
                Wróć do logowania
              </button>
            </div>
          ) : null}

          {view === 'check-email' ? (
            <div className={styles.message}>
              <p>
                Konto utworzone. Potwierdź adres e-mail
                {emailHint ? (
                  <>
                    {' '}
                    (<strong>{emailHint}</strong>)
                  </>
                ) : null}
                , a potem zaloguj się.
              </p>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={() => onChangeView('login')}
              >
                Przejdź do logowania
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
