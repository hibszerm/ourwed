import { motion, AnimatePresence } from 'framer-motion'
import { DeviceRig } from '@/features/landing-v2/device/DeviceRig'
import { ProductSceneContent } from '@/features/landing-v2/screens/ProductSceneContent'
import { landingV2Copy } from '@/features/landing-v2/copy/landingV2Copy'
import { LANDING_SCROLL_VH } from '@/features/landing-v2/motion/sceneTimings'
import { useLandingTimeline } from '@/features/landing-v2/motion/useLandingTimeline'
import { useIsNarrowLanding } from '@/features/landing-v2/motion/useMedia'
import styles from './CinematicStage.module.css'

type Props = {
  onRegister: () => void
  onLogin: () => void
}

export function CinematicStage({ onRegister, onLogin }: Props) {
  const { triggerRef, pinRef, frame, reduced } = useLandingTimeline()
  const narrow = useIsNarrowLanding()

  return (
    <section
      ref={triggerRef}
      className={styles.runway}
      style={{ height: reduced || narrow ? 'auto' : `${LANDING_SCROLL_VH}vh` }}
      aria-label="OurWed — prezentacja produktu"
    >
      <div ref={pinRef} className={styles.stage}>
        {/* Hero copy */}
        <div
          className={styles.hero}
          style={{
            opacity: reduced || narrow ? 1 : frame.heroOpacity,
            transform:
              reduced || narrow
                ? undefined
                : `translate3d(0, ${(1 - frame.heroOpacity) * -24}px, 0)`,
          }}
        >
          <p className={styles.eyebrow}>{landingV2Copy.heroEyebrow}</p>
          <h1 className={styles.heroTitle}>
            Twój biznes ślubny.
            <br />
            Wreszcie spokojny.
          </h1>
          <p className={styles.heroSub}>{landingV2Copy.heroSub}</p>
          {(reduced || narrow) && (
            <div className={styles.heroActions}>
              <button type="button" className={styles.primary} onClick={onRegister}>
                {landingV2Copy.cta.primary}
              </button>
              <button type="button" className={styles.ghost} onClick={onLogin}>
                {landingV2Copy.cta.secondary}
              </button>
            </div>
          )}
        </div>

        {/* Orbiting scene copy */}
        {!reduced && !narrow ? (
          <AnimatePresence mode="wait">
            {frame.copyOpacity > 0.05 && frame.copyTitle ? (
              <motion.aside
                key={frame.copyTitle}
                className={styles.orbitCopy}
                data-side={frame.copySide}
                initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                animate={{
                  opacity: frame.copyOpacity,
                  y: 0,
                  filter: 'blur(0px)',
                }}
                exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className={styles.orbitTitle}>
                  {frame.copyTitle.split('\n').map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </p>
                {frame.copyBody ? (
                  <p className={styles.orbitBody}>{frame.copyBody}</p>
                ) : null}
              </motion.aside>
            ) : null}
          </AnimatePresence>
        ) : null}

        {/* Device composition */}
        <div className={styles.deviceLayer}>
          <DeviceRig
            vars={{
              lid: reduced || narrow ? 1 : frame.lid,
              morph: reduced || narrow ? (narrow ? 1 : 0) : frame.morph,
              screenOn: reduced || narrow ? 1 : frame.screenOn,
              camRx: reduced || narrow ? 6 : frame.camRx,
              camRy: reduced || narrow ? (narrow ? 0 : -10) : frame.camRy,
              camScale: reduced || narrow ? 1 : frame.camScale,
              camTx: reduced || narrow ? 0 : frame.camTx,
              camTy: reduced || narrow ? 0 : frame.camTy,
              baseOpacity: reduced || narrow ? (narrow ? 0 : 1) : 1 - frame.morph,
              keyboardOpacity:
                reduced || narrow ? (narrow ? 0 : 1) : 1 - frame.morph,
              phoneDetailOpacity: reduced || narrow ? (narrow ? 1 : 0) : frame.morph,
            }}
          >
            <ProductSceneContent
              phase={
                reduced
                  ? 'desktop'
                  : narrow
                    ? 'mobile'
                    : frame.phase === 'cta'
                      ? 'mobile'
                      : frame.phase === 'boot'
                        ? 'boot'
                        : frame.phase
              }
              desktopBeat={frame.desktopBeat}
              contractBeat={frame.contractBeat}
              mobileBeat={frame.mobileBeat}
              navDraw={frame.navDraw}
              checklistDone={frame.checklistDone}
            />
          </DeviceRig>

          {/* Sync dual ghost laptop */}
          {frame.showDual && !reduced && !narrow ? (
            <div
              className={styles.dualLaptop}
              style={{ opacity: 0.25 + frame.syncReveal * 0.55 }}
            >
              <DeviceRig
                vars={{
                  lid: 1,
                  morph: 0,
                  screenOn: 1,
                  camRx: 10,
                  camRy: -14,
                  camScale: 0.72,
                  camTx: 0,
                  camTy: 0,
                }}
              >
                <ProductSceneContent
                  phase="desktop"
                  desktopBeat="tasks"
                  contractBeat="ready"
                  mobileBeat="checklist"
                  navDraw={1}
                  checklistDone
                />
              </DeviceRig>
            </div>
          ) : null}
        </div>

        {/* Final CTA overlay near end */}
        <div
          className={styles.cta}
          style={{
            opacity: reduced || narrow ? 0 : frame.ctaReveal,
            pointerEvents: frame.ctaReveal > 0.5 ? 'auto' : 'none',
          }}
        >
          <h2 className={styles.ctaTitle}>{landingV2Copy.cta.title}</h2>
          <p className={styles.ctaBody}>{landingV2Copy.cta.body}</p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primary} onClick={onRegister}>
              {landingV2Copy.cta.primary}
            </button>
            <button type="button" className={styles.ghost} onClick={onLogin}>
              {landingV2Copy.cta.secondary}
            </button>
          </div>
        </div>

        {!reduced && !narrow && frame.heroOpacity > 0.4 ? (
          <p className={styles.scrollHint}>{landingV2Copy.scrollHint}</p>
        ) : null}
      </div>

      {/* Static readable chapters for reduced / mobile */}
      {(reduced || narrow) && (
        <div className={styles.staticChapters}>
          {landingV2Copy.desktop.map((item) => (
            <article key={item.id} className={styles.staticCard}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
          <article className={styles.staticCard}>
            <h3>{landingV2Copy.contract.title}</h3>
            <p>{landingV2Copy.contract.body}</p>
          </article>
          {landingV2Copy.mobile.map((item) => (
            <article key={item.id} className={styles.staticCard}>
              <h3>{item.title}</h3>
            </article>
          ))}
          <article className={styles.staticCard}>
            <h3>{landingV2Copy.cta.title}</h3>
            <p>{landingV2Copy.cta.body}</p>
            <div className={styles.heroActions}>
              <button type="button" className={styles.primary} onClick={onRegister}>
                {landingV2Copy.cta.primary}
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
