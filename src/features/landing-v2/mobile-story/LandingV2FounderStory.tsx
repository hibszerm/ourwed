import { useReducedMotion } from 'framer-motion'
import { FounderQualification } from '@/features/landing-v2/conversion/FounderQualification'
import { FounderStoryContent } from '@/features/landing-v2/mobile-story/FounderStoryContent'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import editorial from './FounderStoryReveal.module.css'
import styles from './LandingV2FounderStory.module.css'

/**
 * Single Founder owner — normal document flow.
 *
 * Desktop + compact (motion): pulled up by one viewport over the Import
 * cover-hold runway so browser scroll is the black-card entrance.
 * Qualification continues on the same black `.story` surface.
 *
 * PRM: static normal flow — no sticky cover overlap.
 *
 * Hash `#stworzone-przez` targets a zero-size marker on the black Founder surface
 * (not the overlap-leading section border), so sticky-nav landings show Founder
 * black flush under the nav without changing cover geometry.
 */
export function LandingV2FounderStory() {
  const reduced = useReducedMotion()
  const compact = useLandingCompactViewport()

  const hashAnchor = (
    <span
      id="stworzone-przez"
      className={editorial.hashAnchor}
      data-landing-hash-anchor="stworzone-przez"
      aria-hidden="true"
    />
  )

  /* Reduced motion: no cover overlap — Import → Founder normal document flow. */
  if (reduced) {
    return (
      <section
        className={`${editorial.story} ${styles.staticShell}`}
        data-testid="lv2-founder-story"
        data-founder-theater="static"
        data-founder-story=""
        data-founder-story-owner="static"
        aria-labelledby="lv2-founder-opening-heading"
      >
        {hashAnchor}
        <FounderStoryContent headingId="lv2-founder-opening-heading" compactFragments={compact} />
        <FounderQualification />
      </section>
    )
  }

  return (
    <section
      className={editorial.story}
      data-testid="lv2-founder-story"
      data-founder-theater={compact ? 'cover-flow' : 'flow'}
      data-founder-story=""
      data-founder-story-owner="single"
      data-founder-flow-surface=""
      data-founder-compact={compact ? 'true' : 'false'}
      aria-labelledby="lv2-founder-opening-heading"
    >
      {hashAnchor}
      <FounderStoryContent
        headingId="lv2-founder-opening-heading"
        compactFragments={compact}
        localReveal={compact}
      />
      <FounderQualification />
    </section>
  )
}
