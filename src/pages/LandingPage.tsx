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
import { ProductPreview } from '@/features/landing/ProductPreview'
import { WorkflowShowcase } from '@/features/landing/WorkflowShowcase'
import { clearLogoutRedirectToLanding } from '@/lib/auth/logoutRedirect'
import styles from './LandingPage.module.css'

const FEATURES = [
  {
    id: 'travel',
    title: 'Inteligentne planowanie tras',
    body: 'Układaj przystanki dnia ślubu, licz dystanse i czasy dojazdu — bez skakania między mapami a notatkami.',
    benefit: 'Mniej stresu w dniu ślubu',
    visual: 'travel',
  },
  {
    id: 'questionnaires',
    title: 'Automatyczne ankiety dla par',
    body: 'Wysyłaj umowy i szczegóły eventowe online. Para uzupełnia dane, Ty masz je od razu w karcie ślubu.',
    benefit: 'Zero ciągłego dopytywania',
    visual: 'forms',
  },
  {
    id: 'timeline',
    title: 'Harmonogram dnia ślubu',
    body: 'Ceremonia, przygotowania, dojazd i przyjęcie w jednym widoku — z kontekstem lokalizacji i zadań.',
    benefit: 'Pełna kontrola nad przebiegiem',
    visual: 'timeline',
  },
  {
    id: 'payments',
    title: 'Płatności i zaliczki',
    body: 'Śledź wartość umowy, zaliczki i pozostałe kwoty przy każdym ślubie. Status finansów zawsze aktualny.',
    benefit: 'Przejrzyste rozliczenia',
    visual: 'finance',
  },
  {
    id: 'checklist',
    title: 'Checklista sprzętu',
    body: 'Pakiety, dodatki i checklisty powiązane ze ślubem — nic nie zostaje w chaotycznych notatkach.',
    benefit: 'Gotowość przed wyjazdem',
    visual: 'checklist',
  },
  {
    id: 'workflow',
    title: 'Workflow całego ślubu',
    body: 'Od zapytania do gotowej galerii — każdy etap ma swoje miejsce, status i kolejne kroki.',
    benefit: 'Żaden ślub nie ginie w procesie',
    visual: 'workflow',
  },
] as const

const WHY = [
  {
    title: 'Mniej administracji',
    body: 'Automatyzujesz zbieranie danych, przypomnienia i statusy — zamiast ręcznie ogarniać wszystko w mailach.',
  },
  {
    title: 'Lepsza organizacja',
    body: 'Kalendarz, podróże, ankiety i finanse żyją w jednej aplikacji, nie w pięciu zakładkach.',
  },
  {
    title: 'Automatyczne przypomnienia',
    body: 'Widzisz, co czeka: ankiety, płatności, zadania przed ślubem — zanim coś wypadnie z głowy.',
  },
  {
    title: 'Jedno miejsce na wszystko',
    body: 'Kontakt, umowa, lokalizacje i notatki są przy ślubie. Nie szukasz ich w czacie ani w dysku.',
  },
  {
    title: 'Nie zgubisz żadnego ślubu',
    body: 'Pełny lifecycle współpracy — od pierwszego zapytania do oddania galerii — zawsze pod kontrolą.',
  },
] as const

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

