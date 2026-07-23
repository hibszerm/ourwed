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
            <p className={styles.eyebrow}>Platforma dla studia ślubnego</p>
            <h1 className={styles.heroTitle}>
              Od pierwszego zapytania
              <br />
              do oddania galerii.
            </h1>
            <p className={styles.heroSub}>
              OurWed prowadzi cały proces studia — zgłoszenia, śluby, umowy,
              ankiety, płatności i zadania — w jednym spokojnym workflow.
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
                Zobacz przebieg sezonu
              </a>
            </div>
            <LivingHero />
          </div>
        </section>

        <p className={styles.bridge}>
          Przewiń — każdy rozdział odsłania kolejną część OurWed.
        </p>

        <div id="journey">
          <JourneyChapter
            id="inquiry"
            eyebrow="01 · Zgłoszenie"
            title="Nowe zapytanie staje się ślubem"
            subtitle="Przyjmij lead jednym kliknięciem. Para od razu ląduje w CRM z datą, pakietem i workflow."
          >
            <InquiryVignette />
          </JourneyChapter>

          <JourneyChapter
            id="weddings"
            eyebrow="02 · CRM"
            title="Sezon w jednym widoku"
            subtitle="Karty ślubów, statusy i terminy — bez tabel w Excelu i wątków w mailu."
            tone="emphasis"
          >
            <WeddingsVignette />
          </JourneyChapter>

          <div className={styles.aiChapter}>
            <ContractAiStory />
          </div>

          <JourneyChapter
            id="questionnaires"
            eyebrow="04 · Ankiety"
            title="Para uzupełnia dane sama"
            subtitle="Publiczny link zamiast mailowego ping-ponga. Odpowiedzi wracają prosto do karty ślubu."
          >
            <QuestionnaireVignette />
          </JourneyChapter>

          <JourneyChapter
            id="packages"
            eyebrow="05 · Oferta"
            title="Pakiety studia, nie luźne cenniki"
            subtitle="Zdefiniuj ofertę raz. Każdy ślub dziedziczy zakres, cenę i elementy do oddania."
            tone="emphasis"
          >
            <PackageVignette />
          </JourneyChapter>

          <JourneyChapter
            id="timeline"
            eyebrow="06 · Harmonogram"
            title="Dzień ślubu na osi czasu"
            subtitle="Przygotowania, ceremonia, sesja, wesele — minuta po minucie, zawsze pod ręką."
          >
            <TimelineVignette />
          </JourneyChapter>

          <JourneyChapter
            id="ops"
            eyebrow="07 · Operacje"
            title="Sprzęt i trasa przed wyjazdem"
            subtitle="Checklist sprzętu i kolejność lokalizacji — żeby w dniu ślubu nic nie umknęło."
            tone="emphasis"
          >
            <OpsVignette />
          </JourneyChapter>

          <JourneyChapter
            id="payments"
            eyebrow="08 · Finanse"
            title="Zaliczki, raty i sezon"
            subtitle="Wiesz, kto ile wpłacił — i jak wygląda przychód całego sezonu."
          >
            <PaymentsVignette />
          </JourneyChapter>

          <JourneyChapter
            id="tasks"
            eyebrow="09 · Realizacja"
            title="Zadania aż do oddania"
            subtitle="Teaser, galeria, przypomnienia — checklista, która zamyka każdy ślub."
            tone="emphasis"
          >
            <TasksVignette />
          </JourneyChapter>

          <JourneyChapter
            id="documents"
            eyebrow="10 · Dokumenty"
            title="Kolejna umowa bez przepisywania"
            subtitle="Ten sam szablon, nowe dane pary. Generujesz dokument — nie piszesz go od zera."
          >
            <DocumentsVignette />
          </JourneyChapter>
        </div>

        <section className={styles.finale}>
          <div className={styles.finaleInner}>
            <h2 className={styles.finaleTitle}>
              Jedna platforma
              <br />
              na cały workflow studia.
            </h2>
            <p className={styles.finaleSub}>
              Załóż konto i prowadź sezon w OurWed — od zapytania do oddania.
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
          <p>Platforma dla studia ślubnego.</p>
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
