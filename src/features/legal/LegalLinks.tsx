import { Link } from 'react-router-dom'
import { LEGAL_ROUTES } from '@/features/legal/legalMeta'
import type { PublicQuestionnaireController } from '@/features/legal/publicQuestionnaireController'
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
export function PublicFormPrivacyNotice({
  controller = null,
}: {
  controller?: PublicQuestionnaireController | null
} = {}) {
  const name = controller?.displayName?.trim() || null
  const email = controller?.contactEmail?.trim() || null

  return (
    <div className={styles.publicNotice} data-public-form-privacy="">
      <p className={styles.publicNoticeLabel}>Informacja o przetwarzaniu danych</p>
      {name ? (
        <p className={styles.publicNoticeBody}>
          Administratorem danych podanych w tej ankiecie jest {name}. Dane są
          przetwarzane w związku z obsługą i realizacją zlecenia. OurWed jest
          narzędziem wykorzystywanym przez administratora do obsługi zlecenia i
          przetwarza dane na jego polecenie.
          {email ? (
            <>
              {' '}
              Kontakt z administratorem: {email}.
            </>
          ) : null}
        </p>
      ) : (
        <p className={styles.publicNoticeBody}>
          Dane podane w formularzu są przetwarzane przez studio, które
          udostępniło Ci ten formularz, w związku z obsługą i realizacją
          zlecenia. OurWed jest narzędziem wykorzystywanym przez to studio i
          przetwarza dane na jego polecenie.
        </p>
      )}

      <details className={styles.publicNoticeDetails}>
        <summary>Więcej informacji</summary>
        <div className={styles.publicNoticeDetailsBody}>
          <p>
            Podanie danych w ankiecie jest potrzebne, aby studio mogło obsłużyć
            zlecenie / przygotowanie usługi na podstawie odpowiedzi.
          </p>
          <p>
            Odbiorcami danych mogą być dostawcy techniczni platformy OurWed w
            zakresie niezbędnym do działania usługi (np. hosting, poczta
            transakcyjna), wyłącznie na polecenie administratora lub w ramach
            infrastruktury OurWed.
          </p>
          <p>
            Okres przechowywania ustala administrator (studio) — zwykle przez
            czas obsługi zlecenia oraz przez okres wynikający z roszczeń,
            rozliczeń lub obowiązków prawnych.
          </p>
          <p>
            Przysługują Ci prawa dostępu, sprostowania, usunięcia, ograniczenia
            przetwarzania, przenoszenia danych oraz sprzeciwu — w zakresie
            przewidzianym RODO. Żądania dotyczące danych klientów studia
            należy kierować w pierwszej kolejności do administratora
            (studia)
            {email ? ` (${email})` : ''}.
          </p>
          <p>
            Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych
            (PUODO).
          </p>
          <p>
            Informacje o roli OurWed jako platformy:{' '}
            <Link to={LEGAL_ROUTES.privacy} className={styles.inlineLink}>
              Polityka prywatności OurWed
            </Link>
            .
          </p>
        </div>
      </details>
    </div>
  )
}
