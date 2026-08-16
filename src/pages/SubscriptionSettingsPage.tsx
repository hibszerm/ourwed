import { useState } from 'react'
import { AppLayout } from '@/layouts/AppLayout'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import {
  IconBell,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconClock,
  IconDocuments,
  IconFinances,
  IconWeddings,
} from '@/components/icons'
import {
  buildSubscriptionHistory,
  formatWarsawDate,
  getTrialTimeRemaining,
  trialProgressRatio,
  type AccountEntitlement,
  type SubscriptionHistoryItem,
} from '@/lib/billing/entitlement'
import {
  PLAN_REASSURANCE,
  PRO_CAPABILITIES,
  PRO_PLAN,
} from '@/lib/billing/planCatalog'
import { startCheckout } from '@/lib/billing/provider'
import { useMySubscription } from '@/lib/billing/useMySubscription'
import styles from '@/features/billing/SubscriptionSettingsPage.module.css'

const FEATURE_ICONS = [
  IconWeddings,
  IconClipboard,
  IconDocuments,
  IconFinances,
  IconClock,
  IconDocuments,
  IconCalendar,
  IconBell,
] as const

export function SubscriptionSettingsPage() {
  const { state, refresh } = useMySubscription()
  const [checkoutNote, setCheckoutNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onChoose(interval: 'month' | 'year') {
    if (state.status !== 'ready') return
    setBusy(true)
    setCheckoutNote(null)
    const accountId = state.data.entitlement.billingAccountId
    if (!accountId) {
      setCheckoutNote('Nie udało się ustalić konta rozliczeniowego.')
      setBusy(false)
      return
    }
    const result = await startCheckout({
      billingAccountId: accountId,
      plan: 'pro',
      interval,
    })
    setBusy(false)
    if (!result.ok) {
      const ent = state.data.entitlement
      const ends =
        ent.source === 'trial' && ent.accessLevel === 'pro'
          ? formatWarsawDate(ent.trialEndsAt)
          : null
      setCheckoutNote(
        ends
          ? `${result.message} Twój okres próbny pozostaje aktywny do ${ends}.`
          : result.message,
      )
    }
  }

  return (
    <AppLayout
      title="Subskrypcja"
      subtitle="Zarządzaj dostępem do OurWed i wybierz plan, który najlepiej pasuje do Twojej pracy."
    >
      <PageContainer width="wide">
        <div className={styles.page} data-testid="subscription-settings">
          {state.status === 'loading' ? (
            <div className={styles.skeleton} aria-busy>
              <div className={styles.skelCard} />
              <div className={styles.skelCard} />
              <div className={styles.skelCard} />
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className={styles.notice} role="alert">
              <p>Nie udało się sprawdzić statusu subskrypcji.</p>
              <Button type="button" variant="secondary" onClick={() => void refresh()}>
                Spróbuj ponownie
              </Button>
            </div>
          ) : null}

          {state.status === 'ready' ? (
            <>
              <CurrentPlanCard entitlement={state.data.entitlement} />

              <section className={styles.plansSection} aria-labelledby="plans-title">
                <h2 id="plans-title" className={styles.sectionTitle}>
                  Wybierz plan
                </h2>
                <div className={styles.plansRow}>
                  <div className={styles.planCards}>
                    <article
                      className={`${styles.planCard} ${styles.planAnnual}`}
                      data-testid="plan-annual"
                    >
                      <p className={styles.badge}>{PRO_PLAN.annual.recommendedBadge}</p>
                      <h3>PRO Roczny</h3>
                      <p className={styles.price}>
                        {PRO_PLAN.annual.label}
                        <span>{PRO_PLAN.annual.periodLabel}</span>
                      </p>
                      <p className={styles.equiv}>
                        {PRO_PLAN.annual.monthlyEquivalentLabel}
                      </p>
                      <div className={styles.savePanel}>
                        <p className={styles.save}>{PRO_PLAN.annual.savingLabel}</p>
                        <p className={styles.saveSub}>{PRO_PLAN.annual.discountLabel}</p>
                      </div>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={busy}
                        onClick={() => void onChoose('year')}
                      >
                        Wybierz PRO Roczny
                      </Button>
                    </article>

                    <article
                      className={styles.planCard}
                      data-testid="plan-monthly"
                    >
                      <h3>PRO Miesięczny</h3>
                      <p className={styles.price}>
                        {PRO_PLAN.monthly.label}
                        <span>{PRO_PLAN.monthly.periodLabel}</span>
                      </p>
                      <p className={styles.planDesc}>
                        Pełna elastyczność. Rozliczenie miesięczne bez długiego zobowiązania.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void onChoose('month')}
                      >
                        Wybierz plan miesięczny
                      </Button>
                    </article>
                  </div>

                  <ul className={styles.benefits} data-testid="plan-benefits">
                    {PLAN_REASSURANCE.map((item) => (
                      <li key={item.title}>
                        <span className={styles.benefitIcon} aria-hidden>
                          <IconCheck width={16} height={16} />
                        </span>
                        <div>
                          <p className={styles.benefitTitle}>{item.title}</p>
                          <p className={styles.benefitDesc}>{item.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {checkoutNote ? (
                  <p className={styles.checkoutNote} role="status" data-testid="checkout-note">
                    {checkoutNote}
                  </p>
                ) : (
                  <p className={styles.paymentsHint} data-testid="payments-hint">
                    {paymentsUnavailableHint(state.data.entitlement)}
                  </p>
                )}
              </section>

              <PlanComparison />

              <HistoryCard entitlement={state.data.entitlement} />
            </>
          ) : null}
        </div>
      </PageContainer>
    </AppLayout>
  )
}

function paymentsUnavailableHint(entitlement: AccountEntitlement): string {
  const base = 'Płatności online będą dostępne wkrótce.'
  if (entitlement.source === 'trial' && entitlement.accessLevel === 'pro') {
    return `${base} Twój okres próbny pozostaje aktywny do ${formatWarsawDate(entitlement.trialEndsAt)}.`
  }
  return base
}

function RemainingDaysRing({
  progress,
  daysLabel,
  daysValue,
}: {
  progress: number
  daysLabel: string
  daysValue: string
}) {
  const size = 120
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const remaining = Math.min(1, Math.max(0, 1 - progress))
  const offset = c * (1 - remaining)

  return (
    <div
      className={styles.ring}
      data-testid="trial-remaining-ring"
      role="img"
      aria-label={`${daysValue} ${daysLabel}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(29, 39, 43, 0.08)"
          strokeWidth={stroke}
        />
        <circle
          className={styles.ringProgress}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.ringLabel}>
        <span className={styles.ringValue}>{daysValue}</span>
        <span className={styles.ringUnit}>{daysLabel}</span>
      </div>
    </div>
  )
}

function CurrentPlanCard({ entitlement }: { entitlement: AccountEntitlement }) {
  if (entitlement.source === 'trial' && entitlement.accessLevel === 'pro') {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt)
    const progress = trialProgressRatio(
      entitlement.trialStartedAt,
      entitlement.trialEndsAt,
    )
    const daysValue =
      rem.kind === 'today' ? 'dziś' : rem.fullDays === 1 ? '1' : String(rem.fullDays)
    const daysLabel =
      rem.kind === 'today'
        ? 'kończy się'
        : rem.fullDays === 1
          ? 'dzień pozostał'
          : 'dni pozostało'

    return (
      <section
        className={`${styles.current} ${styles.currentTrial}`}
        data-testid="subscription-current"
        data-state="trial"
      >
        <div className={styles.currentMain}>
          <div className={styles.currentHead}>
            <span className={styles.statusIcon} aria-hidden>
              <IconClock width={18} height={18} />
            </span>
            <div>
              <p className={styles.eyebrow}>Twój plan</p>
              <h2>Okres próbny PRO</h2>
            </div>
          </div>
          <p className={styles.currentLead}>
            Pełny dostęp do wszystkich funkcji OurWed.
          </p>
          <div
            className={styles.segmentedRail}
            aria-hidden
            data-testid="trial-progress-rail"
          >
            {Array.from({ length: 10 }).map((_, i) => {
              const filled = progress >= (i + 1) / 10
              return (
                <span
                  key={i}
                  className={`${styles.segment} ${filled ? styles.segmentFilled : ''}`}
                />
              )
            })}
          </div>
          <p className={styles.reassure}>
            <span className={styles.reassureIcon} aria-hidden>
              <IconCheck width={14} height={14} />
            </span>
            Po zakończeniu okresu próbnego nadal będziesz mieć dostęp do swoich danych. Aby tworzyć
            nowe zlecenia, aktywuj jeden z planów PRO.
          </p>
        </div>
        <aside className={styles.currentAside}>
          <RemainingDaysRing
            progress={progress}
            daysValue={daysValue}
            daysLabel={daysLabel}
          />
          <p className={styles.asideMeta} data-testid="trial-ends-at">
            Okres próbny kończy się {formatWarsawDate(entitlement.trialEndsAt)}.
          </p>
          <p className={styles.asideHint}>Płatności online będą dostępne wkrótce.</p>
        </aside>
      </section>
    )
  }

  if (entitlement.source === 'admin_override' && entitlement.accessLevel === 'pro') {
    return (
      <section className={styles.current} data-testid="subscription-current" data-state="manual">
        <div className={styles.currentMain}>
          <p className={styles.eyebrow}>Twój plan</p>
          <h2>PRO</h2>
          <p className={styles.currentLead}>Pełny dostęp do OurWed.</p>
          <p className={styles.meta}>
            {entitlement.manualAccessIndefinite
              ? 'Dostęp przyznany bezterminowo.'
              : `Dostęp aktywny do ${formatWarsawDate(entitlement.manualAccessUntil)}.`}
          </p>
        </div>
      </section>
    )
  }

  if (entitlement.source === 'paid_subscription' && entitlement.accessLevel === 'pro') {
    const isAnnual = entitlement.billingInterval === 'year'
    return (
      <section className={styles.current} data-testid="subscription-current" data-state="paid">
        <div className={styles.currentMain}>
          <p className={styles.eyebrow}>Twój plan</p>
          <h2>{isAnnual ? 'PRO Roczny' : 'PRO Miesięczny'}</h2>
          <p className={styles.currentLead}>Pełny dostęp do OurWed.</p>
          <p className={styles.meta}>
            {isAnnual ? 'Plan roczny' : 'Plan miesięczny'}
            {' · '}
            aktywny do {formatWarsawDate(entitlement.currentPeriodEndsAt)}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.current} data-testid="subscription-current" data-state="expired">
      <div className={styles.currentMain}>
        <p className={styles.eyebrow}>Twój plan</p>
        <h2>Okres próbny zakończony</h2>
        <p className={styles.currentLead}>
          Twoje dane pozostają dostępne w trybie tylko do odczytu.
        </p>
        <p className={styles.reassure}>
          <span className={styles.reassureIcon} aria-hidden>
            <IconCheck width={14} height={14} />
          </span>
          Po aktywacji PRO wszystkie funkcje odblokują się automatycznie.
        </p>
        <p className={styles.reassure}>
          <span className={styles.reassureIcon} aria-hidden>
            <IconCheck width={14} height={14} />
          </span>
          Aby tworzyć nowe zlecenia i edytować dane, wybierz plan PRO poniżej.
        </p>
      </div>
    </section>
  )
}

function PlanComparison() {
  return (
    <section className={styles.comparison} aria-labelledby="compare-title" data-testid="plan-comparison">
      <h2 id="compare-title" className={styles.sectionTitle}>
        Porównanie planów
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Funkcja</th>
              <th scope="col">Okres próbny</th>
              <th scope="col">PRO</th>
            </tr>
          </thead>
          <tbody>
            {PRO_CAPABILITIES.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? IconCheck
              return (
                <tr key={feature}>
                  <th scope="row">
                    <span className={styles.featureCell}>
                      <Icon width={16} height={16} aria-hidden />
                      {feature}
                    </span>
                  </th>
                  <td>
                    <span className={styles.check} aria-label="Dostępne w okresie próbnym">
                      <IconCheck width={16} height={16} />
                    </span>
                  </td>
                  <td>
                    <span className={styles.check} aria-label="Dostępne w PRO">
                      <IconCheck width={16} height={16} />
                    </span>
                  </td>
                </tr>
              )
            })}
            <tr className={styles.summaryRow}>
              <th scope="row">Czas dostępu</th>
              <td>{PRO_PLAN.trialDays} dni</td>
              <td>Zgodnie z planem</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HistoryCard({ entitlement }: { entitlement: AccountEntitlement }) {
  const items = buildSubscriptionHistory(entitlement)
  return (
    <section className={styles.history} aria-labelledby="history-title" data-testid="subscription-history">
      <h2 id="history-title" className={styles.sectionTitle}>
        Historia
      </h2>
      <ul className={styles.historyList}>
        {items.map((item) => (
          <HistoryRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

function HistoryRow({ item }: { item: SubscriptionHistoryItem }) {
  return (
    <li className={styles.historyItem} data-status={item.status}>
      <div>
        <p className={styles.historyTitle}>{item.title}</p>
        <p className={styles.historyDetail}>{item.detail}</p>
      </div>
      <span className={styles.historyStatus}>{item.statusLabel}</span>
    </li>
  )
}
