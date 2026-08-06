import { useReducedMotion } from 'framer-motion'
import { MobileSecurityArtboard } from '@/features/landing-v3/components/mobile-artboards'
import { SECURITY_CLAIMS } from '@/features/landing-v3/data/securityClaims'
import {
  isMobileLandingMode,
  useLandingViewportMode,
} from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { ClassicDataLock } from '@/features/landing-v3/product/ClassicDataLock'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

/** Security — classic padlock visual first, factual copy below. */
export function SecuritySection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const mobile = isMobileLandingMode(viewport)
  const { ref, active } = useSectionReveal({
    threshold: mobile ? 0.28 : 0.68,
    reduced: !!reduced || mobile,
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
      <div
        className={styles.securityVisual}
        data-testid="lv3-security-visual"
      >
        {mobile ? (
          <MobileSecurityArtboard />
        ) : (
          <ClassicDataLock active={active} />
        )}
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
