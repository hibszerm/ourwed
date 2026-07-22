import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  HeroProductFrame,
  ProductPreview,
} from '@/features/landing/ProductPreview'
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

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        el.classList.add(styles.revealed)
        observer.unobserve(el)
      },
      { threshold: 0.12, rootMargin: '0px 0px -4% 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return ref
}

function Logo() {
  return (
    <Link to="/" className={styles.logo}>
      <span className={styles.logoMark} aria-hidden>
        OW
      </span>
      <span className={styles.logoText}>OurWed</span>
    </Link>
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
  const tourIntroRef = useReveal<HTMLElement>()
  const featuresIntroRef = useReveal<HTMLElement>()
  const workflowIntroRef = useReveal<HTMLElement>()
  const workflowBodyRef = useReveal<HTMLDivElement>()
  const whyRef = useReveal<HTMLElement>()
  const ctaRef = useReveal<HTMLDivElement>()

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

  if (isLoading) return <AuthLoadingScreen />
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className={styles.page}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Logo />
          <nav className={styles.navLinks} aria-label="Nawigacja główna">
            <a href="#tour" className={styles.navTextLink}>
              Produkt
            </a>
            <a href="#features" className={styles.navTextLink}>
              Funkcje
            </a>
            <a href="#workflow" className={styles.navTextLink}>
              Workflow
            </a>
            <span className={styles.navMuted} title="Wkrótce">
              Cennik
              <em>Wkrótce</em>
            </span>
            <Link to="/login" className={`${styles.navLogin} ${styles.navTextLink}`}>
              Zaloguj się
            </Link>
            <Link to="/register" className={styles.navCta}>
              Rozpocznij za darmo
            </Link>
          </nav>
        </div>
      </header>

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
                <Link to="/register" className={styles.primaryLink}>
                  Rozpocznij za darmo
                </Link>
                <a href="#tour" className={styles.secondaryLink}>
                  Zobacz produkt
                </a>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <HeroProductFrame />
            </div>
          </div>
        </section>

        <section id="tour" className={styles.tourSection}>
          <div className={styles.sectionInner}>
            <header
              ref={tourIntroRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
            >
              <p className={styles.sectionEyebrow}>Interaktywny podgląd</p>
              <h2 className={styles.sectionTitle}>Poznaj OurWed od środka.</h2>
              <p className={styles.sectionSubtitle}>
                Kliknij zakładkę i zobacz, jak wygląda realna praca w aplikacji —
                bez rejestracji.
              </p>
            </header>
            <ProductPreview />
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={styles.sectionInner}>
            <header
              ref={featuresIntroRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
            >
              <p className={styles.sectionEyebrow}>Możliwości</p>
              <h2 className={styles.sectionTitle}>
                Narzędzia, których używasz w sezonie.
              </h2>
              <p className={styles.sectionSubtitle}>
                Każda funkcja odpowiada temu, co już jest w OurWed — bez obietnic
                na przyszłość.
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
                    style={{ '--reveal-delay': '120ms' } as CSSProperties}
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
            <header
              ref={workflowIntroRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
            >
              <p className={styles.sectionEyebrow}>Lifecycle</p>
              <h2 className={styles.sectionTitle}>Workflow całego ślubu.</h2>
              <p className={styles.sectionSubtitle}>
                Od zapytania do zakończenia — każdy etap ma swoje miejsce w OurWed.
              </p>
            </header>
            <div
              ref={workflowBodyRef}
              className={`${styles.workflowBody} ${styles.revealFade}`}
            >
              <WorkflowTimeline />
            </div>
          </div>
        </section>

        <section id="why" className={styles.section}>
          <div className={styles.sectionInner}>
            <header
              ref={whyRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
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
                      '--reveal-delay': `${index * 80}ms`,
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

        <section className={styles.cta}>
          <div ref={ctaRef} className={`${styles.ctaInner} ${styles.revealCta}`}>
            <p className={styles.ctaEyebrow}>Gotowy na spokojniejszy sezon?</p>
            <h2 className={styles.ctaTitle}>
              Zacznij prowadzić studio w OurWed.
            </h2>
            <p className={styles.ctaSub}>
              Załóż konto w kilka minut. Bez karty. Bez długiej konfiguracji.
            </p>
            <div className={styles.ctaActions}>
              <Link to="/register" className={styles.primaryLink}>
                Rozpocznij za darmo
              </Link>
              <Link to="/login" className={styles.secondaryLink}>
                Mam już konto
              </Link>
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
            <span className={styles.footerSoon}>
              Cennik <em>wkrótce</em>
            </span>
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
    </div>
  )
}
