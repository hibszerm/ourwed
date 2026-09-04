import { useCallback, useEffect, useRef } from 'react'
import type { MotionStyle, MotionValue } from 'framer-motion'
import { motion, useMotionValue } from 'framer-motion'
import { applyHeroDemoThemeToElement } from '@/features/landing-v2/hero/heroDemoThemeInterpolation'
import {
  IconBell,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconDashboard,
  IconFinances,
  IconInbox,
  IconMapPin,
  IconSessions,
  IconTasks,
  IconWeddings,
} from '@/components/icons'
import { HERO_MODERN_DEMO } from '@/features/landing-v2/hero/heroModernDemoData'
import styles from './HeroModernDashboard.module.css'

const NAV_ICONS = {
  dashboard: IconDashboard,
  notifications: IconBell,
  finances: IconFinances,
  weddings: IconWeddings,
  sessions: IconSessions,
  calendar: IconCalendar,
  tasks: IconTasks,
  pending: IconInbox,
  questionnaires: IconClipboard,
} as const

export type HeroModernRevealStyles = {
  shell?: MotionStyle
  greeting?: MotionStyle
  nearest?: MotionStyle
  upcomingLabel?: MotionStyle
  upcoming0?: MotionStyle
  upcoming1?: MotionStyle
  upcoming2?: MotionStyle
  today?: MotionStyle
  notifications?: MotionStyle
  deadlines?: MotionStyle
}

type Props = {
  compact?: boolean
  /** When true, all modules fully visible (reduced motion / end state). */
  revealComplete?: boolean
  reveal?: HeroModernRevealStyles
  /** Scroll-driven Light → Graphite interpolation (0 = light, 1 = graphite). */
  themeProgress?: MotionValue<number>
  /** Static theme when scroll theater is off (0 = light, 1 = graphite). */
  themeStatic?: number
}

/**
 * Marketing-local static reconstruction of the current Modern Pulpit
 * (Dashboard V3) in Graphite tokens. Zero auth/DB/mutation.
 *
 * Fixed internal design width preserves Modern proportional system;
 * the Hero stage crops/sizes the canvas as one unit.
 */
