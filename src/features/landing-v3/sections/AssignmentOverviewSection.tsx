import { motion, useReducedMotion } from 'framer-motion'
import { DEMO_ASSIGNMENT, demoRouteTotal } from '@/features/landing-v3/data/demoData'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const MODULES = [
  {
    id: 'data',
    title: 'Dane pary',
    detail: 'Odpowiedzi z ankiety przypisane do zlecenia',
    pos: 'tl',
  },
  {
    id: 'contract',
    title: 'Umowa',
    detail: 'Dokument przygotowany z danych pary i pakietu',
    pos: 'tr',
  },
  {
    id: 'payments',
    title: 'Płatności',
    detail: '5 500 zł wpłacone · 7 400 zł pozostało',
    pos: 'ml',
  },
  {
    id: 'pre',
    title: 'Ankieta przedślubna',
    detail: 'Szczegóły dnia uzupełnione przez parę',
    pos: 'mr',
  },
  {
    id: 'day',
    title: 'Plan dnia',
    detail: `5 lokalizacji · ${demoRouteTotal.distance} · ${demoRouteTotal.duration}`,
    pos: 'bl',
  },
  {
    id: 'brief',
    title: 'Brief',
    detail: 'Dokument gotowy przed wyjazdem',
    pos: 'br',
  },
] as const

/** Section 1 — complete assignment overview. Full-bleed product canvas. */
export function AssignmentOverviewSection() {
  const reduced = useReducedMotion()
  const { ref, active } = useSectionReveal({
    threshold: 0.55,
    reduced: !!reduced,
  })

  return (
    <section
      ref={ref}
      id="produkt"
      className={styles.editorialSection}
      data-composition="full-bleed"
      data-testid="lv3-assignment-overview"
      aria-labelledby="assignment-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="assignment-title" className={styles.titleA}>
          Jedno zlecenie.
          <br />
          Cały proces pod kontrolą.
        </h2>
        <p className={styles.editorialLead}>
          Od pierwszych danych pary, przez umowę i płatności, aż po plan dnia i
          brief przed wyjazdem.
        </p>
      </div>

      <div className={styles.assignmentCanvas} data-landing-preview="">
        <svg
          className={styles.assignmentLines}
          viewBox="0 0 1200 720"
          preserveAspectRatio="none"
          aria-hidden
        >
          {[
            'M 220 140 L 480 300',
            'M 980 140 L 720 300',
            'M 180 360 L 460 360',
            'M 1020 360 L 740 360',
            'M 220 580 L 480 420',
            'M 980 580 L 720 420',
          ].map((d, i) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke="rgba(29, 39, 43, 0.14)"
              strokeWidth="1.25"
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={
                active
                  ? { pathLength: 1, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{
                duration: reduced ? 0 : 0.45,
                delay: reduced ? 0 : 0.18 + i * 0.04,
                ease: premiumEase,
              }}
            />
          ))}
        </svg>

        <div className={styles.assignmentHubSlot}>
          <motion.article
            className={styles.assignmentHub}
            initial={reduced ? false : { opacity: 0, scale: 0.96, y: 16 }}
            animate={
              active
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 0.6, scale: 0.98, y: 8 }
            }
            transition={{ duration: reduced ? 0 : 0.4, ease: premiumEase }}
          >
            <p className={styles.hubEyebrow}>Zlecenie</p>
            <h3>{DEMO_ASSIGNMENT.displayName}</h3>
            <p className={styles.hubDate}>{DEMO_ASSIGNMENT.dateLabel}</p>
            <p className={styles.hubMeta}>Folwark Wąsowo</p>
            <p className={styles.hubMeta}>{DEMO_ASSIGNMENT.packageName}</p>
            <p className={styles.hubStatus}>Status: Umowa</p>
          </motion.article>
        </div>

        {MODULES.map((mod, i) => (
          <motion.div
            key={mod.id}
            className={styles.assignmentModule}
            data-pos={mod.pos}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={active ? { opacity: 1, y: 0 } : { opacity: 0.4, y: 8 }}
            transition={{
              duration: reduced ? 0 : DURATION.micro,
              delay: reduced ? 0 : 0.28 + i * 0.07,
              ease: premiumEase,
            }}
          >
            <h4>{mod.title}</h4>
            <p>{mod.detail}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
