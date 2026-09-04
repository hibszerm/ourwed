import { useId, useState } from 'react'
import { LV2_CONVERSION_FAQ } from '@/features/landing-v2/conversion/conversionFaq'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import { useConversionReveal } from '@/features/landing-v2/conversion/useConversionReveal'
import founderStyles from '@/features/landing-v2/mobile-story/FounderStoryReveal.module.css'
import styles from './LandingV2Faq.module.css'

const FIRST_FAQ_ID = LV2_CONVERSION_FAQ[0]?.id ?? ''

function FaqItem({
  id,
  question,
  answer,
  open,
  onSelect,
}: {
  id: string
  question: string
  answer: string
  open: boolean
  onSelect: (id: string) => void
}) {
  const panelId = useId()
  const buttonId = useId()

  return (
    <div className={styles.item} data-faq-item={id} data-open={open ? 'true' : 'false'}>
      <h3 className={styles.question}>
        <button
          id={buttonId}
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onSelect(id)}
        >
          <span>{question}</span>
          <span className={styles.chevron} aria-hidden>
            {open ? '−' : '+'}
          </span>
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={styles.panel}
        hidden={!open}
      >
        <p className={styles.answer}>{answer}</p>
      </div>
    </div>
  )
}

/**
 * Conversion FAQ — exactly one item open at all times; Tier-A hero matching pricing.
 */
export function LandingV2Faq() {
  const reduced = usePrefersReducedMotion()
  const { ref: headRef, revealed: headRevealed } = useConversionReveal<HTMLDivElement>(!!reduced)
  const [openFaqId, setOpenFaqId] = useState(FIRST_FAQ_ID)

  const onSelect = (id: string) => {
    // Always keep exactly one open — clicking the open item keeps it open.
    setOpenFaqId(id)
  }

  return (
    <section
      id="faq"
      className={styles.section}
      data-testid="lv2-faq"
      data-landing-faq=""
      data-faq-accordion="single"
      data-faq-min-open="1"
      aria-labelledby="lv2-faq-title"
    >
      <header className={styles.intro}>
        <div
          ref={headRef}
          className={`${styles.revealInner} ${headRevealed ? styles.revealed : ''}`}
        >
          <p className={styles.eyebrow}>NAJCZĘŚCIEJ ZADAWANE PYTANIA</p>
          <h2
            id="lv2-faq-title"
            className={`${styles.headline} ${founderStyles.openingHeadline}`}
            data-type-tier="founder-opening"
          >
            <span className={styles.line}>Masz pytania?</span>
            <span className={styles.line}>Mamy odpowiedzi.</span>
          </h2>
        </div>
      </header>

      <div className={styles.list} data-faq-list="">
        {LV2_CONVERSION_FAQ.map((item) => (
          <FaqItem
            key={item.id}
            id={item.id}
            question={item.question}
            answer={item.answer}
            open={openFaqId === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}
