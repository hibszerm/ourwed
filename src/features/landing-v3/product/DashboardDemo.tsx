import { DashboardHero } from '@/features/dashboard/components/DashboardHero'
import { NextAssignmentCard } from '@/features/dashboard/components/NextWeddingCard'
import { NextAssignmentsSection } from '@/features/dashboard/components/NextAssignmentsSection'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import {
  DEMO_GREETING_NAME,
  demoAssignmentEvents,
  demoNotifications,
  demoPrimaryEvent,
  demoTasks,
  demoWeddings,
} from '@/features/landing-v3/data/demoData'
import { DemoAppShell } from '@/features/landing-v3/product/DemoAppShell'
import dashStyles from '@/pages/DashboardPage.module.css'
import styles from './DashboardDemo.module.css'

interface DashboardDemoProps {
  variant?: 'full' | 'hero' | 'mobile'
  focusNearest?: boolean
  className?: string
  onOpenNearest?: () => void
}

/** Real Dashboard composition with fictional demo data. */
export function DashboardDemo({
  variant = 'full',
  focusNearest = false,
  className = '',
  onOpenNearest,
}: DashboardDemoProps) {
  const nextThree = demoAssignmentEvents.slice(1, 4)

  if (variant === 'mobile') {
    return (
      <div
        className={[styles.mobile, className].filter(Boolean).join(' ')}
        data-testid="lv3-dashboard-mobile"
      >
        <div
          className={focusNearest ? styles.nearestFocus : undefined}
          data-lv3-nearest=""
        >
          <NextAssignmentCard
            assignment={demoPrimaryEvent}
            onOpen={onOpenNearest}
          />
        </div>
        <div className={styles.mobileUpcoming}>
          {nextThree.slice(0, 2).map((event) => (
            <div key={event.id} className={styles.mobileChip}>
              <p className={styles.chipName}>{event.title}</p>
              <p className={styles.chipMeta}>{event.dateKey}</p>
            </div>
          ))}
        </div>
        <div className={styles.mobileNotif}>
          <NotificationsCard notifications={demoNotifications.slice(0, 2)} />
        </div>
      </div>
    )
  }

  const body = (
    <div
      className={dashStyles.dashboard}
      data-testid="lv3-dashboard-demo"
      data-variant={variant}
    >
      <DashboardHero userName={DEMO_GREETING_NAME} nextWedding={null} />
      <div
        className={focusNearest ? styles.nearestFocus : undefined}
        data-lv3-nearest=""
      >
        <NextAssignmentCard
          assignment={demoPrimaryEvent}
          onOpen={onOpenNearest}
        />
      </div>
      <NextAssignmentsSection assignments={nextThree} />
      <div className={dashStyles.grid}>
        <div className={dashStyles.primary}>
          <TodoTodayCard
            tasks={demoTasks.slice(0, 3)}
            weddings={demoWeddings}
            onOpenWedding={onOpenNearest ? () => onOpenNearest() : undefined}
          />
        </div>
        <div className={dashStyles.secondary}>
          <NotificationsCard notifications={demoNotifications} />
        </div>
      </div>
    </div>
  )

  return (
    <DemoAppShell
      active="dashboard"
      frame="hero"
      className={[styles.frame, className].filter(Boolean).join(' ')}
      data-testid="lv3-dashboard-shell"
    >
      {body}
    </DemoAppShell>
  )
}
