import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { FounderQualification } from '@/features/landing-v2/conversion/FounderQualification'
import { FounderStoryContent } from '@/features/landing-v2/mobile-story/FounderStoryContent'
import editorial from './FounderStoryReveal.module.css'
import styles from './LandingV2FounderStory.module.css'

/**
 * Single Founder owner — normal document flow.
 *
 * Desktop: pulled up by one viewport over the Import sticky cover-hold runway
 * so browser scroll is the black-card entrance. Qualification continues on the
 * same black `.story` surface (no new black chapter / handoff).
 *
 * Hash `#stworzone-przez` targets a zero-size marker on the black Founder surface
 * (not the overlap-leading section border), so sticky-nav landings show Founder
 * black flush under the nav without changing cover geometry.
 */
export function LandingV2FounderStory() {
  const reduced = useReducedMotion()
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const simple = Boolean(reduced) || compact

  const hashAnchor = (
    <span
      id="stworzone-przez"
      className={editorial.hashAnchor}
      data-landing-hash-anchor="stworzone-przez"
      aria-hidden="true"
    />
  )

  if (simple) {
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
        <FounderStoryContent headingId="lv2-founder-opening-heading" compactFragments />
        <FounderQualification />
      </section>
    )
  }

  return (
    <section
      className={editorial.story}
      data-testid="lv2-founder-story"
      data-founder-theater="flow"
      data-founder-story=""
      data-founder-story-owner="single"
      data-founder-flow-surface=""
      aria-labelledby="lv2-founder-opening-heading"
    >
      {hashAnchor}
      <FounderStoryContent headingId="lv2-founder-opening-heading" />
      <FounderQualification />
    </section>
  )
}
