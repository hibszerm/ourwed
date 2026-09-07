import { Link } from 'react-router-dom'
import { LEGAL_ROUTES } from '@/features/legal/legalMeta'
import styles from './LegalLinks.module.css'

/** Compact legal nav for settings / footers. */
export function LegalLinksNav({ className }: { className?: string }) {
  return (
    <nav
      className={`${styles.nav} ${className ?? ''}`.trim()}
      aria-label="Dokumenty prawne OurWed"
      data-legal-links=""
    >
      <Link to={LEGAL_ROUTES.terms}>Regulamin</Link>
      <Link to={LEGAL_ROUTES.privacy}>Polityka prywatności</Link>
      <Link to={LEGAL_ROUTES.dpa}>Powierzenie danych</Link>
    </nav>
  )
}

export function AuthLegalLoginCopy() {
  return (
    <>
      Logując się, akceptujesz nasz{' '}
      <Link to={LEGAL_ROUTES.terms} className={styles.inlineLink}>
        Regulamin
      </Link>
      <br />i{' '}
      <Link to={LEGAL_ROUTES.privacy} className={styles.inlineLink}>
        Politykę prywatności
      </Link>
      .
    </>
  )
}

export function AuthLegalRegisterCopy() {
  return (
    <>
      Tworząc konto, akceptujesz nasz{' '}
      <Link to={LEGAL_ROUTES.terms} className={styles.inlineLink}>
        Regulamin
      </Link>
      <br />i{' '}
      <Link to={LEGAL_ROUTES.privacy} className={styles.inlineLink}>
        Politykę prywatności
      </Link>
      .
    </>
  )
}

/** Quiet privacy note for public questionnaire submit areas. */
export function PublicFormPrivacyNotice() {
  return (
    <p className={styles.publicNotice} data-public-form-privacy="">
      Dane podane w formularzu są przetwarzane w związku z realizacją zlecenia
      przez studio, które udostępniło Ci ten formularz, z wykorzystaniem
      platformy OurWed.{' '}
      <Link to={LEGAL_ROUTES.privacy} className={styles.inlineLink}>
        Dowiedz się więcej o przetwarzaniu danych
      </Link>
      .
    </p>
  )
}
