import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen'
import { useAuth } from '@/features/auth/AuthProvider'
import styles from './LandingPage.module.css'

const FEATURES = [
  {
    title: 'Kalendarz',
    body: 'Pełny harmonogram wszystkich ślubów.',
  },
  {
    title: 'Podróże',
    body: 'Automatyczne planowanie tras między lokalizacjami.',
  },
  {
    title: 'Ankiety',
    body: 'Para młoda uzupełnia wszystkie informacje online.',
  },
  {
    title: 'Klienci',
    body: 'Umowy, płatności i status współpracy zawsze pod kontrolą.',
  },
] as const

const BENEFITS = [
  {
    title: 'Oszczędzaj czas',
    body: 'Mniej administracji. Więcej fotografowania.',
  },
  {
    title: 'Pełna organizacja',
    body: 'Wszystkie informacje zawsze pod ręką.',
  },
  {
    title: 'Większa kontrola',
    body: 'Finanse, terminy i zadania bez chaosu.',
  },
  {
    title: 'Pracuj wszędzie',
    body: 'Komputer w biurze. Telefon podczas ślubu.',
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
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
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

function ProductMockup() {
  return (
    <div className={styles.mockupStage} aria-hidden>
      <div className={styles.desktopFrame}>
        <div className={styles.windowChrome}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.desktopBody}>
          <aside className={styles.mockSidebar}>
            <div className={styles.mockBrand} />
            <div className={styles.mockNavItem} />
            <div className={styles.mockNavItem} />
            <div className={styles.mockNavItem} />
            <div className={styles.mockNavItem} />
          </aside>
          <div className={styles.mockMain}>
            <div className={styles.mockHeroLine} />
            <div className={styles.mockHeroSub} />
            <div className={styles.mockGrid}>
              <div className={styles.mockCard}>
                <div className={styles.mockCardTitle} />
                <div className={styles.mockBar} />
                <div className={styles.mockBarShort} />
              </div>
              <div className={styles.mockCard}>
                <div className={styles.mockCardTitle} />
                <div className={styles.mockListRow} />
                <div className={styles.mockListRow} />
                <div className={styles.mockListRow} />
              </div>
            </div>
            <div className={styles.mockWideCard}>
              <div className={styles.mockCardTitle} />
              <div className={styles.mockTimeline}>
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.mobileFrame}>
        <div className={styles.mobileNotch} />
        <div className={styles.mobileBody}>
          <div className={styles.mockHeroLine} />
          <div className={styles.mockCard}>
            <div className={styles.mockCardTitle} />
            <div className={styles.mockBar} />
            <div className={styles.mockBarShort} />
          </div>
          <div className={styles.mockCard}>
            <div className={styles.mockListRow} />
            <div className={styles.mockListRow} />
          </div>
        </div>
      </div>
    </div>
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
    <div
      ref={ref}
      className={`${className} ${styles.revealGroup}`.trim()}
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const showcaseVisualRef = useReveal<HTMLDivElement>()
  const showcaseCopyRef = useReveal<HTMLDivElement>()
  const ctaRef = useReveal<HTMLDivElement>()
  const featuresTitleRef = useReveal<HTMLElement>()

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
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Logo />
          <nav className={styles.navLinks} aria-label="Nawigacja główna">
            <a href="#features" className={styles.navTextLink}>
              Funkcje
            </a>
            <span className={styles.navMuted} title="Wkrótce">
              Cennik
              <em>Wkrótce</em>
            </span>
            <a href="#about" className={styles.navTextLink}>
              O aplikacji
            </a>
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
              <h1 className={`${styles.heroTitle} ${styles.heroAnimTitle}`}>
                Prowadź całą firmę ślubną
                <br />
                w jednym miejscu.
              </h1>
              <p className={`${styles.heroSub} ${styles.heroAnimSub}`}>
                Od pierwszego zapytania aż do oddania materiału.
                <br />
                Umowy, ankiety, harmonogram, podróże i płatności zawsze pod ręką.
              </p>
              <div className={`${styles.heroActions} ${styles.heroAnimActions}`}>
                <Link to="/register" className={styles.primaryLink}>
                  Rozpocznij za darmo
                </Link>
                <Button type="button" variant="secondary" disabled>
                  Prezentacja wkrótce
                </Button>
              </div>
              <ul className={`${styles.heroChecks} ${styles.heroAnimChecks}`}>
                <li>
                  <span aria-hidden>✓</span> Kalendarz
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
              <ProductMockup />
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
                Wszystko, czego potrzebujesz.
              </h2>
              <p className={styles.sectionSubtitle}>
                Każdy etap współpracy z parą w jednym miejscu.
              </p>
            </header>
            <RevealGroup className={styles.featureGrid}>
              {FEATURES.map((feature, index) => (
                <Card
                  key={feature.title}
                  padding="lg"
                  elevation="elevated"
                  className={`${styles.featureCard} ${styles.revealCard}`}
                  style={
                    {
                      '--reveal-delay': `${index * 120}ms`,
                    } as CSSProperties
                  }
                >
                  <h3 className={styles.cardTitle}>{feature.title}</h3>
                  <p className={styles.cardBody}>{feature.body}</p>
                </Card>
              ))}
            </RevealGroup>
          </div>
        </section>

        <section id="about" className={styles.showcase}>
          <div className={styles.showcaseInner}>
            <div
              ref={showcaseVisualRef}
              className={`${styles.showcaseVisual} ${styles.revealFromLeft}`}
            >
              <div className={styles.showcaseFrame}>
                <div className={styles.windowChrome}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.showcaseBody}>
                  <div className={styles.mockHeroLine} />
                  <div className={styles.mockHeroSub} />
                  <div className={styles.mockGrid}>
                    <div className={styles.mockCard}>
                      <div className={styles.mockCardTitle} />
                      <div className={styles.mockBar} />
                      <div className={styles.mockBarShort} />
                      <div className={styles.mockBar} />
                    </div>
                    <div className={styles.mockCard}>
                      <div className={styles.mockCardTitle} />
                      <div className={styles.mockListRow} />
                      <div className={styles.mockListRow} />
                      <div className={styles.mockListRow} />
                      <div className={styles.mockListRow} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div
              ref={showcaseCopyRef}
              className={`${styles.showcaseCopy} ${styles.revealFromRight}`}
            >
              <h2 className={styles.showcaseTitle}>
                Jedna aplikacja.
                <br />
                Każdy ślub.
              </h2>
              <p className={styles.showcaseText}>
                Wszystkie dane połączone w jednym miejscu.
              </p>
              <a href="#features" className={styles.secondaryLink}>
                Dowiedz się więcej
              </a>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionInner}>
            <RevealGroup className={styles.benefitGrid}>
              {BENEFITS.map((benefit, index) => (
                <Card
                  key={benefit.title}
                  padding="lg"
                  className={`${styles.benefitCard} ${styles.revealCard}`}
                  style={
                    {
                      '--reveal-delay': `${index * 120}ms`,
                    } as CSSProperties
                  }
                >
                  <div className={styles.benefitMark} aria-hidden />
                  <h3 className={styles.cardTitle}>{benefit.title}</h3>
                  <p className={styles.cardBody}>{benefit.body}</p>
                </Card>
              ))}
            </RevealGroup>
          </div>
        </section>

        <section className={styles.cta}>
          <div ref={ctaRef} className={`${styles.ctaInner} ${styles.revealCta}`}>
            <h2 className={styles.ctaTitle}>
              Gotowy uporządkować swoją pracę?
            </h2>
            <Link to="/register" className={styles.primaryLink}>
              Rozpocznij za darmo
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Logo />
          <nav className={styles.footerNav} aria-label="Stopka">
            <a href="#features">Funkcje</a>
            <a href="#about">O aplikacji</a>
            <Link to="/login">Zaloguj się</Link>
          </nav>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} OurWed. Wszelkie prawa zastrzeżone.
          </p>
        </div>
      </footer>
    </div>
  )
}
