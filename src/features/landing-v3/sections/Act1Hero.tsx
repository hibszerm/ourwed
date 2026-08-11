import { motion, useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import { DEMO_CAPABILITY_LINE } from '@/features/landing-v3/data/demoData'
import { DashboardDemo } from '@/features/landing-v3/product/DashboardDemo'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

/** Accepted hero copy + exact desktop dashboard product mockup (scaled on mobile). */
export function Act1Hero() {
  const reduced = useReducedMotion()

  return (
    <section
      className={styles.actHero}
      data-act="enter"
      data-motion="hero"
      aria-labelledby="lv3-hero-title"
    >
      <div className={styles.heroCopyBlock}>
        <div className={styles.heroMask}>
          <motion.h1
            id="lv3-hero-title"
            className={styles.heroTitle}
            initial={reduced ? false : { y: '108%' }}
            animate={{ y: '0%' }}
            transition={{ duration: 1, ease: premiumEase, delay: 0.06 }}
          >
            Obsługa zleceń ślubnych
            <br />
            bez chaosu.
          </motion.h1>
        </div>

        <motion.p
          className={styles.heroSupport}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: DURATION.scene, ease: premiumEase }}
        >
          Umowy, ankiety, płatności, plan dnia i kalendarze — w jednym systemie
          dla fotografów, filmowców i content creatorów.
        </motion.p>

        <motion.div
          className={styles.heroCtas}
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: DURATION.state, ease: premiumEase }}
        >
          <LandingButton to="/register" variant="primary">
            Załóż bezpłatne konto
          </LandingButton>
          <LandingButton href="#produkt" variant="secondary">
            Zobacz produkt
          </LandingButton>
        </motion.div>
        <motion.p
          className={styles.heroMicro}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: DURATION.micro }}
        >
          Bez karty płatniczej.
        </motion.p>
      </div>

      <motion.div
        className={styles.heroDashboard}
        data-hero-product-canvas=""
        initial={reduced ? false : { opacity: 0, y: 72 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: DURATION.heroMorph, ease: premiumEase }}
      >
        <DesktopCompositionScale composition="hero">
          <DashboardDemo variant="hero" focusNearest />
        </DesktopCompositionScale>
      </motion.div>

      <p className={styles.capabilityLine} data-testid="lv3-capability-line">
        {DEMO_CAPABILITY_LINE}
      </p>
    </section>
  )
}
