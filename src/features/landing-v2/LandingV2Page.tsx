import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import { LandingV3Nav } from '@/features/landing-v3/components/LandingV3Nav'
import { LandingV3Footer } from '@/features/landing-v3/sections/LandingV3Footer'
import v3 from '@/features/landing-v3/styles/landingV3.module.css'
import {
  LandingV2Faq,
  LandingV2FinalCta,
  LandingV2Pricing,
} from '@/features/landing-v2/conversion'
import { LandingV2Hero } from '@/features/landing-v2/sections/LandingV2Hero'
import { LandingV2ProblemStory } from '@/features/landing-v2/sections/LandingV2ProblemStory'
import { LandingV2ProductStory } from '@/features/landing-v2/product-story/LandingV2ProductStory'
import { LandingV2LifecycleStory } from '@/features/landing-v2/lifecycle-story/LandingV2LifecycleStory'
import { LandingV2FeaturesGrid } from '@/features/landing-v2/features-grid'
import {
  FeaturesExitShell,
  LandingV2MobileStory,
} from '@/features/landing-v2/mobile-story'
import { LandingV2FounderStory } from '@/features/landing-v2/mobile-story/LandingV2FounderStory'
import { LandingV2SeasonImportStory } from '@/features/landing-v2/mobile-story/LandingV2SeasonImportStory'
import { LandingV2SecurityHistoryStory } from '@/features/landing-v2/security-history'

/**
 * Production public landing — Founder single-owner + conversion chapters.
 *
 * Rhythm: product story → Import theater → black Founder+qualification →
 * warm pricing/FAQ → black final CTA → footer.
 *
 * Title / robots / OG live in the static HTML shell (index.html).
 */
export function LandingV2Page() {
  const reduced = usePrefersReducedMotion()

  return (
    <div
      id="top"
      className={v3.page}
      data-landing=""
      data-landing-v2=""
      data-landing-v2-baseline="production"
      data-testid="landing-v2-page"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <div className={v3.noise} aria-hidden />
      <LandingV3Nav />

      <main className={v3.main}>
        <LandingV2Hero />
        <LandingV2ProblemStory />
        <LandingV2ProductStory />
        <LandingV2LifecycleStory />
        <div id="jak-dziala">
          <FeaturesExitShell>
            <LandingV2FeaturesGrid />
          </FeaturesExitShell>
        </div>
        <LandingV2MobileStory />
        <LandingV2SecurityHistoryStory />
        <LandingV2SeasonImportStory />
        <LandingV2FounderStory />
        <LandingV2Pricing />
        <LandingV2Faq />
        <LandingV2FinalCta />
      </main>

      <LandingV3Footer />
    </div>
  )
}
