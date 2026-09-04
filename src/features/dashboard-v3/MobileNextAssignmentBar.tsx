import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconChevronRight } from '@/components/icons'
import type { CalendarUiEvent } from '@/features/calendar/utils/calendarEvents'
import {
  compactAssignmentMonogram,
  dashboardAssignmentRelativeLabel,
  resolveCompactAssignmentVisibility,
} from './dashboardV3AssignmentPresentation'
import styles from './MobileNextAssignmentBar.module.css'

const MOBILE_DASHBOARD_QUERY = '(max-width: 767px)'
export const MOBILE_NEXT_ASSIGNMENT_SENTINEL_ID =
  'dashboard-v3-nearest-assignment-sentinel'

interface MobileNextAssignmentBarProps {
  assignment: CalendarUiEvent | null
}

/**
 * Mobile-only compact continuation of the expanded hero.
 * IntersectionObserver performs one binary state change at the hero boundary;
 * there is no scroll listener, per-pixel React state, or shared-element morph.
 * The outer reveal viewport keeps final geometry; only the inner bar moves.
 */
export function MobileNextAssignmentBar({
  assignment,
}: MobileNextAssignmentBarProps) {
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)

  useEffect(() => {
    if (!assignment || typeof window === 'undefined') return

    const mobile = window.matchMedia(MOBILE_DASHBOARD_QUERY)
    let observer: IntersectionObserver | null = null
    let orientationFrame: number | null = null

    const setStableActive = (next: boolean) => {
      if (activeRef.current === next) return
      activeRef.current = next
      setActive(next)
    }

    const stop = () => {
      observer?.disconnect()
      observer = null
    }

    const start = () => {
      stop()
      if (!mobile.matches || !('IntersectionObserver' in window)) return

      const sentinel = document.getElementById(
        MOBILE_NEXT_ASSIGNMENT_SENTINEL_ID,
      )
      if (!sentinel) return

      const shellHeader = document.querySelector<HTMLElement>(
        '[data-mobile-shell-header]',
      )
      const shellHeight = Math.ceil(
        shellHeader?.getBoundingClientRect().height ?? 60,
      )

      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          const thresholdTop = entry.rootBounds?.top ?? shellHeight
          setStableActive(
            resolveCompactAssignmentVisibility({
              active: activeRef.current,
              isIntersecting: entry.isIntersecting,
              intersectionRatio: entry.intersectionRatio,
              sentinelTop: entry.boundingClientRect.top,
              sentinelBottom: entry.boundingClientRect.bottom,
              thresholdTop,
            }),
          )
        },
        {
          root: null,
          rootMargin: `-${shellHeight}px 0px 0px 0px`,
          threshold: [0, 0.99],
        },
      )
      observer.observe(sentinel)
    }

    const handleMediaChange = () => {
      if (mobile.matches) {
        start()
      } else {
        stop()
        setStableActive(false)
      }
    }

    const handleOrientationChange = () => {
      if (orientationFrame != null) {
        window.cancelAnimationFrame(orientationFrame)
      }
      orientationFrame = window.requestAnimationFrame(start)
    }

    start()
    mobile.addEventListener('change', handleMediaChange)
    window.addEventListener('orientationchange', handleOrientationChange)
    return () => {
      mobile.removeEventListener('change', handleMediaChange)
      window.removeEventListener(
        'orientationchange',
        handleOrientationChange,
      )
      if (orientationFrame != null) {
        window.cancelAnimationFrame(orientationFrame)
      }
      observer?.disconnect()
    }
  }, [assignment])

  if (!assignment) return null

  const relative = dashboardAssignmentRelativeLabel(assignment.dateKey)

  return (
    <div
      className={styles.sticky}
      data-active={active ? 'true' : 'false'}
      data-testid="dashboard-mobile-next-assignment"
      aria-hidden={!active}
    >
      <Link
        to={assignment.href}
        className={styles.bar}
        tabIndex={active ? 0 : -1}
        aria-label={`${assignment.assignmentTypeLabel}: ${assignment.title}, ${relative}`}
      >
        <span className={styles.typeCue} aria-hidden>
          {compactAssignmentMonogram(assignment.title)}
        </span>
        <span className={styles.identity}>
          <span className={styles.name}>{assignment.title}</span>
          <span className={styles.meta}>
            {assignment.assignmentTypeLabel} · {relative}
          </span>
        </span>
        <IconChevronRight className={styles.chevron} aria-hidden />
      </Link>
    </div>
  )
}
