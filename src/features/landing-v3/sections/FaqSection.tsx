import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DEMO_FAQ } from '@/features/landing-v3/data/demoData'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0)
  const reduced = useReducedMotion()

  return (
    <section className={styles.faq} aria-labelledby="faq-title">
      <div className={styles.faqLayout}>
        <div>
          <h2 id="faq-title" className={styles.titleC}>
            Pytania przed rozpoczęciem?
          </h2>
          <a href="mailto:kontakt@ourwed.pl" className={styles.faqContact}>
            Napisz do nas
          </a>
        </div>
        <div className={styles.faqList}>
          {DEMO_FAQ.map((item, index) => {
            const isOpen = open === index
            return (
              <div key={item.q} className={styles.faqItem}>
                <button
                  type="button"
                  className={styles.faqTrigger}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <motion.span
                    aria-hidden
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: DURATION.micro, ease: premiumEase }}
                  >
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={reduced ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={reduced ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: DURATION.micro, ease: premiumEase }}
                    >
                      <p className={styles.faqAnswer}>{item.a}</p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
