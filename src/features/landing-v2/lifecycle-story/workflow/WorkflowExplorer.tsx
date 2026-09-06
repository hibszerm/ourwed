import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import {
  CalendarFeatureVisual,
  ContractFeatureVisual,
  DayPlanFeatureVisual,
  ExecutionFeatureVisual,
  LogisticsFeatureVisual,
  PaymentsFeatureVisual,
  QuestionnairesFeatureVisual,
  StudioFeatureVisual,
  TasksFeatureVisual,
} from '@/features/landing-v2/lifecycle-story/workflow/WorkflowFeatureVisuals'
import {
  DEFAULT_WORKFLOW_FEATURE,
  WORKFLOW_FEATURE_ORDER,
  WORKFLOW_FEATURES,
  workflowFeatureByKey,
  type WorkflowFeatureKey,
} from '@/features/landing-v2/lifecycle-story/workflow/workflowExplorerData'
import styles from './WorkflowExplorer.module.css'

type Props = {
  /** When false, chrome is visible but pointer events are off (mid-morph). */
  interactive?: boolean
  /** Portrait vertical composition — tabs → copy → preview. Desktop stays split. */
  compact?: boolean
}

const VISUALS: Record<
  WorkflowFeatureKey,
  (props: { active: boolean }) => ReactElement
> = {
  contract: ContractFeatureVisual,
  payments: PaymentsFeatureVisual,
  questionnaires: QuestionnairesFeatureVisual,
  'day-plan': DayPlanFeatureVisual,
  tasks: TasksFeatureVisual,
  calendar: CalendarFeatureVisual,
  logistics: LogisticsFeatureVisual,
  execution: ExecutionFeatureVisual,
  studio: StudioFeatureVisual,
}

/**
 * Click-driven feature explorer — NOT scroll-controlled.
 * Default active = Umowa (contract).
 */
export function WorkflowExplorer({ interactive = true, compact = false }: Props) {
  const baseId = useId()
  const [active, setActive] = useState<WorkflowFeatureKey>(DEFAULT_WORKFLOW_FEATURE)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const feature = workflowFeatureByKey(active)
  const Visual = VISUALS[active]
  const panelId = `${baseId}-panel`

  const select = useCallback((key: WorkflowFeatureKey, focus = false) => {
    setActive(key)
    if (!focus) return
    const idx = WORKFLOW_FEATURE_ORDER.indexOf(key)
    tabRefs.current[idx]?.focus()
  }, [])

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = WORKFLOW_FEATURE_ORDER.indexOf(active)
    if (idx < 0) return
    let nextIdx: number | null = null
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % WORKFLOW_FEATURE_ORDER.length
    else if (e.key === 'ArrowLeft')
      nextIdx = (idx - 1 + WORKFLOW_FEATURE_ORDER.length) % WORKFLOW_FEATURE_ORDER.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = WORKFLOW_FEATURE_ORDER.length - 1
    if (nextIdx === null) return
    e.preventDefault()
    select(WORKFLOW_FEATURE_ORDER[nextIdx]!, true)
  }

  useEffect(() => {
    if (interactive) return
    /* Reverse morph: drop focus so contracting chrome cannot trap keyboard. */
    const focused = document.activeElement
    if (focused instanceof HTMLElement && tabRefs.current.includes(focused as HTMLButtonElement)) {
      focused.blur()
    }
  }, [interactive])

  const prevActiveRef = useRef(active)
  useEffect(() => {
    /* Horizontal tab strip only — skip when interactive flips on without a tab change. */
    if (!interactive || prevActiveRef.current === active) {
      prevActiveRef.current = active
      return
    }
    prevActiveRef.current = active
    const el = tabRefs.current[WORKFLOW_FEATURE_ORDER.indexOf(active)]
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [active, interactive])

  const onTabKeyDownGuarded = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    onTabKeyDown(e)
  }

  return (
    <div
      className={styles.root}
      data-workflow-explorer=""
      data-workflow-interactive={interactive ? 'true' : 'false'}
      data-workflow-layout={compact ? 'compact' : 'desktop'}
    >
      <div
        className={styles.tablist}
        role="tablist"
        aria-label="Funkcje OurWed"
        onKeyDown={onTabKeyDownGuarded}
        data-workflow-tablist=""
      >
        {WORKFLOW_FEATURES.map((item, i) => {
          const selected = item.key === active
          const Icon = item.icon
          return (
            <button
              key={item.key}
              ref={(node) => {
                tabRefs.current[i] = node
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              disabled={!interactive}
              className={[styles.tab, selected ? styles.tabActive : ''].join(' ')}
              data-workflow-tab={item.key}
              data-active={selected ? 'true' : 'false'}
              onClick={() => select(item.key)}
            >
              <Icon className={styles.tabIcon} width={18} height={18} aria-hidden />
              <span className={styles.tabLabel}>{item.label}</span>
            </button>
          )
        })}
      </div>

      <div
        className={styles.panel}
        role="tabpanel"
        id={panelId}
        aria-labelledby={`${baseId}-tab-${active}`}
        data-workflow-panel={active}
      >
        <div className={styles.copy} key={`copy-${active}`} data-workflow-copy="">
          <p className={styles.eyebrow}>{feature.eyebrow}</p>
          <p className={styles.headline}>{feature.headline}</p>
          <p className={styles.description}>{feature.description}</p>
          <ul className={styles.benefits}>
            {feature.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
        <div
          className={[styles.visualSlot, compact ? styles.visualSlotCompact : ''].join(' ')}
          key={`visual-${active}`}
          data-workflow-visual=""
        >
          {compact ? (
            <div className={styles.visualStage}>
              <Visual active />
            </div>
          ) : (
            <Visual active />
          )}
        </div>
      </div>
    </div>
  )
}
