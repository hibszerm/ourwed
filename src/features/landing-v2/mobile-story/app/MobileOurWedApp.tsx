import { useEffect, useLayoutEffect, useRef } from 'react'
import { motion, motionValue, useTransform, type MotionValue } from 'framer-motion'
import { IconMenu } from '@/components/icons'
import { MobileDashboardDemo } from '@/features/landing-v2/mobile-story/app/screens/MobileDashboardDemo'
import { MobileCompactAssignmentBar } from '@/features/landing-v2/mobile-story/app/screens/MobileCompactAssignmentBar'
import { MobileWeddingDayDemo } from '@/features/landing-v2/mobile-story/app/screens/MobileWeddingDayDemo'
import { MobileNavigationDemo } from '@/features/landing-v2/mobile-story/app/screens/MobileNavigationDemo'
import { MobileOfflineBriefDemo } from '@/features/landing-v2/mobile-story/app/screens/MobileOfflineBriefDemo'
import { mobileOurWedDemo } from '@/features/landing-v2/mobile-story/app/data/mobileOurWedDemoData'
import {
  briefEnterYAt,
  briefOpenAt,
  briefPaperScaleAt,
  cardFocusAt,
  dashHandoffYAt,
  dashOpacityAt,
  dashScrollYAt,
  dayHandoffYAt,
  dayOpacityAt,
  dayScrollYAt,
  mapLayerOpacityAt,
  nawigujPressAt,
  navExitYAt,
  weddingOpenAt,
} from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'
import { compactBarOpacityAt } from '@/features/landing-v2/mobile-story/app/motion/mobileDashboardCollapse'
import {
  dashboardMaxScrollMv,
  measureDashboardScrollGeometry,
  publishDashboardMaxScroll,
} from '@/features/landing-v2/mobile-story/app/motion/mobileDashboardScrollGeometry'
import {
  measureWeddingDayScrollGeometry,
  publishWeddingDayMaxScroll,
  weddingDayMaxScrollMv,
} from '@/features/landing-v2/mobile-story/app/motion/mobileWeddingDayScrollGeometry'
import styles from './MobileOurWedApp.module.css'

type Props = {
  appProgress: MotionValue<number>
  staticMode?: boolean
}

const STATIC_OPEN = motionValue(1)

/**
 * Isolated OurWed mobile app — shared shell + screens.
 * Phase 6G: Dashboard → Wedding Day → Navigation → Brief (no day return).
 */
