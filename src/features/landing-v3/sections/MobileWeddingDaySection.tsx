import { useReducedMotion } from 'framer-motion'
import { IPhoneMockup } from '@/features/landing-v3/components/mobile/IPhoneMockup'
import { IPhoneNavigationPreview } from '@/features/landing-v3/components/mobile/IPhoneNavigationPreview'
import { MobileAssignmentView } from '@/features/landing-v3/components/mobile/MobileAssignmentView'
import { MobileBriefView } from '@/features/landing-v3/components/mobile/MobileBriefView'
import { MobileItineraryView } from '@/features/landing-v3/components/mobile/MobileItineraryView'
import { MobileNavigationChooser } from '@/features/landing-v3/components/mobile/MobileNavigationChooser'
import {
  isMobileLandingMode,
  useLandingViewportMode,
} from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useMobileWeddingDaySequence } from '@/features/landing-v3/hooks/useMobileWeddingDaySequence'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { MOBILE_DEMO_BENEFITS } from '@/features/landing-v3/motion/mobileWeddingDaySequence'
import styles from '@/features/landing-v3/styles/landingV3.module.css'
import mobileStyles from './MobileWeddingDaySection.module.css'

/**
 * Mobile wedding-day — IPhoneMockup + one-shot nav → brief.
 * Stable layers inside display mask. Final brief state persists.
 * Desktop phone geometry unchanged; mobile uses dedicated widths.
 */
export function MobileWeddingDaySection() {
  const reduced = !!useReducedMotion()
  const viewport = useLandingViewportMode()
  const narrow = isMobileLandingMode(viewport)
  const { ref, active } = useSectionReveal({
    threshold: narrow ? 0.28 : 0.35,
    reduced,
  })
  const snapshot = useMobileWeddingDaySequence({
    active,
    reduced,
    mode: narrow ? 'simple' : 'full',
  })

  const assignmentOpacity =
    snapshot.briefProgress > 0.02
      ? Math.max(0, 1 - snapshot.briefProgress)
      : snapshot.navigationProgress > 0.55
        ? Math.max(0, 1 - (snapshot.navigationProgress - 0.55) / 0.45)
        : 1

  const assignmentShiftX = snapshot.briefProgress * -18

  return (
    <section
      ref={ref}
      className={`${styles.editorialSection} ${mobileStyles.section}`}
      data-testid="lv3-mobile-wedding-day"
      data-mobile-demo={snapshot.phase}
      data-motion="mobile-wedding-day"
      data-demo-oneshot="true"
      data-final-state="brief"
      data-viewport-mode={viewport}
      aria-labelledby="mobile-day-title"
    >
      <div className={mobileStyles.layout}>
        <div className={mobileStyles.intro}>
          <h2 id="mobile-day-title" className={styles.titleA}>
            Wszystko pod ręką.
            <br />
            Nawet w dniu ślubu.
          </h2>
          <p className={styles.editorialLead}>
            Plan dnia, kontakty, lokalizacje i brief masz zawsze przy sobie —
            bez otwierania laptopa i szukania informacji w wiadomościach.
          </p>
          <p className={mobileStyles.webNote}>
            Mobilny widok OurWed działa wygodnie w przeglądarce telefonu.
          </p>
        </div>

        <div
          className={mobileStyles.stage}
          data-testid="lv3-mobile-stage"
          aria-label="Mobilny widok OurWed pokazuje plan dnia, prowadzi z Apartamentów Stary Rynek do Hotelu Liberté i udostępnia najważniejsze informacje w briefie."
        >
          <p className={mobileStyles.srOnly}>
            Mobilny widok OurWed pokazuje plan dnia, prowadzi z Apartamentów
            Stary Rynek do Hotelu Liberté i udostępnia najważniejsze informacje
            w briefie.
          </p>

          <div
            className={mobileStyles.phones}
            data-entered={snapshot.phonesEntered ? 'true' : 'false'}
            aria-hidden="true"
          >
            <div className={mobileStyles.contactShadow} aria-hidden />

            <IPhoneMockup
              size="secondary"
              entered={snapshot.phonesEntered}
              narrow={narrow}
              className={mobileStyles.secondaryPhone}
            >
              <MobileItineraryView />
            </IPhoneMockup>

            <IPhoneMockup
              size="primary"
              entered={snapshot.phonesEntered}
              narrow={narrow}
              className={mobileStyles.primaryPhone}
            >
              <MobileAssignmentView
                focus={snapshot.focus}
                dimmed={snapshot.assignmentDimmed}
                opacity={assignmentOpacity}
                shiftX={assignmentShiftX}
              />
              <IPhoneNavigationPreview
                progress={snapshot.navigationProgress}
                routeProgress={snapshot.routeProgress}
                status={snapshot.navStatus}
              />
              <MobileNavigationChooser
                progress={snapshot.chooserProgress}
                focus={snapshot.focus}
              />
              <MobileBriefView
                progress={snapshot.briefProgress}
                compact={narrow}
              />
            </IPhoneMockup>
          </div>
        </div>

        <ol className={mobileStyles.benefits} data-testid="lv3-mobile-benefits">
          {MOBILE_DEMO_BENEFITS.map((benefit) => (
            <li key={benefit.index}>
              <span className={mobileStyles.benefitIndex}>{benefit.index}</span>
              <span className={mobileStyles.benefitLabel}>{benefit.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
