import type { CSSProperties } from 'react'
import {
  IconBell,
  IconCalendar,
  IconClipboard,
  IconDashboard,
  IconFinances,
  IconInbox,
  IconSessions,
  IconTasks,
  IconWeddings,
} from '@/components/icons'
import { HERO_DEMO_LIGHT_TOKENS } from '@/features/landing-v2/hero/heroDemoThemeTokens'
import { HERO_MODERN_DEMO } from '@/features/landing-v2/hero/heroModernDemoData'
import { juliaMaksymilian } from '@/features/landing-v2/narrative'
import type { ProductStoryTabId } from '@/features/landing-v2/product-story/productStoryProgress'
import {
  ProductStoryFinancePanel,
  ProductStoryLogisticsPanel,
  ProductStoryOverviewPanel,
  ProductStoryQuestionnairePanel,
} from '@/features/landing-v2/product-story/ProductStoryPanels'
import styles from './ProductStoryWorkspace.module.css'

const TABS: Array<{ id: ProductStoryTabId; label: string }> = [
  { id: 'overview', label: 'Przegląd' },
  { id: 'logistics', label: 'Logistyka' },
  { id: 'finance', label: 'Umowa i finanse' },
  { id: 'questionnaire', label: 'Ankieta przedślubna' },
]

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

type Props = {
  activeTab: ProductStoryTabId
  wake?: number
  className?: string
  style?: CSSProperties
}

/**
 * Opened wedding-detail app for Product Story iPad.
 * Light Graphite + Hero sidebar. No dashboard greeting — identity hero only.
 */
export function ProductStoryWorkspace({
  activeTab,
  className,
  style,
}: Props) {
  const w = juliaMaksymilian.wedding
  const c = juliaMaksymilian.commercial
  const d = w.date
  const cd = w.countdown

  const themeStyle = {
    ...HERO_DEMO_LIGHT_TOKENS,
    ...style,
  } as CSSProperties

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={themeStyle}
      data-testid="lv2-product-story-workspace"
      data-active-tab={activeTab}
      role="img"
      aria-label={`OurWed — zlecenie ${w.coupleName}`}
    >
      <aside className={styles.sidebar} aria-hidden data-ps-sidebar="">
        <div className={styles.logo}>
          <span className={styles.logoMark}>OW</span>
          <span className={styles.logoText}>OurWed</span>
        </div>
        <nav className={styles.nav}>
          {HERO_MODERN_DEMO.nav
            .filter((item) => item.id !== 'questionnaires')
            .map((item) => {
            const Icon = NAV_ICONS[item.id as keyof typeof NAV_ICONS]
            const active = item.id === 'weddings'
            return (
              <span
                key={item.id}
                className={active ? styles.navActive : styles.navItem}
              >
                {Icon ? <Icon width={18} height={18} aria-hidden /> : null}
                <span className={styles.navLabel}>{item.label}</span>
              </span>
            )
          })}
        </nav>
        <p className={styles.navSection}>Ankiety</p>
        <span className={styles.navItem}>
          <IconClipboard width={18} height={18} aria-hidden />
          <span className={styles.navLabel}>Ankiety</span>
        </span>
      </aside>

      <div className={styles.main}>
        <header className={styles.hero} aria-hidden>
          <div className={styles.dateRail}>
            <span className={styles.day}>{d.day}</span>
            <span className={styles.month}>{d.month}</span>
            <span className={styles.weekday}>{d.weekday}</span>
          </div>

          <div className={styles.identity}>
            <p className={styles.couple}>{w.coupleName}</p>
            <p className={styles.longDate}>{w.longDate}</p>
            <p className={styles.packageName}>{w.packageName}</p>
            <div className={styles.statusRow}>
              <span className={styles.statusChip}>Umowa · {w.contractStatus}</span>
              <span className={styles.statusChip}>
                Ankieta · {w.questionnaireStatus}
              </span>
              <span className={styles.statusChip}>Pozostało · {c.remaining}</span>
            </div>
          </div>

          <div className={styles.countdown}>
            <span className={styles.day}>{cd.value}</span>
            <span className={styles.month}>{cd.unit}</span>
            <span className={styles.weekday}>{cd.caption}</span>
          </div>
        </header>

        <nav className={styles.tabs} aria-hidden>
          <div className={styles.tabTrack}>
            {TABS.map((tab) => (
              <span
                key={tab.id}
                className={tab.id === activeTab ? styles.tabActive : styles.tabItem}
                data-tab={tab.id}
              >
                {tab.label}
              </span>
            ))}
            <span
              className={styles.tabUnderline}
              style={{
                width: `${100 / TABS.length}%`,
              }}
            />
          </div>
        </nav>

        <div className={styles.chapter}>
          <div
            className={styles.panelLayer}
            data-visible={activeTab === 'overview' ? 'true' : 'false'}
          >
            <ProductStoryOverviewPanel />
          </div>
          <div
            className={styles.panelLayer}
            data-visible={activeTab === 'logistics' ? 'true' : 'false'}
          >
            <ProductStoryLogisticsPanel />
          </div>
          <div
            className={styles.panelLayer}
            data-visible={activeTab === 'finance' ? 'true' : 'false'}
          >
            <ProductStoryFinancePanel />
          </div>
          <div
            className={styles.panelLayer}
            data-visible={activeTab === 'questionnaire' ? 'true' : 'false'}
          >
            <ProductStoryQuestionnairePanel />
          </div>
        </div>
      </div>
    </div>
  )
}
