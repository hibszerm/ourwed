import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { IconArrowLeft } from '@/components/icons'
import { CalendarMonthView } from '@/features/calendar/components/CalendarMonthView'
import { CalendarSummary } from '@/features/calendar/components/CalendarSummary'
import {
  CalendarToolbar,
  type CalendarViewMode,
} from '@/features/calendar/components/CalendarToolbar'
import {
  addMonths,
  startOfMonth,
} from '@/features/calendar/utils/calendarDates'
import { buildCalendarEvents } from '@/features/calendar/utils/calendarEvents'
import { NextWeddingCard } from '@/features/dashboard/components/NextWeddingCard'
import { NotificationsCard } from '@/features/dashboard/components/NotificationsCard'
import { TodoTodayCard } from '@/features/dashboard/components/TodoTodayCard'
import {
  DEMO_WEDDING_ID,
  demoMaskedMeta,
  demoNotifications,
  demoQuestionnaireAnswers,
  demoQuestionnaireCards,
  demoTasks,
  demoTravelPlan,
  demoWedding,
  demoWeddingTasks,
  demoWeddings,
  getDemoSeasonFinance,
} from '@/features/landing/demoData'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShortDate } from '@/lib/utils/dates'
import { WeddingCard } from '@/features/weddings/components/WeddingCard'
import { NotesSection } from '@/features/weddings/components/NotesSection'
import { ScheduleSection } from '@/features/weddings/components/ScheduleSection'
import { EquipmentSection } from '@/features/weddings/components/EquipmentSection'
import { DeliverablesSection } from '@/features/weddings/components/DeliverablesSection'
import { WeddingDetailContact } from '@/features/weddings/components/detail/WeddingDetailContact'
import { WeddingDetailCurrentStage } from '@/features/weddings/components/detail/WeddingDetailCurrentStage'
import { WeddingDetailFinances } from '@/features/weddings/components/detail/WeddingDetailFinances'
import { WeddingDetailHero } from '@/features/weddings/components/detail/WeddingDetailHero'
import { WeddingDetailPackage } from '@/features/weddings/components/detail/WeddingDetailPackage'
import { WeddingDetailQuestionnaires } from '@/features/weddings/components/detail/WeddingDetailQuestionnaires'
import { WeddingDetailStatus } from '@/features/weddings/components/detail/WeddingDetailStatus'
import { WeddingDetailTasks } from '@/features/weddings/components/detail/WeddingDetailTasks'
import { WeddingDetailTimeline } from '@/features/weddings/components/detail/WeddingDetailTimeline'
import { WeddingDetailTravel } from '@/features/weddings/components/detail/WeddingDetailTravel'
import { WeddingDetailWorkflow } from '@/features/weddings/components/detail/WeddingDetailWorkflow'
import shellStyles from './AppTour.module.css'
import styles from './LandingDemo.module.css'

export type DemoNavId =
  | 'dashboard'
  | 'weddings'
  | 'wedding'
  | 'questionnaires'
  | 'travel'
  | 'finance'
  | 'calendar'

const NAV_ITEMS: { id: DemoNavId; label: string; path: string }[] = [
  { id: 'dashboard', label: 'Dashboard', path: 'dashboard' },
  { id: 'weddings', label: 'Śluby', path: 'sluby' },
  { id: 'travel', label: 'Podróże', path: 'sluby/demo#travel' },
  { id: 'questionnaires', label: 'Ankiety', path: 'ankiety' },
  { id: 'finance', label: 'Finanse', path: 'finanse' },
  { id: 'calendar', label: 'Kalendarz', path: 'kalendarz' },
]

interface LandingDemoProps {
  compact?: boolean
  className?: string
}

/**
 * Product showcase demo — curated layouts, real components, local data.
 * Not a scaled-down full app; each tab has room to breathe.
 */
