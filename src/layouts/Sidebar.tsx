import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { OVERLAY_FOCUSABLE } from '@/components/ui/overlay/useOverlay'
import { isSettingsNavRoute } from '@/features/settings/settingsNav'
import {
  IconBell,
  IconCalendar,
  IconClipboard,
  IconClose,
  IconCog,
  IconCompass,
  IconDashboard,
  IconFinances,
  IconInbox,
  IconSessions,
  IconSettings,
  IconTasks,
  IconWeddings,
} from '@/components/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { SidebarSubscriptionBlock } from '@/features/billing/SidebarSubscriptionBlock'
import { useProAccessGate } from '@/features/billing/ProAccessGate'
import { shouldAnimateGuideCompass } from '@/features/onboarding/guide/guideDiscoveryRules'
import { useGuideIntegrationPreference } from '@/features/onboarding/guide/useGuideIntegrationPreference'
import {
  isGuidePreparationComplete,
  studioPackagesSetupSignalsQueryKey,
} from '@/features/onboarding/setup/setupGuidanceReadiness'
import { useUnreadNotificationCount } from '@/features/notifications/useNotifications'
import { packageService } from '@/lib/api/packageService'
import { sidebarSubscriptionCopy } from '@/lib/billing/entitlement'
import type { AppShellPresentation } from './shellPresentation'
import styles from './Sidebar.module.css'
import catalogStyles from '@/features/studio/StudioCatalog.module.css'

type SidebarNavItem = {
  to: string
  label: string
  icon: typeof IconDashboard
  end?: boolean
}

const navItems: SidebarNavItem[] = [
  { to: '/dashboard', label: 'Pulpit', icon: IconDashboard, end: true },
  { to: '/powiadomienia', label: 'Powiadomienia', icon: IconBell, end: true },
  { to: '/finanse', label: 'Finanse', icon: IconFinances, end: true },
  { to: '/sluby', label: 'Śluby', icon: IconWeddings },
  { to: '/sesje', label: 'Sesje', icon: IconSessions },
  { to: '/kalendarz', label: 'Kalendarz', icon: IconCalendar },
  { to: '/zadania', label: 'Zadania', icon: IconTasks, end: true },
  { to: '/oczekujace', label: 'Oczekujące', icon: IconInbox },
]

/** Match /ankiety and all authenticated Ankiety subroutes. */
const questionnaireItems = [
  { to: '/ankiety', label: 'Ankiety', icon: IconClipboard, end: false },
]

const companyItems = [
  { to: '/studio/pakiety', label: 'Pakiety', icon: IconSettings },
  {
    to: '/studio/uslugi',
    label: 'Usługi dodatkowe',
    icon: IconSettings,
  },
]

const mobilePrimaryPaths = new Set([
  '/dashboard',
  '/sluby',
  '/kalendarz',
  '/zadania',
])
const mobilePrimaryItems = navItems.filter((item) =>
  mobilePrimaryPaths.has(item.to),
)
const mobileCurrentItems = [
  '/powiadomienia',
  '/sesje',
  '/oczekujace',
  '/finanse',
].flatMap((path) => {
  const item = navItems.find((candidate) => candidate.to === path)
  return item ? [item] : []
})
const mobileStudioBaseItems: SidebarNavItem[] = [
  ...questionnaireItems,
  ...companyItems,
]

const przewodnikNavItem: SidebarNavItem = {
  to: '/przewodnik',
  label: 'Przewodnik',
  icon: IconCompass,
  end: true,
}

