import { useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import { SECURITY_CLAIMS } from '@/features/landing-v3/data/securityClaims'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { ClassicDataLock } from '@/features/landing-v3/product/ClassicDataLock'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const DESKTOP_THRESHOLD = 0.68

/** Security — classic padlock. Exact desktop visual on every viewport. */
export function SecuritySection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const scaled = viewport !== 'desktop'
  const { ref, active } = useSectionReveal({
    threshold: scaled ? 0.05 : DESKTOP_THRESHOLD,
    topTriggerRatio: scaled ? 0.72 : undefined,
    reduced: !!reduced,
  })

  return (
    <section
      ref={ref}
      className={styles.securitySection}
      data-security-mode="oneshot"
      data-testid="lv3-security-section"
      data-viewport-mode={viewport}
      aria-labelledby="security-title"
    >
      <DesktopCompositionScale composition="security">
        <div
          className={styles.securityVisual}
          data-testid="lv3-security-visual"
        >
          <ClassicDataLock active={active} />
        </div>
      </DesktopCompositionScale>

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