export function LandingDemo({ compact = false, className = '' }: LandingDemoProps) {
  const [nav, setNav] = useState<DemoNavId>('dashboard')
  const [fadeKey, setFadeKey] = useState(0)
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)

  function go(next: DemoNavId) {
    setNav(next)
    setFadeKey((k) => k + 1)
    if (next !== 'questionnaires') setQuestionnaireOpen(false)
  }

  function openWedding() {
    go('wedding')
  }

  const path = NAV_ITEMS.find((item) => item.id === nav)?.path ?? 'dashboard'
  const activeNav = nav === 'wedding' ? 'weddings' : nav

  return (
    <div
      className={`${shellStyles.root} ${compact ? styles.compact : ''} ${className}`.trim()}
    >
      <aside className={shellStyles.nav} aria-label="Nawigacja demo">
        <div className={shellStyles.brand}>
          <span className={shellStyles.brandMark}>OW</span>
          <span>OurWed</span>
        </div>
        <nav className={shellStyles.navList} role="tablist">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeNav === item.id}
              className={`${shellStyles.navItem} ${activeNav === item.id ? shellStyles.navItemActive : ''}`}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <p className={shellStyles.navHint}>
          Interaktywne demo — te same komponenty co w aplikacji.
        </p>
      </aside>

      <div className={shellStyles.stage}>
        <div className={shellStyles.chrome} aria-hidden>
          <span />
          <span />
          <span />
          <div className={shellStyles.url}>app.ourwed.pl/{path}</div>
        </div>
        <div className={`${shellStyles.contentSlot} ${styles.contentSlot}`}>
          <div key={fadeKey} className={`${shellStyles.content} ${styles.screen}`} role="tabpanel">
            {nav === 'dashboard' ? (
              <DemoDashboard onOpenWedding={openWedding} />
            ) : null}
            {nav === 'weddings' ? (
              <DemoWeddingsList onOpen={openWedding} />
            ) : null}
            {nav === 'wedding' ? (
              <DemoWeddingDetail onBack={() => go('weddings')} />
            ) : null}
            {nav === 'travel' ? <DemoTravel /> : null}
            {nav === 'finance' ? <DemoSeasonFinanceView /> : null}
            {nav === 'calendar' ? (
              <DemoCalendar onOpenWedding={openWedding} />
            ) : null}
            {nav === 'questionnaires' ? (
              <DemoQuestionnaires
                open={questionnaireOpen}
                onOpen={() => setQuestionnaireOpen(true)}
                onBack={() => setQuestionnaireOpen(false)}
                onOpenWedding={openWedding}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className={shellStyles.mobileTabs} role="tablist" aria-label="Sekcje aplikacji">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeNav === item.id}
            className={`${shellStyles.mobileTab} ${activeNav === item.id ? shellStyles.mobileTabActive : ''}`}
            onClick={() => go(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Showcase: only the three hero widgets — never the full dashboard. */
function DemoDashboard({ onOpenWedding }: { onOpenWedding: () => void }) {
  return (
    <div className={styles.dashboardShowcase}>
      <NextWeddingCard wedding={demoWedding} onOpen={onOpenWedding} />
      <div className={styles.dashboardSplit}>
        <TodoTodayCard
          tasks={demoTasks.slice(0, 3)}
          weddings={demoWeddings}
          onOpenWedding={(id) => {
            if (id === DEMO_WEDDING_ID) onOpenWedding()
          }}
        />
        <NotificationsCard notifications={demoNotifications.slice(0, 3)} />
      </div>
    </div>
  )
}

function DemoWeddingsList({ onOpen }: { onOpen: () => void }) {
  return (
    <div className={styles.weddingsShowcase}>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Śluby</h2>
        <p className={styles.pageSub}>{demoWeddings.length} aktywnych par</p>
      </header>
      <div className={styles.weddingList}>
        {demoWeddings.map((wedding, index) => (
          <WeddingCard
            key={wedding.id}
            wedding={wedding}
            shortNames
            onOpen={index === 0 ? () => onOpen() : undefined}
            disabled={index > 0}
          />
        ))}
      </div>
    </div>
  )
}

function DemoWeddingDetail({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.detailShowcase}>
      <div className={styles.backRow}>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <IconArrowLeft />
          Wróć do listy
        </Button>
      </div>

      <WeddingDetailHero
        wedding={demoWedding}
        places={demoTravelPlan.places}
        readOnly
        onAction={() => undefined}
      />

      <WeddingDetailStatus wedding={demoWedding} />
      <WeddingDetailWorkflow currentStage={demoWedding.workflowStage} />
      <WeddingDetailCurrentStage wedding={demoWedding} />

      <Card padding="md">
        <CardHeader title="Dane umowy" subtitle="Dane wrażliwe zanonimizowane" />
        <dl className={styles.maskedGrid}>
          <div>
            <dt>Numer umowy</dt>
            <dd>{demoMaskedMeta.contractNumber}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>••••••••@gmail.com</dd>
          </div>
          <div>
            <dt>Telefon</dt>
            <dd>••• ••• •••</dd>
          </div>
          <div>
            <dt>Adres</dt>
            <dd className={styles.blurred}>ul. ********</dd>
          </div>
        </dl>
      </Card>

      <div className={styles.detailStack}>
        <WeddingDetailFinances
          wedding={demoWedding}
          contractPrice={demoWedding.price}
          payments={demoWedding.payments}
        />
        <WeddingDetailPackage wedding={demoWedding} extras={[]} />
        <WeddingDetailContact couple={demoWedding.couple} contacts={[]} />
      </div>

      <WeddingDetailTravel
        weddingId={demoWedding.id}
        plan={demoTravelPlan}
        readOnly
        hideMap
      />

      <div className={styles.detailStack}>
        <WeddingDetailQuestionnaires questionnaires={demoWedding.questionnaires} />
        <WeddingDetailTasks tasks={demoWeddingTasks} />
      </div>

      <ScheduleSection events={demoWedding.schedule} />
      <EquipmentSection items={demoWedding.checklist} />
      <DeliverablesSection deliverables={demoWedding.deliverables} />
      <WeddingDetailTimeline entries={demoWedding.timeline} />
      <NotesSection notes={demoWedding.notes} />
    </div>
  )
}

function DemoTravel() {
  return (
    <div className={styles.travelShowcase}>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Podróże</h2>
        <p className={styles.pageSub}>Anna & Michał · trasa dnia ślubu</p>
      </header>
      <WeddingDetailTravel
        weddingId={demoWedding.id}
        plan={demoTravelPlan}
        readOnly
        hideMap
      />
    </div>
  )
}

function DemoSeasonFinanceView() {
  const finance = getDemoSeasonFinance()
  const maxMonth = Math.max(...finance.monthly.map((m) => m.revenue), 1)

  return (
    <div className={styles.financeShowcase}>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Finanse</h2>
        <p className={styles.pageSub}>Przegląd sezonu 2026</p>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Przychód</span>
          <span className={styles.statValue}>{formatCurrency(finance.seasonRevenue)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Koszty</span>
          <span className={styles.statValue}>{formatCurrency(finance.expensesTotal)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Zysk</span>
          <span className={styles.statValue}>{formatCurrency(finance.profit)}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Do zapłaty</span>
          <span className={styles.statValue}>{formatCurrency(finance.remainingTotal)}</span>
        </div>
      </div>

      <Card padding="md">
        <CardHeader title="Przychód miesięczny" subtitle="Wartość umów wg miesiąca ślubu" />
        <div className={styles.chart}>
          {finance.monthly.map((month) => (
            <div key={month.key} className={styles.chartCol}>
              <div className={styles.chartBarTrack}>
                <div
                  className={styles.chartBar}
                  style={{
                    height: `${Math.max(8, (month.revenue / maxMonth) * 100)}%`,
                  }}
                />
              </div>
              <span className={styles.chartLabel}>{month.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="md">
        <CardHeader title="Nadchodzące płatności" />
        <ul className={styles.paymentList}>
          {finance.upcoming.slice(0, 4).map((row) => (
            <li key={row.id} className={styles.paymentItem}>
              <div className={styles.paymentText}>
                <p className={styles.paymentCouple}>{row.coupleLabel}</p>
                <p className={styles.paymentMeta}>
                  {row.label}
                  {row.dueDate ? ` · ${formatShortDate(row.dueDate)}` : ''}
                </p>
              </div>
              <span className={styles.paymentAmount}>{formatCurrency(row.amount)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function DemoCalendar({ onOpenWedding }: { onOpenWedding: () => void }) {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date(2026, 7, 1)))
  const events = useMemo(() => buildCalendarEvents(demoWeddings), [])
  const view: CalendarViewMode = 'month'

  return (
    <div className={styles.calendarShowcase}>
      <CalendarSummary weddings={demoWeddings} anchor={anchor} />
      <CalendarToolbar
        view={view}
        anchor={anchor}
        onViewChange={() => undefined}
        onToday={() => setAnchor(startOfMonth(new Date(2026, 7, 1)))}
        onPrev={() => setAnchor((c) => addMonths(c, -1))}
        onNext={() => setAnchor((c) => addMonths(c, 1))}
      />
      <CalendarMonthView
        anchor={anchor}
        events={events}
        allowCreateOnEmpty={false}
        onSelectEvent={(event) => {
          if (event.wedding.id === DEMO_WEDDING_ID) onOpenWedding()
        }}
      />
    </div>
  )
}

function DemoQuestionnaires({
  open,
  onOpen,
  onBack,
  onOpenWedding,
}: {
  open: boolean
  onOpen: () => void
  onBack: () => void
  onOpenWedding: () => void
}) {
  if (open) {
    return (
      <div className={styles.questionnairesShowcase}>
        <div className={styles.backRow}>
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <IconArrowLeft />
            Wróć do listy
          </Button>
        </div>
        <Card padding="md">
          <CardHeader
            title="Ankieta do umowy"
            subtitle="Anna & Michał · Ukończona"
          />
          <dl className={styles.answers}>
            {Object.entries(demoQuestionnaireAnswers).map(([question, answer]) => (
              <div key={question} className={styles.answerRow}>
                <dt>{question}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.openRow}>
            <Button type="button" variant="primary" onClick={onOpenWedding}>
              Otwórz ślub
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className={styles.questionnairesShowcase}>
      <header className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Ankiety</h2>
        <p className={styles.pageSub}>{demoQuestionnaireCards.length} ankiet</p>
      </header>
      <div className={styles.questionnaireGrid}>
        {demoQuestionnaireCards.map((item) => {
          const card = (
            <Card
              padding="md"
              hover={item.clickable}
              className={styles.questionnaireCard}
            >
              <div className={styles.questionnaireTop}>
                <h3 className={styles.questionnaireTitle}>{item.title}</h3>
                <span
                  className={`${styles.questionnaireStatus} ${styles[`tone_${item.tone}`]}`}
                >
                  {item.status}
                </span>
              </div>
              <p className={styles.questionnaireCouple}>{item.couple}</p>
              {item.clickable ? (
                <span className={styles.questionnaireCta}>Zobacz odpowiedzi</span>
              ) : null}
            </Card>
          )

          if (!item.clickable) {
            return (
              <div key={item.id} className={styles.questionnaireItemDisabled}>
                {card}
              </div>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              className={styles.questionnaireItem}
              onClick={onOpen}
            >
              {card}
            </button>
          )
        })}
      </div>
    </div>
  )
}