export function HeroModernDashboard({
  compact = false,
  revealComplete = false,
  reveal,
  themeProgress,
  themeStatic = 0,
}: Props) {
  const demo = HERO_MODERN_DEMO
  const unread = demo.notifications.filter((n) => n.unread).length
  const show = revealComplete || !reveal
  const rootRef = useRef<HTMLDivElement | null>(null)
  const fallbackThemeMv = useMotionValue(themeStatic)

  const bindRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      if (!node) return
      const t = themeProgress ? themeProgress.get() : themeStatic
      applyHeroDemoThemeToElement(node, t)
    },
    [themeProgress, themeStatic],
  )

  useEffect(() => {
    if (themeProgress) return
    fallbackThemeMv.set(themeStatic)
    if (rootRef.current) applyHeroDemoThemeToElement(rootRef.current, themeStatic)
  }, [themeProgress, themeStatic, fallbackThemeMv])

  useEffect(() => {
    if (!themeProgress) return
    const apply = (t: number) => {
      if (rootRef.current) applyHeroDemoThemeToElement(rootRef.current, t)
    }
    apply(themeProgress.get())
    return themeProgress.on('change', apply)
  }, [themeProgress])

  return (
    <div
      ref={bindRootRef}
      className={styles.root}
      data-testid="lv2-hero-modern-dashboard"
      data-hero-modern-graphite=""
      data-compact={compact ? 'true' : 'false'}
      data-reveal-complete={show ? 'true' : 'false'}
    >
      <motion.aside
        className={styles.sidebar}
        style={show ? undefined : reveal?.shell}
        aria-hidden
      >
        <div className={styles.logo}>
          <span className={styles.logoMark}>OW</span>
          <span className={styles.logoText}>OurWed</span>
        </div>
        <nav className={styles.nav}>
          {demo.nav.map((item) => {
            const Icon = NAV_ICONS[item.id as keyof typeof NAV_ICONS]
            return (
              <span
                key={item.id}
                className={item.active ? styles.navActive : styles.navItem}
              >
                {Icon ? <Icon width={18} height={18} aria-hidden /> : null}
                <span className={styles.navLabel}>{item.label}</span>
              </span>
            )
          })}
        </nav>
      </motion.aside>

      <div className={styles.main}>
        <motion.header
          className={styles.greeting}
          style={show ? undefined : reveal?.greeting}
        >
          <p className={styles.greetingLine}>{demo.greeting}</p>
          <p className={styles.greetingName}>{demo.userName}</p>
        </motion.header>

        <div className={styles.layout}>
          <motion.section
            className={`${styles.nearest} ${styles.materialHero}`}
            data-testid="lv2-modern-nearest"
            style={show ? undefined : reveal?.nearest}
          >
            <div className={styles.dateBlock} aria-hidden>
              <span className={styles.dateDay}>{demo.nearest.day}</span>
              <span className={styles.dateMonth}>{demo.nearest.month}</span>
              <span className={styles.dateWeek}>{demo.nearest.weekday}</span>
            </div>

            <div className={styles.nearestBody}>
              <p className={styles.eyebrow}>Najbliższe zlecenie</p>
              <div className={styles.typeRow}>
                <span className={`${styles.typeChip} ${styles.overlay}`}>
                  {demo.nearest.typeLabel}
                </span>
              </div>
              <p className={styles.coupleName}>{demo.nearest.coupleName}</p>
              <div className={styles.chips}>
                <span className={`${styles.chip} ${styles.overlay}`}>
                  {demo.nearest.time}
                </span>
                <span className={`${styles.chip} ${styles.overlay}`}>
                  <IconMapPin width={13} height={13} aria-hidden />
                  <span>{demo.nearest.location}</span>
                </span>
              </div>
              <span className={styles.cta}>Otwórz</span>
            </div>

            <div className={styles.countdown} aria-hidden>
              <span className={styles.countdownDesktop}>
                <span className={styles.dateDay}>
                  {demo.nearest.countdown.value}
                </span>
                <span className={styles.dateMonth}>
                  {demo.nearest.countdown.unit}
                </span>
                <span className={styles.dateWeek}>
                  {demo.nearest.countdown.caption}
                </span>
              </span>
              <span className={styles.countdownMobile}>
                {demo.nearest.countdown.mobileRelative}
              </span>
            </div>
          </motion.section>

          <motion.p
            className={styles.upcomingLabel}
            style={show ? undefined : reveal?.upcomingLabel}
          >
            Kolejne zlecenia
          </motion.p>

          <div className={styles.upcoming} data-testid="lv2-modern-upcoming">
            <div className={styles.upcomingGrid}>
              {demo.upcoming.map((item, index) => {
                const cardStyle =
                  index === 0
                    ? reveal?.upcoming0
                    : index === 1
                      ? reveal?.upcoming1
                      : reveal?.upcoming2
                return (
                  <motion.div
                    key={item.id}
                    className={`${styles.upcomingCard} ${styles.materialCard}`}
                    style={show ? undefined : cardStyle}
                  >
                    <div className={styles.upcomingDate} aria-hidden>
                      <span className={styles.upcomingDay}>{item.day}</span>
                      <span className={styles.upcomingMonth}>{item.month}</span>
                    </div>
                    <div className={styles.upcomingContent}>
                      <div className={styles.upcomingTop}>
                        <span className={styles.upcomingType}>
                          {item.typeLabel}
                        </span>
                        <span className={styles.upcomingRelative}>
                          {item.relative}
                        </span>
                      </div>
                      <p className={styles.upcomingName}>{item.coupleName}</p>
                      <p className={styles.upcomingTime}>{item.time}</p>
                      <p className={styles.upcomingLocation}>
                        <IconMapPin width={13} height={13} aria-hidden />
                        <span>{item.location}</span>
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          <motion.section
            className={`${styles.today} ${styles.materialOperational}`}
            data-testid="lv2-modern-today"
            style={show ? undefined : reveal?.today}
          >
            <header className={styles.panelHeader}>
              <span className={`${styles.horizonLabel} ${styles.overlay}`}>
                Dziś
              </span>
              <span className={styles.taskCount}>{demo.tasks.length}</span>
            </header>
            <ul className={styles.taskList}>
              {demo.tasks.slice(0, 2).map((task) => (
                <li key={task.id} className={styles.taskRow}>
                  <span className={styles.taskCheck} aria-hidden>
                    <IconCheck width={12} height={12} className={styles.checkIcon} />
                  </span>
                  <div className={styles.taskCopy}>
                    <p className={styles.taskCouple}>{task.meta}</p>
                    <p className={styles.taskTitle}>{task.title}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className={styles.taskMore}>+1 kolejne</p>
          </motion.section>

          <div className={styles.feed}>
            <motion.section
              className={`${styles.notifications} ${styles.materialSupporting}`}
              data-testid="lv2-modern-notifications"
              style={show ? undefined : reveal?.notifications}
            >
              <header className={styles.notifHeader}>
                <p className={styles.panelTitle}>Powiadomienia</p>
                <p className={styles.notifSubtitle}>
                  {unread > 0
                    ? `${unread} nieprzeczytane`
                    : 'Wszystko przeczytane'}
                </p>
              </header>
              <ul className={styles.notifList}>
                {demo.notifications.map((item) => (
                  <li key={item.id}>
                    <div
                      className={`${styles.notifItem}${item.unread ? ` ${styles.notifUnread}` : ''}`}
                    >
                      <span
                        className={`${styles.notifIcon} ${styles[`notif_${item.type}`]}`}
                      >
                        <IconBell width={13} height={13} />
                      </span>
                      <div className={styles.notifContent}>
                        <div className={styles.notifTop}>
                          <p className={styles.notifTitle}>{item.title}</p>
                          <time className={styles.notifDate}>{item.date}</time>
                        </div>
                        <p className={styles.notifMessage}>{item.message}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className={styles.notifFooter}>
                <span className={styles.seeAll}>Zobacz wszystkie</span>
              </div>
            </motion.section>
          </div>

          <motion.section
            className={`${styles.deadlines} ${styles.materialOperational}`}
            data-testid="lv2-modern-deadlines"
            style={show ? undefined : reveal?.deadlines}
          >
            <header className={styles.notifHeader}>
              <p className={styles.panelTitle}>Terminy oddania</p>
              <span className={styles.deadlineCount}>
                {demo.deadlines.length}
              </span>
            </header>
            <ul className={styles.deadlineList}>
              {demo.deadlines.map((item) => (
                <li key={item.id}>
                  <div
                    className={`${styles.deadlineRow}${item.nearest ? ` ${styles.deadlineNearest}` : ''}`}
                  >
                    <span className={styles.deadlineMarker} aria-hidden>
                      <span className={styles.deadlineDay}>{item.day}</span>
                      <span className={styles.deadlineMonth}>{item.month}</span>
                    </span>
                    <span className={styles.deadlineBody}>
                      <span className={styles.deadlineName}>{item.title}</span>
                      <span className={styles.deadlineDue}>{item.dueLabel}</span>
                    </span>
                    <span className={styles.deadlineRelative}>
                      {item.contextLabel}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>
      </div>
    </div>
  )
}
