import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import { IconClose, IconMenu } from '@/components/icons'
import { Drawer } from '@/components/ui/Drawer'
import { AppTour } from '@/features/landing/AppTour'
import {
  LandingAuthDialog,
  type AuthDialogView,
} from '@/features/landing/LandingAuthDialog'
import { HeroProductPreview } from '@/features/landing/ProductPreview'
import { WorkflowTimeline } from '@/features/landing/WorkflowTimeline'
import { clearLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'
import styles from './LandingPage.module.css'

const FEATURES = [
  {
    id: 'travel',
    title: 'Inteligentne planowanie tras',
    body: 'Przystanki dnia ślubu, dystanse i czasy dojazdu — bez skakania między mapą a notatkami.',
    benefit: 'Mniej stresu w dniu ślubu',
    visual: 'travel' as const,
  },
  {
    id: 'questionnaires',
    title: 'Ankiety dla par',
    body: 'Umowy i szczegóły eventowe online. Para uzupełnia dane, Ty masz je w karcie ślubu.',
    benefit: 'Zero ciągłego dopytywania',
    visual: 'forms' as const,
  },
  {
    id: 'payments',
    title: 'Płatności i zaliczki',
    body: 'Wartość umowy, zaliczki i pozostałe kwoty przy każdym ślubie — zawsze aktualne.',
    benefit: 'Przejrzyste rozliczenia',
    visual: 'finance' as const,
  },
  {
    id: 'schedule',
    title: 'Harmonogram i kalendarz',
    body: 'Śluby, zadania i terminy w jednym widoku — nic nie wypada z grafiku.',
    benefit: 'Pełna kontrola nad sezonem',
    visual: 'timeline' as const,
  },
]

const WHY = [
  {
    title: 'Mniej administracji',
    body: 'Automatyzujesz zbieranie danych i statusy zamiast ogarniać wszystko w mailach.',
  },
  {
    title: 'Lepsza organizacja',
    body: 'Kalendarz, podróże, ankiety i finanse w jednej aplikacji.',
  },
  {
    title: 'Jedno miejsce na wszystko',
    body: 'Kontakt, umowa, lokalizacje i notatki są przy ślubie.',
  },
  {
    title: 'Nie zgubisz żadnego ślubu',
    body: 'Od zapytania do oddania materiału — pełny lifecycle pod kontrolą.',
  },
]

const FAQ = [
  {
    q: 'Czy OurWed działa na telefonie?',
    a: 'Tak. Studio i publiczne ankiety są zaprojektowane pod desktop i mobile.',
  },
  {
    q: 'Czy pary muszą zakładać konto?',
    a: 'Nie. Wypełniają ankiety przez bezpieczny link — bez rejestracji.',
  },
  {
    q: 'Ile kosztuje OurWed?',
    a: 'Cennik pojawi się wkrótce. Możesz już teraz założyć konto i zacząć pracę.',
  },
]

/** Scroll polish only — content is visible immediately (no blank flash). */
function useReveal<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      el.classList.add(styles.revealed)
      return
    }

    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.92) {
      el.classList.add(styles.revealed)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        el.classList.add(styles.revealed)
        observer.unobserve(el)
      },
      { threshold: 0.08, rootMargin: '0px 0px -2% 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <a href="#" className={styles.logo} onClick={(e) => {
      e.preventDefault()
      onClick?.()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }}>
      <span className={styles.logoMark} aria-hidden>
        OW
      </span>
      <span className={styles.logoText}>OurWed</span>
    </a>
  )
}

function RevealGroup({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} className={`${className} ${styles.revealGroup}`.trim()}>
      {children}
    </div>
  )
}

