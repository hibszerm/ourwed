import { useEffect, useId, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import { IconClose, IconMenu } from '@/components/icons'
import { Drawer } from '@/components/ui/Drawer'
import { ContractAiStory } from '@/features/landing/ContractAiStory'
import {
  DocumentsVignette,
  InquiryVignette,
  JourneyChapter,
  OpsVignette,
  PackageVignette,
  PaymentsVignette,
  QuestionnaireVignette,
  TasksVignette,
  TimelineVignette,
  WeddingsVignette,
} from '@/features/landing/JourneyChapter'
import {
  LandingAuthDialog,
  type AuthDialogView,
} from '@/features/landing/LandingAuthDialog'
import { LivingHero } from '@/features/landing/LivingHero'
import { clearLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'
import styles from './LandingPage.module.css'

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authView, setAuthView] = useState<AuthDialogView>('login')
  const [authEmail, setAuthEmail] = useState('')
  const menuId = useId()

  useEffect(() => {
    clearLogoutRedirectToLanding()
  }, [])

  function openAuth(view: AuthDialogView) {
    setMenuOpen(false)
    setAuthView(view)
    setAuthEmail('')
    setAuthOpen(true)
  }

  function changeAuthView(view: AuthDialogView, email?: string) {
    setAuthView(view)
    if (email) setAuthEmail(email)
  }

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <a
            href="#"
            className={styles.logo}
            onClick={(e) => {
              e.preventDefault()
              setMenuOpen(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <span className={styles.logoMark} aria-hidden>
              OW
            </span>
            <span className={styles.logoText}>OurWed</span>
          </a>

          <nav className={styles.navLinks} aria-label="Nawigacja">
            <a href="#journey">Jak działa</a>
            <button
              type="button"
              className={styles.navGhost}
              onClick={() => openAuth('login')}
            >
              Zaloguj się
            </button>
            <button
              type="button"
              className={styles.navCta}
              onClick={() => openAuth('register')}
            >
              Wypróbuj
            </button>
          </nav>

          <div className={styles.navMobile}>
            <button
              type="button"
              className={styles.navCta}
              onClick={() => openAuth('register')}
            >
              Wypróbuj
            </button>
            <button
              type="button"
              className={styles.menuBtn}
              aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? (
                <IconClose width={20} height={20} />
              ) : (
                <IconMenu width={20} height={20} />
              )}
            </button>
          </div>
        </div>
      </header>

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
        aria-label="Menu mobilne"
      >
        <nav className={styles.drawerNav} id={menuId}>
          <a href="#journey" onClick={() => setMenuOpen(false)}>
            Jak działa
          </a>
          <button type="button" onClick={() => openAuth('login')}>
            Zaloguj się
          </button>
          <button
            type="button"
            className={styles.drawerCta}
            onClick={() => openAuth('register')}
          >
            Wypróbuj OurWed
          </button>
        </nav>
      </Drawer>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Dla branży ślubnej</p>
            <h1 className={styles.heroTitle}>
              Od pierwszego zapytania
              <br />
              do zakończenia projektu.
            </h1>
            <p className={styles.heroSub}>
              OurWed prowadzi cały workflow firmy z branży ślubnej — od
              pierwszego kontaktu z klientem aż do zakończenia realizacji.
            </p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => openAuth('register')}
              >
                Wypróbuj OurWed
              </button>
              <a href="#journey" className={styles.secondary}>
                Zobacz jak działa
              </a>
            </div>
            <LivingHero />
          </div>
        </section>

        <p className={styles.bridge}>Każdy rozdział to kolejny etap.</p>

        <div id="journey">
          <JourneyChapter
            id="inquiry"
            eyebrow="01 · Zapytanie"
            title="Zapytanie staje się projektem"
            subtitle="Przyjmij klienta. Od razu pojawia się w Twoim workflow."
          >
            <InquiryVignette />
          </JourneyChapter>

          <JourneyChapter
            id="weddings"
            eyebrow="02 · Projekty"
            title="Wszystkie rezerwacje w jednym miejscu"
            subtitle="Statusy, terminy i klienci — bez arkuszy i rozproszonych wiadomości."
            tone="emphasis"
          >
            <WeddingsVignette />
          </JourneyChapter>

          <div className={styles.aiChapter}>
            <ContractAiStory />
          </div>

          <JourneyChapter
            id="questionnaires"
            eyebrow="04 · Formularze"
            title="Klienci uzupełniają dane sami"
            subtitle="Jeden link. Odpowiedzi wracają prosto do projektu."
          >
            <QuestionnaireVignette />
          </JourneyChapter>

          <JourneyChapter
            id="packages"
            eyebrow="05 · Oferta"
            title="Pakiety, które skalują się z biznesem"
            subtitle="Zdefiniuj ofertę raz. Każdy projekt dziedziczy zakres i cenę."
            tone="emphasis"
          >
            <PackageVignette />
          </JourneyChapter>

          <JourneyChapter
            id="timeline"
            eyebrow="06 · Harmonogram"
            title="Dzień wydarzenia na osi czasu"
            subtitle="Kluczowe momenty — zawsze pod ręką."
          >
            <TimelineVignette />
          </JourneyChapter>

          <JourneyChapter
            id="ops"
            eyebrow="07 · Przygotowanie"
            title="Gotowość przed dniem ślubu"
            subtitle="Checklisty i lokalizacje — nic nie umyka."
            tone="emphasis"
          >
            <OpsVignette />
          </JourneyChapter>

          <JourneyChapter
            id="payments"
            eyebrow="08 · Finanse"
            title="Płatności pod kontrolą"
            subtitle="Zaliczki, raty i przychód — w jednym widoku."
          >
            <PaymentsVignette />
          </JourneyChapter>

          <JourneyChapter
            id="tasks"
            eyebrow="09 · Realizacja"
            title="Aż do finalnej dostawy"
            subtitle="Zadania i kamienie milowe, które zamykają każdy projekt."
            tone="emphasis"
          >
            <TasksVignette />
          </JourneyChapter>

          <JourneyChapter
            id="documents"
            eyebrow="10 · Dokumenty"
            title="Kolejna umowa bez przepisywania"
            subtitle="Ten sam szablon. Nowe dane klienta."
          >
            <DocumentsVignette />
          </JourneyChapter>
        </div>

        <section className={styles.finale}>
          <div className={styles.finaleInner}>
            <h2 className={styles.finaleTitle}>
              Jedna platforma
              <br />
              na cały workflow firmy ślubnej.
            </h2>
            <p className={styles.finaleSub}>
              Od pierwszego zapytania do zakończenia projektu.
            </p>
            <button
              type="button"
              className={styles.primary}
              onClick={() => openAuth('register')}
            >
              Wypróbuj OurWed
            </button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.logoText}>OurWed</span>
          <p>Platforma dla branży ślubnej.</p>
          <div className={styles.footerLinks}>
            <a href="mailto:kontakt@ourwed.pl">Kontakt</a>
            <a href="#privacy">Prywatność</a>
            <a href="#terms">Regulamin</a>
          </div>
          <p className={styles.copy}>
            © {new Date().getFullYear()} OurWed
          </p>
        </div>
        <div id="privacy" className={styles.legal}>
          Polityka prywatności — dokument w przygotowaniu.
        </div>
        <div id="terms" className={styles.legal}>
          Regulamin — dokument w przygotowaniu.
        </div>
      </footer>

      <LandingAuthDialog
        open={authOpen}
        view={authView}
        emailHint={authEmail}
        onClose={() => setAuthOpen(false)}
        onChangeView={changeAuthView}
      />
    </div>
  )
}
