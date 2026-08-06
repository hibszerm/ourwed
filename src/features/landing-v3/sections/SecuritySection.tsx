import { useReducedMotion } from 'framer-motion'
import { MobileSecurityArtboard } from '@/features/landing-v3/components/mobile-artboards'
import { SECURITY_CLAIMS } from '@/features/landing-v3/data/securityClaims'
import {
  isMobileLandingMode,
  useLandingViewportMode,
} from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { ClassicDataLock } from '@/features/landing-v3/product/ClassicDataLock'
import artboardStyles from '@/features/landing-v3/components/mobile-artboards/mobileArtboard.module.css'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const MOBILE_FACT_LABELS = [
  'Uwierzytelnianie',
  'Separacja przestrzeni',
  'Unikalne linki',
  'Szyfrowanie integracji',
] as const

/** Security — classic padlock. Mobile: heading → copy → artboard → facts. */
export function SecuritySection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const mobile = isMobileLandingMode(viewport)
  const { ref, active } = useSectionReveal({
    threshold: mobile ? 0.22 : 0.68,
    reduced: !!reduced || mobile,
  })

  if (mobile) {
    return (
      <section
        ref={ref}
        className={styles.securitySection}
        data-security-mode="oneshot"
        data-testid="lv3-security-section"
        data-viewport-mode={viewport}
        data-security-mobile-layout="heading-copy-artboard-facts"
        aria-labelledby="security-title"
      >
        <div className={artboardStyles.securityMobileBlock}>
          <div className={artboardStyles.securityMobileIntro}>
            <h2 id="security-title" className={styles.titleA}>
              Dane Twoje i Twoich klientów
              <br />
              pozostają chronione.
            </h2>
            <p className={styles.editorialLead}>
              OurWed ogranicza dostęp do informacji do uwierzytelnionych
              użytkowników oraz przestrzeni, do których należą.
            </p>
          </div>

          <div
            className={styles.securityVisual}
            data-testid="lv3-security-visual"
          >
            <MobileSecurityArtboard />
          </div>

          <ul
            className={artboardStyles.securityMobileFacts}
            data-testid="lv3-security-copy"
          >
            {MOBILE_FACT_LABELS.map((label, i) => (
              <li key={SECURITY_CLAIMS[i]?.id ?? label}>{label}</li>
            ))}
          </ul>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={ref}
      className={styles.securitySection}
      data-security-mode="oneshot"
      data-testid="lv3-security-section"
      data-viewport-mode={viewport}
      aria-labelledby="security-title"
    >
      <div
        className={styles.securityVisual}
        data-testid="lv3-security-visual"
      >
        <ClassicDataLock active={active} />
      </div>

      <div
        className={styles.securityCopyBlock}
        data-testid="lv3-security-copy"
      >
        <div className={styles.securityCopyLeft}>
          <h2 id="security-title" className={styles.titleA}>
            Dane Twoje i Twoich klientów
            <br />
            pozostają chronione.
          </h2>
          <p className={styles.editorialLead}>
            OurWed ogranicza dostęp do informacji do uwierzytelnionych
            użytkowników oraz przestrzeni, do których należą.
          </p>
        </div>
        <ul className={styles.securityClaims}>
          {SECURITY_CLAIMS.map((claim) => (
            <li key={claim.id}>{claim.text.replace(/\.$/, '')}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
