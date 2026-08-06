import { useReducedMotion } from 'framer-motion'
import { SECURITY_CLAIMS } from '@/features/landing-v3/data/securityClaims'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { ClassicDataLock } from '@/features/landing-v3/product/ClassicDataLock'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

/** Security — classic padlock visual first, factual copy below. */
export function SecuritySection() {
  const reduced = useReducedMotion()
  const { ref, active } = useSectionReveal({
    threshold: 0.68,
    reduced: !!reduced,
  })

  return (
    <section
      ref={ref}
      className={styles.securitySection}
      data-security-mode="oneshot"
      data-testid="lv3-security-section"
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
