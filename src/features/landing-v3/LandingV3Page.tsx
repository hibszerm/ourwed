import { useEffect } from 'react'
import { LandingV3Nav } from '@/features/landing-v3/components/LandingV3Nav'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import { Act1Hero } from '@/features/landing-v3/sections/Act1Hero'
import { AssignmentOverviewSection } from '@/features/landing-v3/sections/AssignmentOverviewSection'
import { BriefSection } from '@/features/landing-v3/sections/BriefSection'
import { CalendarSection } from '@/features/landing-v3/sections/CalendarSection'
import { FaqSection } from '@/features/landing-v3/sections/FaqSection'
import { FinanceSection } from '@/features/landing-v3/sections/FinanceSection'
import { FinalCtaSection } from '@/features/landing-v3/sections/FinalCtaSection'
import { ImportExistingWorkSection } from '@/features/landing-v3/sections/ImportExistingWorkSection'
import { LandingV3Footer } from '@/features/landing-v3/sections/LandingV3Footer'
import { PricingSection } from '@/features/landing-v3/sections/PricingSection'
import { QuestionnairesContractsSection } from '@/features/landing-v3/sections/QuestionnairesContractsSection'
import { MobileWeddingDaySection } from '@/features/landing-v3/sections/MobileWeddingDaySection'
import { QuestionnaireDaySection } from '@/features/landing-v3/sections/QuestionnaireDaySection'
import { SecuritySection } from '@/features/landing-v3/sections/SecuritySection'
import { WeddingsSessionsSection } from '@/features/landing-v3/sections/WeddingsSessionsSection'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const PAGE_TITLE =
  'OurWed — CRM dla fotografów, filmowców i content creatorów'
const PAGE_DESCRIPTION =
  'Obsługa zleceń ślubnych bez chaosu — umowy, ankiety, płatności, plan dnia i kalendarze w jednym systemie.'

/**
 * Landing V3 — editorial product landing.
 * Route: /landing-v3. Does not replace production `/`.
 */
export function LandingV3Page() {
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const previousTitle = document.title
    document.title = PAGE_TITLE
    let meta = document.querySelector('meta[name="description"]')
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    const previousDescription = meta.getAttribute('content')
    meta.setAttribute('content', PAGE_DESCRIPTION)
    return () => {
      document.title = previousTitle
      if (created) meta?.remove()
      else if (previousDescription != null) {
        meta?.setAttribute('content', previousDescription)
      }
    }
  }, [])

  return (
    <div
      id="top"
      className={styles.page}
      data-landing-v3=""
      data-landing-v3-rebuild="classic-lock-day"
      data-gate="classic-lock-day"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <div className={styles.noise} aria-hidden />
      <LandingV3Nav />

      <main className={styles.main}>
        <Act1Hero />
        <div id="jak-dziala">
          <ImportExistingWorkSection />
          <AssignmentOverviewSection />
          <QuestionnairesContractsSection />
          <FinanceSection />
          <QuestionnaireDaySection />
          <MobileWeddingDaySection />
          <SecuritySection />
          <CalendarSection />
          <BriefSection />
          <WeddingsSessionsSection />
        </div>
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>

      <LandingV3Footer />
    </div>
  )
}