function FeatureVisual({ kind }: { kind: (typeof FEATURES)[number]['visual'] }) {
  if (kind === 'travel') {
    return (
      <div className={styles.featureMock} aria-hidden>
        <div className={styles.mockMap}>
          <span className={styles.mockPin} style={{ left: '22%', top: '40%' }}>
            1
          </span>
          <span className={styles.mockPin} style={{ left: '52%', top: '28%' }}>
            2
          </span>
          <span className={styles.mockPin} style={{ left: '74%', top: '62%' }}>
            3
          </span>
          <div className={styles.mockRoute} />
        </div>
        <div className={styles.mockLines}>
          <strong>Ceremonia → Przyjęcie</strong>
          <span>12 min · 7 km</span>
        </div>
      </div>
    )
  }

  if (kind === 'forms') {
    return (
      <div className={styles.featureMock} aria-hidden>
        <div className={styles.mockFormCard}>
          <em>Umowa · krok 2/4</em>
          <strong>Dane pary młodej</strong>
          <div className={styles.mockField}>
            <span>Imię pani młodej</span>
            <b>Anna</b>
          </div>
          <div className={styles.mockField}>
            <span>Data ślubu</span>
            <b>15.08.2026</b>
          </div>
          <div className={styles.mockProgress}>
            <i style={{ width: '68%' }} />
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'finance') {
    return (
      <div className={styles.featureMock} aria-hidden>
        <div className={styles.mockFinance}>
          <span>Wartość umowy</span>
          <strong>9 500 zł</strong>
          <div className={styles.mockFinanceRow}>
            <em>Zaliczka</em>
            <b>3 000 zł</b>
          </div>
          <div className={styles.mockFinanceRow}>
            <em>Pozostało</em>
            <b>6 500 zł</b>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.featureMock} aria-hidden>
      <div className={styles.mockTimelineList}>
        {[
          ['09:30', 'Przygotowania'],
          ['13:00', 'Ceremonia'],
          ['15:30', 'Sesja plenerowa'],
          ['17:00', 'Przyjęcie'],
        ].map(([time, label]) => (
          <div key={time} className={styles.mockTimelineRow}>
            <span>{time}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authView, setAuthView] = useState<AuthDialogView>('login')
  const [authEmail, setAuthEmail] = useState('')
  const menuId = useId()

  const tourIntroRef = useReveal<HTMLElement>()
  const featuresIntroRef = useReveal<HTMLElement>()
  const whyRef = useReveal<HTMLElement>()
  const faqRef = useReveal<HTMLElement>()

  useEffect(() => {
    clearLogoutRedirectToLanding()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = previous
    }
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
      <div className={styles.ambient} aria-hidden />

      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Logo onClick={() => setMenuOpen(false)} />

          <nav className={styles.navLinks} aria-label="Nawigacja główna">
            <a href="#tour" className={styles.navTextLink}>
              Produkt
            </a>
            <a href="#features" className={styles.navTextLink}>
              Funkcje
            </a>
            <a href="#why" className={styles.navTextLink}>
              Dlaczego OurWed
            </a>
            <span className={styles.navMuted} title="Wkrótce">
              Cennik
              <em>Wkrótce</em>
            </span>
            <button
              type="button"
              className={`${styles.navLogin} ${styles.navTextLink}`}
              onClick={() => openAuth('login')}
            >
              Zaloguj się
            </button>
            <button
              type="button"
              className={styles.navCta}
              onClick={() => openAuth('register')}
            >
              Rozpocznij za darmo
            </button>
          </nav>

          <div className={styles.navMobileActions}>
            <button
              type="button"
              className={styles.navCtaMobile}
              onClick={() => openAuth('register')}
            >
              Rozpocznij
            </button>
            <button
              type="button"
              className={styles.menuToggle}
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
          <a href="#features" onClick={() => setMenuOpen(false)}>
            Funkcje
          </a>
          <a href="#why" onClick={() => setMenuOpen(false)}>
            Dlaczego OurWed
          </a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>
            Cennik
          </a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>
            FAQ
          </a>
          <button type="button" onClick={() => openAuth('login')}>
            Zaloguj się
          </button>
          <button
            type="button"
            className={styles.drawerCta}
            onClick={() => openAuth('register')}
          >
            Rozpocznij za darmo
          </button>
        </nav>
      </Drawer>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.heroEyebrow}>CRM dla fotografów ślubnych</p>
              <h1 className={styles.heroTitle}>
                Prowadź całą firmę ślubną
                <br />
                w jednym miejscu.
              </h1>
              <p className={styles.heroSub}>
                OurWed łączy zapytania, umowy, ankiety, kalendarz, trasy i płatności —
                od pierwszego kontaktu aż do oddania materiału.
              </p>
              <div className={styles.heroActions}>
                <button
                  type="button"
                  className={styles.primaryLink}
                  onClick={() => openAuth('register')}
                >
                  Rozpocznij za darmo
                </button>
                <a href="#tour" className={styles.secondaryLink}>
                  Poznaj aplikację
                </a>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <HeroProductPreview />
            </div>
          </div>
        </section>

        <section id="tour" className={styles.tourSection}>
          <div className={styles.sectionInner}>
            <header
              ref={tourIntroRef}
              className={`${styles.sectionIntro} ${styles.revealEnhance}`}
            >
              <p className={styles.sectionEyebrow}>Demo</p>
              <h2 className={styles.sectionTitle}>Poznaj aplikację</h2>
              <p className={styles.sectionSubtitle}>
                Przejdź po sekcjach jak w prawdziwym OurWed — kliknij pozycję w menu
                i zobacz ekran po prawej.
              </p>
            </header>
            <AppTour />
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={styles.sectionInner}>
            <header
              ref={featuresIntroRef}
              className={`${styles.sectionIntro} ${styles.revealEnhance}`}
            >
              <p className={styles.sectionEyebrow}>Możliwości</p>
              <h2 className={styles.sectionTitle}>
                Narzędzia, których używasz w sezonie.
              </h2>
              <p className={styles.sectionSubtitle}>
                Każda funkcja odpowiada temu, co już jest w OurWed.
              </p>
            </header>

            <div className={styles.featureStack}>
              {FEATURES.map((feature, index) => (
                <RevealGroup
                  key={feature.id}
                  className={`${styles.featureRow} ${
                    index % 2 === 1 ? styles.featureRowReverse : ''
                  }`}
                >
                  <div
                    className={`${styles.featureCopy} ${styles.revealCard}`}
                    style={{ '--reveal-delay': '40ms' } as CSSProperties}
                  >
                    <h3 className={styles.featureTitle}>{feature.title}</h3>
                    <p className={styles.featureBody}>{feature.body}</p>
                    <p className={styles.featureBenefit}>{feature.benefit}</p>
                  </div>
                  <div
                    className={`${styles.featureVisualWrap} ${styles.revealCard}`}
                    style={{ '--reveal-delay': '100ms' } as CSSProperties}
                  >
                    <FeatureVisual kind={feature.visual} />
                  </div>
                </RevealGroup>
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className={styles.workflowSection}>
          <div className={styles.sectionInner}>
            <header className={styles.sectionIntro}>
              <p className={styles.sectionEyebrow}>Lifecycle</p>
              <h2 className={styles.sectionTitle}>Workflow całego ślubu.</h2>
              <p className={styles.sectionSubtitle}>
                Od zapytania do gotowego materiału — każdy etap w jednym miejscu.
              </p>
            </header>
            <div className={styles.workflowBody}>
              <WorkflowTimeline />
            </div>
          </div>
        </section>

        <section id="why" className={styles.section}>
          <div className={styles.sectionInner}>
            <header
              ref={whyRef}
              className={`${styles.sectionIntro} ${styles.revealEnhance}`}
            >
              <p className={styles.sectionEyebrow}>Dlaczego OurWed</p>
              <h2 className={styles.sectionTitle}>
                Mniej chaosu. Więcej fotografii.
              </h2>
            </header>
            <RevealGroup className={styles.whyGrid}>
              {WHY.map((item, index) => (
                <article
                  key={item.title}
                  className={`${styles.whyCard} ${styles.revealCard}`}
                  style={
                    {
                      '--reveal-delay': `${index * 70}ms`,
                    } as CSSProperties
                  }
                >
                  <h3 className={styles.cardTitle}>{item.title}</h3>
                  <p className={styles.cardBody}>{item.body}</p>
                </article>
              ))}
            </RevealGroup>
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={styles.sectionInnerNarrow}>
            <header
              ref={faqRef}
              className={`${styles.sectionIntro} ${styles.revealEnhance}`}
            >
              <p className={styles.sectionEyebrow}>FAQ</p>
              <h2 className={styles.sectionTitle}>Najczęstsze pytania</h2>
            </header>
            <div className={styles.faqList}>
              {FAQ.map((item) => (
                <details key={item.q} className={styles.faqItem}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.pricingNote}>
          <div className={styles.sectionInnerNarrow}>
            <p className={styles.sectionEyebrow}>Cennik</p>
            <h2 className={styles.sectionTitle}>Wkrótce</h2>
            <p className={styles.sectionSubtitle}>
              Pracujemy nad prostym, przejrzystym cennikiem. Już teraz możesz założyć
              konto i korzystać z OurWed.
            </p>
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <p className={styles.ctaEyebrow}>Gotowy na spokojniejszy sezon?</p>
            <h2 className={styles.ctaTitle}>
              Zacznij prowadzić studio w OurWed.
            </h2>
            <p className={styles.ctaSub}>
              Załóż konto w kilka minut. Bez karty. Bez długiej konfiguracji.
            </p>
            <div className={styles.ctaActions}>
              <button
                type="button"
                className={styles.primaryLink}
                onClick={() => openAuth('register')}
              >
                Rozpocznij za darmo
              </button>
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={() => openAuth('login')}
              >
                Mam już konto
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Logo />
            <p>CRM dla fotografów ślubnych — od zapytania do oddania materiału.</p>
          </div>
          <nav className={styles.footerNav} aria-label="Stopka">
            <a href="#tour">Produkt</a>
            <a href="#features">Funkcje</a>
            <a href="#pricing">Cennik</a>
            <a href="#privacy">Polityka prywatności</a>
            <a href="#terms">Regulamin</a>
            <a href="mailto:kontakt@ourwed.pl">Kontakt</a>
          </nav>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} OurWed. Wszelkie prawa zastrzeżone.
          </p>
        </div>
        <div id="privacy" className={styles.legalNote}>
          <p>
            Polityka prywatności — dokument w przygotowaniu. Do czasu publikacji
            dane przetwarzamy wyłącznie w celu świadczenia usługi OurWed.
          </p>
        </div>
        <div id="terms" className={styles.legalNote}>
          <p>
            Regulamin — dokument w przygotowaniu. Korzystanie z OurWed oznacza
            akceptację warunków, które opublikujemy przed uruchomieniem płatnego
            cennika.
          </p>
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