export function MobileOurWedApp({ appProgress, staticMode = false }: Props) {
  if (staticMode) {
    return (
      <div className={styles.root} data-mobile-app="static">
        <div className={styles.shell} data-mobile-app-shell="">
          <header className={styles.topBar} data-mobile-app-topbar="" data-mobile-shell-header="">
            <span className={styles.menuBtn} aria-hidden>
              <IconMenu width={18} height={18} />
            </span>
            <div className={styles.identity}>
              <p className={styles.greeting}>{mobileOurWedDemo.greeting.salutation}</p>
              <p className={styles.name}>{mobileOurWedDemo.greeting.name}</p>
            </div>
          </header>
          <div className={styles.viewport} data-mobile-app-viewport="">
            <div className={styles.layer} data-mobile-app-layer="day">
              <MobileWeddingDayDemo nawigujPress={STATIC_OPEN} />
            </div>
            <div className={styles.briefStatic} data-mobile-brief-sheet="static">
              <MobileOfflineBriefDemo openT={STATIC_OPEN} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <MobileOurWedAppScroll appProgress={appProgress} />
}

function MobileOurWedAppScroll({ appProgress }: { appProgress: MotionValue<number> }) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dashOp = useTransform(appProgress, (p) => dashOpacityAt(p))
  const dashScrollY = useTransform(
    [appProgress, dashboardMaxScrollMv],
    ([p, max]) => dashScrollYAt(Number(p), Number(max)),
  )
  const dashHandY = useTransform(appProgress, (p) => dashHandoffYAt(p))
  const dashY = useTransform([dashScrollY, dashHandY], ([s, h]) => Number(s) + Number(h))
  const focusT = useTransform(appProgress, (p) => cardFocusAt(p))
  const dayOp = useTransform(appProgress, (p) => dayOpacityAt(p))
  const dayHandY = useTransform(appProgress, (p) => dayHandoffYAt(p))
  const dayScrollY = useTransform(
    [appProgress, weddingDayMaxScrollMv],
    ([p, max]) => dayScrollYAt(Number(p), Number(max)),
  )
  const dayY = useTransform([dayHandY, dayScrollY], ([h, s]) => Number(h) + Number(s))
  const nawiguj = useTransform(appProgress, (p) => nawigujPressAt(p))
  const mapOp = useTransform(appProgress, (p) => mapLayerOpacityAt(p))
  const navY = useTransform(appProgress, (p) => navExitYAt(p))
  const brief = useTransform(appProgress, (p) => briefOpenAt(p))
  const briefEnterY = useTransform(appProgress, (p) => briefEnterYAt(p))
  const briefScale = useTransform(appProgress, (p) => briefPaperScaleAt(p))
  const compactOp = useTransform(
    [appProgress, dashboardMaxScrollMv],
    ([p, max]) => compactBarOpacityAt(Number(p), Number(max)),
  )
  const contextRef = useRef<HTMLParagraphElement | null>(null)
  const identityRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return

    let frame = 0
    const measure = () => {
      const dashContent = viewport.querySelector<HTMLElement>('[data-mobile-dashboard-content]')
      const dashLast = viewport.querySelector<HTMLElement>('[data-mobile-dashboard-last-section]')
      if (dashContent && dashLast) {
        const geo = measureDashboardScrollGeometry(viewport, dashContent, dashLast)
        publishDashboardMaxScroll(geo.maxScroll)
        viewport.dataset.dashboardMaxScroll = String(geo.maxScroll)
        viewport.dataset.dashboardContentExtent = String(geo.contentExtent)
        viewport.dataset.dashboardViewportHeight = String(geo.viewportHeight)
      }

      const dayContent = viewport.querySelector<HTMLElement>('[data-mobile-wedding-day-content]')
      const dayLast = viewport.querySelector<HTMLElement>(
        '[data-mobile-wedding-day-last-section]',
      )
      if (dayContent && dayLast) {
        const geo = measureWeddingDayScrollGeometry(viewport, dayContent, dayLast)
        publishWeddingDayMaxScroll(geo.maxScroll)
        viewport.dataset.weddingDayMaxScroll = String(geo.maxScroll)
        viewport.dataset.weddingDayContentExtent = String(geo.contentExtent)
      }
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(viewport)
    const dashContent = viewport.querySelector('[data-mobile-dashboard-content]')
    if (dashContent) ro.observe(dashContent)
    const dayContent = viewport.querySelector('[data-mobile-wedding-day-content]')
    if (dayContent) ro.observe(dayContent)

    void document.fonts?.ready?.then(schedule)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const apply = (p: number) => {
      const onDash = weddingOpenAt(p) < 0.45 && briefOpenAt(p) < 0.4 && mapLayerOpacityAt(p) < 0.4
      if (identityRef.current) {
        identityRef.current.dataset.mode = onDash ? 'greeting' : 'context'
      }
      const el = contextRef.current
      if (!el) return
      if (briefOpenAt(p) > 0.4) el.textContent = 'Brief'
      else if (mapLayerOpacityAt(p) > 0.4) el.textContent = 'Nawigacja'
      else if (weddingOpenAt(p) > 0.5) el.textContent = 'Tryb dnia ślubu'
      else el.textContent = ''
    }
    apply(appProgress.get())
    return appProgress.on('change', apply)
  }, [appProgress])

  return (
    <div className={styles.root} data-mobile-app="scroll">
      <div className={styles.shell} data-mobile-app-shell="">
        <header className={styles.topBar} data-mobile-app-topbar="" data-mobile-shell-header="">
          <span className={styles.menuBtn} aria-hidden>
            <IconMenu width={18} height={18} />
          </span>
          <div ref={identityRef} className={styles.identity} data-mode="greeting">
            <div className={styles.greetingBlock} data-mobile-greeting="">
              <p className={styles.greeting}>{mobileOurWedDemo.greeting.salutation}</p>
              <p className={styles.name}>{mobileOurWedDemo.greeting.name}</p>
            </div>
            <p ref={contextRef} className={styles.contextTitle} />
          </div>
          <MobileCompactAssignmentBar opacity={compactOp} />
        </header>
        <div
          ref={viewportRef}
          className={styles.viewport}
          data-mobile-app-viewport=""
          data-mobile-dashboard-viewport=""
        >
          <motion.div
            className={styles.layer}
            data-mobile-app-layer="dashboard"
            style={{ opacity: dashOp, y: dashY }}
          >
            <MobileDashboardDemo focusT={focusT} />
          </motion.div>

          <motion.div
            className={styles.layer}
            data-mobile-app-layer="day"
            style={{ opacity: dayOp, y: dayY }}
          >
            <MobileWeddingDayDemo nawigujPress={nawiguj} />
          </motion.div>

          <motion.div className={styles.navLayer} style={{ y: navY }}>
            <MobileNavigationDemo appProgress={appProgress} opacity={mapOp} />
          </motion.div>

          <MobileOfflineBriefDemo
            openT={brief}
            enterY={briefEnterY}
            paperScale={briefScale}
          />
        </div>
      </div>
    </div>
  )
}