function subscribePrefersReducedMotion(onChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getPrefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface SidebarProps {
  id?: string
  open?: boolean
  onClose?: () => void
  onNavigate?: () => void
  presentation?: AppShellPresentation
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function Sidebar({
  id,
  open = false,
  onClose,
  onNavigate,
  presentation = 'default',
  returnFocusRef,
}: SidebarProps) {
  const { logout, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const settingsActive = isSettingsNavRoute(location.pathname)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(max-width: 767px)').matches,
  )
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  const { preference: guidePreference } = useGuideIntegrationPreference()
  const studioAuthId = useStudioAuthId()
  const prefersReducedMotion = useSyncExternalStore(
    subscribePrefersReducedMotion,
    getPrefersReducedMotion,
    () => false,
  )
  const guideRouteActive =
    location.pathname === '/przewodnik' ||
    location.pathname.startsWith('/przewodnik/')
  const showGuideNav = guidePreference.sidebarVisible
  // Same setup-signals query as Przewodnik “Przygotuj OurWed” (shared key).
  const setupSignalsQuery = useQuery({
    queryKey: studioPackagesSetupSignalsQueryKey(studioAuthId),
    queryFn: () => packageService.listSetupSignals(),
    enabled: Boolean(studioAuthId) && showGuideNav,
    staleTime: 60_000,
  })
  const preparationComplete =
    setupSignalsQuery.isSuccess &&
    isGuidePreparationComplete(setupSignalsQuery.data)
  const animateGuideCompass = shouldAnimateGuideCompass({
    preference: guidePreference,
    isGuideRouteActive: guideRouteActive,
    prefersReducedMotion,
    isGuidePreparationComplete: preparationComplete,
  })
  const mobileStudioItems: SidebarNavItem[] = showGuideNav
    ? [...mobileStudioBaseItems, przewodnikNavItem]
    : mobileStudioBaseItems


  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!isMobile || !open) return

    previouslyFocusedRef.current =
      returnFocusRef?.current ??
      (document.activeElement as HTMLElement | null)
    const focusId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(OVERLAY_FOCUSABLE),
      ).filter(
        (element) =>
          element.tabIndex !== -1 &&
          !element.hasAttribute('disabled') &&
          element.getClientRects().length > 0,
      )

      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(focusId)
      document.removeEventListener('keydown', onKeyDown, true)
      const returnTarget = previouslyFocusedRef.current
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus())
      }
    }
  }, [isMobile, open, returnFocusRef])

  const { data: studioUser } = useCurrentStudioUser()
  const { entitlement, loading: subscriptionLoading, error: subscriptionError } =
    useProAccessGate()

  const displayName = studioUser?.displayName ?? ''
  const displayRole = user?.role ?? ''
  const avatarLetter = (studioUser?.initials ?? displayName).charAt(0).toUpperCase() || '—'
  const planCopy =
    entitlement && !subscriptionLoading && !subscriptionError
      ? sidebarSubscriptionCopy(entitlement)
      : null
  const planLine = planCopy
    ? planCopy.subtitle
      ? `${planCopy.title} · ${planCopy.subtitle}`
      : planCopy.title
    : subscriptionError
      ? 'Nie udało się sprawdzić statusu.'
      : null

  async function handleLogout() {
    onNavigate?.()
    await logout()
    navigate('/', { replace: true })
  }

  const drawerClosed = isMobile && !open

  function renderMobileNavItem(
    item: SidebarNavItem,
    className: string,
  ) {
    const Icon = item.icon
    const isGuide = item.to === '/przewodnik'
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          [
            styles.mobileNavItem,
            className,
            isActive ? styles.mobileActive : '',
            isGuide && animateGuideCompass ? styles.guideAttention : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
        data-guide-attention={
          isGuide && animateGuideCompass ? 'true' : undefined
        }
      >
        <Icon className={styles.mobileNavIcon} />
        <span className={styles.mobileNavLabel}>{item.label}</span>
        {item.to === '/powiadomienia' && unreadCount > 0 ? (
          <span
            className={styles.navBadge}
            aria-label={`${unreadCount} nieprzeczytane powiadomienia`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </NavLink>
    )
  }

  return (
    <aside
      id={id}
      ref={panelRef}
      className={`${styles.sidebar}${presentation === 'v3' && !isMobile ? ' v3MaterialDarkGlass' : ''}`}
      data-open={open ? 'true' : 'false'}
      data-presentation={presentation === 'v3' ? 'v3' : undefined}
      role={isMobile ? 'dialog' : undefined}
      aria-modal={isMobile && open ? true : undefined}
      aria-label={isMobile ? 'Menu aplikacji' : undefined}
      aria-hidden={drawerClosed}
      inert={drawerClosed ? true : undefined}
      tabIndex={isMobile ? -1 : undefined}
    >
      <div className={styles.logoRow}>
        <div className={styles.brandBlock}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>OW</span>
            <span className={styles.logoText}>OurWed</span>
          </div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          aria-label="Zamknij nawigację"
          onClick={onClose}
        >
          <IconClose />
        </button>
      </div>

      <nav
        className={styles.nav}
        aria-label="Nawigacja główna"
        aria-hidden={isMobile ? true : undefined}
        inert={isMobile ? true : undefined}
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <Icon className={styles.navIcon} />
            <span>{label}</span>
            {to === '/powiadomienia' && unreadCount > 0 ? (
              <span
                className={styles.navBadge}
                aria-label={`${unreadCount} nieprzeczytane powiadomienia`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </NavLink>
        ))}

        <div className={catalogStyles.navGroup}>
          <p className={styles.studioGroupLabel}>Ankiety</p>
          {questionnaireItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <IconClipboard className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className={catalogStyles.navGroup}>
          <p className={styles.studioGroupLabel}>Firma</p>
          {companyItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <IconSettings className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        {showGuideNav ? (
          <NavLink
            to="/przewodnik"
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                styles.navItem,
                isActive ? styles.active : '',
                animateGuideCompass ? styles.guideAttention : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
            data-testid="sidebar-przewodnik"
            data-guide-attention={animateGuideCompass ? 'true' : undefined}
          >
            <IconCompass className={styles.navIcon} />
            <span>Przewodnik</span>
          </NavLink>
        ) : null}

        <Link
          to="/ustawienia"
          onClick={onNavigate}
          aria-current={settingsActive ? 'page' : undefined}
          className={`${styles.navItem} ${settingsActive ? styles.active : ''}`}
        >
          <IconCog className={styles.navIcon} />
          <span>Ustawienia</span>
        </Link>
      </nav>

      <nav
        className={styles.mobileNav}
        aria-label="Nawigacja główna"
        aria-hidden={!isMobile ? true : undefined}
        inert={!isMobile ? true : undefined}
      >
        <div
          className={styles.mobilePrimaryList}
          role="group"
          aria-label="Główne"
        >
          {mobilePrimaryItems.map((item) =>
            renderMobileNavItem(item, styles.mobilePrimaryItem),
          )}
        </div>

        <div className={styles.mobileSecondaryBlock}>
          <div
            className={styles.mobileSecondaryGrid}
            role="group"
            aria-label="Bieżące"
          >
            {mobileCurrentItems.map((item) =>
              renderMobileNavItem(item, styles.mobileSecondaryItem),
            )}
          </div>

          <div
            className={styles.mobileSecondaryGrid}
            role="group"
            aria-label="Studio"
          >
            {mobileStudioItems.map((item) =>
              renderMobileNavItem(item, styles.mobileSecondaryItem),
            )}
            <Link
              to="/ustawienia"
              onClick={onNavigate}
              aria-current={settingsActive ? 'page' : undefined}
              className={`${styles.mobileNavItem} ${styles.mobileSecondaryItem} ${
                settingsActive ? styles.mobileActive : ''
              }`}
            >
              <IconCog className={styles.mobileNavIcon} />
              <span className={styles.mobileNavLabel}>Ustawienia</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className={styles.footer}>
        {!isMobile ? (
          <SidebarSubscriptionBlock
            loading={subscriptionLoading}
            error={subscriptionError}
            entitlement={entitlement}
            onNavigate={onNavigate}
          />
        ) : null}
        <div className={styles.userMenu}>
          <div className={styles.user}>
            <div className={styles.userAvatar}>{avatarLetter}</div>
            <div className={styles.userText}>
              <p className={styles.userName}>{displayName}</p>
              {isMobile ? (
                planLine && entitlement && !subscriptionError ? (
                  <Link
                    to="/ustawienia/subskrypcja"
                    className={styles.drawerPlan}
                    onClick={onNavigate}
                  >
                    {planLine}
                  </Link>
                ) : planLine ? (
                  <p className={styles.drawerPlan}>{planLine}</p>
                ) : null
              ) : (
                <p className={styles.userRole}>{displayRole}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            className={styles.logout}
            onClick={() => void handleLogout()}
          >
            Wyloguj
          </button>
        </div>
      </div>
    </aside>
  )
}