function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`${styles.logo} ${className}`.trim()}>
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

  if (kind === 'timeline') {
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

  if (kind === 'checklist') {
    return (
      <div className={styles.featureMock} aria-hidden>
        <div className={styles.mockCheckList}>
          {['2× body', 'Obiektyw 35mm', 'Lampy zewnętrzne', 'Karty zapasowe'].map(
            (item, i) => (
              <label key={item} className={styles.mockCheckItem}>
                <span data-done={i < 3 ? 'true' : 'false'} />
                {item}
              </label>
            ),
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.featureMock} aria-hidden>
      <div className={styles.mockFlowMini}>
        {['Zapytanie', 'Umowa', 'Ślub', 'Galeria'].map((step, i) => (
          <div key={step} className={styles.mockFlowStep}>
            <b>{i + 1}</b>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const previewIntroRef = useReveal<HTMLElement>()
  const workflowIntroRef = useReveal<HTMLElement>()
  const workflowBodyRef = useReveal<HTMLDivElement>()
  const whyRef = useReveal<HTMLElement>()
  const ctaRef = useReveal<HTMLDivElement>()
  const featuresTitleRef = useReveal<HTMLElement>()

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
              <p className={`${styles.heroEyebrow} ${styles.heroAnimEyebrow}`}>
                CRM dla fotografów ślubnych
              </p>
              <h1 className={`${styles.heroTitle} ${styles.heroAnimTitle}`}>
                Prowadź całą firmę ślubną
                <br />
                w jednym miejscu.
              </h1>
              <p className={`${styles.heroSub} ${styles.heroAnimSub}`}>
                OurWed łączy zapytania, umowy, ankiety, kalendarz, trasy i płatności —
                od pierwszego kontaktu aż do gotowej galerii.
              </p>
              <div className={`${styles.heroActions} ${styles.heroAnimActions}`}>
                <Link to="/register" className={styles.primaryLink}>
                  Rozpocznij za darmo
                </Link>
                <a href="#preview" className={styles.secondaryLink}>
                  Zobacz produkt
                </a>
              </div>
              <ul className={`${styles.heroChecks} ${styles.heroAnimChecks}`}>
                <li>
                  <span aria-hidden>✓</span> Kalendarz i workflow
                </li>
                <li>
                  <span aria-hidden>✓</span> Inteligentne trasy
                </li>
                <li>
                  <span aria-hidden>✓</span> Ankiety dla par
                </li>
              </ul>
            </div>
            <div className={`${styles.heroVisual} ${styles.heroAnimVisual}`}>
              <ProductPreview autoRotate compact />
            </div>
          </div>
        </section>

        <section id="preview" className={styles.previewSection}>
          <div className={styles.sectionInner}>
            <header
              ref={previewIntroRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
            >
              <h2 className={styles.sectionTitle}>Produkt, nie obietnice.</h2>
              <p className={styles.sectionSubtitle}>
                Przełącz widoki i zobacz, jak wygląda realna praca w OurWed —
                dashboard, śluby, podróże, ankiety, finanse i kalendarz.
              </p>
            </header>
            <div className={styles.previewStage}>
              <ProductPreview />
            </div>
          </div>
        </section>

        <section id="features" className={styles.section}>
          <div className={styles.sectionInner}>
            <header
              ref={featuresTitleRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
            >
              <h2 className={styles.sectionTitle}>
                Wszystko, czego potrzebuje studio ślubne.
              </h2>
              <p className={styles.sectionSubtitle}>
                Każdy etap współpracy z parą — w przejrzystym, spokojnym interfejsie.
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
                    style={{ '--reveal-delay': '60ms' } as CSSProperties}
                  >
                    <h3 className={styles.featureTitle}>{feature.title}</h3>
                    <p className={styles.featureBody}>{feature.body}</p>
                    <p className={styles.featureBenefit}>{feature.benefit}</p>
                  </div>
                  <div
                    className={`${styles.featureVisualWrap} ${styles.revealCard}`}
                    style={{ '--reveal-delay': '140ms' } as CSSProperties}
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
              <h2 className={styles.sectionTitle}>Cały lifecycle ślubu.</h2>
              <p className={styles.sectionSubtitle}>
                Kliknij etap, aby zobaczyć, jak OurWed prowadzi Cię od zapytania
                do zakończenia.
              </p>
            </header>
            <div
              ref={workflowBodyRef}
              className={`${styles.workflowBody} ${styles.revealFade}`}
            >
              <WorkflowShowcase />
            </div>
          </div>
        </section>

        <section id="why" className={styles.section}>
          <div className={styles.sectionInner}>
            <header
              ref={whyRef}
              className={`${styles.sectionIntro} ${styles.revealFade}`}
            >
              <h2 className={styles.sectionTitle}>
                Dlaczego fotografowie wybierają OurWed?
              </h2>
              <p className={styles.sectionSubtitle}>
                Mniej chaosu operacyjnego. Więcej czasu na fotografię.
              </p>
            </header>
            <RevealGroup className={styles.whyGrid}>
              {WHY.map((item, index) => (
                <article
                  key={item.title}
                  className={`${styles.whyCard} ${styles.revealCard}`}
                  style={
                    {
                      '--reveal-delay': `${index * 90}ms`,
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
              Zacznij prowadzić studio ślubne jak premium SaaS.
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
            <p>
              CRM dla fotografów ślubnych — od zapytania do gotowej galerii.
            </p>
          </div>
          <nav className={styles.footerNav} aria-label="Stopka">
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
