import { useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import { SECURITY_CLAIMS } from '@/features/landing-v3/data/securityClaims'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { ClassicDataLock } from '@/features/landing-v3/product/ClassicDataLock'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const DESKTOP_THRESHOLD = 0.68

/** Security — classic padlock. Exact desktop visual; mobile uses overlapping handoff. */
export function SecuritySection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const scaled = viewport !== 'desktop'
  const { ref, active, instantComplete } = useSectionReveal({
    threshold: scaled ? 0.02 : DESKTOP_THRESHOLD,
    // Mobile: wait until the canvas is in the readable band (~64% VH).
    topTriggerRatio: scaled ? 0.64 : undefined,
    reduced: !!reduced,
    forceCompleteOnExitAbove: scaled,
  })

  return (
    <section
      className={styles.securitySection}
      data-security-mode="oneshot"
      data-testid="lv3-security-section"
      data-viewport-mode={viewport}
      aria-labelledby="security-title"
    >
      {/* Observe the visual itself — not the tall section with copy */}
      <div ref={ref} data-security-activation-target="">
        <DesktopCompositionScale composition="security">
          <div
            className={styles.securityVisual}
            data-testid="lv3-security-visual"
          >
            <ClassicDataLock
              active={active}
              timeline={scaled ? 'mobile' : 'desktop'}
              instantComplete={instantComplete}
            />
          </div>
        </DesktopCompositionScale>
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
