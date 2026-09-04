import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  SETTINGS_NAV_GROUPS,
  getSettingsNavGroup,
  getSettingsPrimaryHref,
  getSettingsPrimaryLabel,
  isSettingsPrimaryExactPage,
  normalizeSettingsPath,
  shouldShowSettingsSecondaryNav,
} from './settingsNav'
import styles from './SettingsLayout.module.css'

function scrollActiveIntoView(node: HTMLElement | null) {
  if (!node) return
  const scroller = node.closest('ul')
  if (!(scroller instanceof HTMLElement)) {
    node.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    return
  }

  const padding = 4
  const tab = node.getBoundingClientRect()
  const track = scroller.getBoundingClientRect()
  const overflowLeft = tab.left - (track.left + padding)
  const overflowRight = tab.right - (track.right - padding)
  if (overflowLeft < 0) {
    scroller.scrollLeft += overflowLeft
  } else if (overflowRight > 0) {
    scroller.scrollLeft += overflowRight
  }
}

export function SettingsPrimaryNavigation() {
  const location = useLocation()
  const path = normalizeSettingsPath(location.pathname)
  const activeGroup = getSettingsNavGroup(path)
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    scrollActiveIntoView(activeRef.current)
  }, [path])

  return (
    <nav
      className={styles.primaryNav}
      aria-label="Kategorie ustawień"
      data-testid="settings-primary-nav"
    >
      <ul className={styles.primaryList}>
        {SETTINGS_NAV_GROUPS.map((group) => {
          const href = getSettingsPrimaryHref(group)
          const active = activeGroup?.id === group.id
          const current = active
            ? isSettingsPrimaryExactPage(group)
              ? 'page'
              : 'true'
            : undefined

          return (
            <li key={group.id}>
              <Link
                ref={active ? activeRef : undefined}
                to={href}
                aria-current={current}
                className={`${styles.primaryItem} ${active ? styles.primaryItemActive : ''}`}
              >
                {getSettingsPrimaryLabel(group)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function SettingsSecondaryNavigation() {
  const location = useLocation()
  const path = normalizeSettingsPath(location.pathname)
  const activeGroup = getSettingsNavGroup(path)
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    scrollActiveIntoView(activeRef.current)
  }, [path])

  if (!shouldShowSettingsSecondaryNav(activeGroup)) return null

  return (
    <nav
      className={styles.secondaryNav}
      aria-label={activeGroup.label}
      data-testid="settings-secondary-nav"
    >
      <ul className={styles.secondaryList}>
        {activeGroup.destinations.map((destination) => (
          <li key={destination.path}>
            <NavLink
              ref={destination.path === path ? activeRef : undefined}
              to={destination.path}
              end
              className={({ isActive }) =>
                `${styles.secondaryItem} ${isActive ? styles.secondaryItemActive : ''}`
              }
            >
              {destination.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** @deprecated Use SettingsPrimaryNavigation — kept as a named export for the shell index. */
export function SettingsNavigation() {
  return <SettingsPrimaryNavigation />
}
