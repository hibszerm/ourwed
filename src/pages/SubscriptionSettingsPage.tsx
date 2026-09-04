import { useState } from 'react'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { SettingsWorkspace } from '@/features/settings/SettingsWorkspace'
import { PageContainer } from '@/components/ui/PageContainer'
import { Button } from '@/components/ui/Button'
import {
  IconDashboard,
  IconDocuments,
  IconFinances,
} from '@/components/icons'
import {
  buildSubscriptionHistory,
  formatWarsawDate,
  getTrialTimeRemaining,
  type AccountEntitlement,
  type SubscriptionHistoryItem,
  type TrialTimeRemaining,
} from '@/lib/billing/entitlement'
import { PRO_PLAN, PRO_WORKFLOW_VALUE } from '@/lib/billing/planCatalog'
import { useMySubscription } from '@/lib/billing/useMySubscription'
import styles from '@/features/billing/SubscriptionSettingsPage.module.css'

/**
 * Presentation grouping of catalog workflow value — not new capabilities.
 * Five equal inventory items become three purchase-reason pillars.
 */
const PRO_VALUE_PILLARS = [
  {
    title: 'Organizacja pracy',
    description:
      'Śluby, sesje, kalendarz, zadania i plan dnia w jednym miejscu.',
    Icon: IconDashboard,
  },
  {
    title: PRO_WORKFLOW_VALUE[1].title,
    description: PRO_WORKFLOW_VALUE[1].description,
    Icon: IconDocuments,
  },
  {
    title: 'Finanse i integracje',
    description:
      'Wpłaty, pozostałe kwoty i kalendarze połączone z Twoją pracą.',
    Icon: IconFinances,
  },
] as const

/** Paid or manually granted PRO — do not lead with a purchase funnel. */
function canChooseSubscriptionPlan(entitlement: AccountEntitlement): boolean {
  if (entitlement.accessLevel !== 'pro') return true
  return entitlement.source === 'trial'
}

function trialRemainingParts(rem: TrialTimeRemaining): {
  value: string
  measure: string | null
  verb: string
  spoken: string
} {
  if (rem.kind === 'today') {
    return {
      value: 'dziś',
      measure: null,
      verb: 'kończy się',
      spoken: 'dziś kończy się',
    }
  }
  if (rem.fullDays === 1) {
    return {
      value: '1',
      measure: 'dzień',
      verb: 'pozostał',
      spoken: '1 dzień pozostał',
    }
  }
  return {
    value: String(rem.fullDays),
    measure: 'dni',
    verb: 'pozostało',
    spoken: `${rem.fullDays} dni pozostało`,
  }
}

export function SubscriptionSettingsPage() {
  const { state, refresh } = useMySubscription()

  const entitlement =
    state.status === 'ready' ? state.data.entitlement : null
  const showPlanOffer = entitlement
    ? canChooseSubscriptionPlan(entitlement)
    : false

  return (
    <SettingsLayout
      title="Subskrypcja"
      subtitle="Twój plan i dostęp do OurWed."
    >
      <PageContainer width="full">
        <SettingsWorkspace testId="subscription-settings-workspace">
          <div
            className={styles.page}
            data-testid="subscription-settings"
            data-flow={showPlanOffer ? 'purchase' : 'current'}
          >
            {state.status === 'loading' ? (
              <div className={styles.skeleton} aria-busy>
                <div className={styles.skelCard} />
                <div className={styles.skelCard} />
              </div>
            ) : null}

            {state.status === 'error' ? (
              <div className={styles.notice} role="alert">
                <p>Nie udało się sprawdzić statusu subskrypcji.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void refresh()}
                >
                  Spróbuj ponownie
                </Button>
              </div>
            ) : null}

            {state.status === 'ready' ? (
              <>
                <CurrentPlanCard entitlement={state.data.entitlement} />

                {showPlanOffer ? (
                  <PlanOffer />
                ) : (
                  <WorkflowValue heading="Co obejmuje Twój PRO" />
                )}

                <HistoryCard entitlement={state.data.entitlement} />
              </>
            ) : null}
          </div>
        </SettingsWorkspace>
      </PageContainer>
    </SettingsLayout>
  )
}

function paymentsUnavailableHint(): string {
  return 'Zakup planu online będzie dostępny wkrótce.'
}

function PlanOffer() {
  const [interval, setInterval] = useState<'month' | 'year'>('year')

  return (
    <section
      className={styles.commercial}
      aria-labelledby="pro-offer-title"
      data-testid="pro-offer"
    >
      <header className={styles.commercialHead}>
        <p className={styles.commercialKicker}>OurWed PRO</p>
        <h2 id="pro-offer-title">Zostań z OurWed PRO</h2>
        <p className={styles.commercialLead}>
          Wszystko, czego potrzebujesz do prowadzenia zleceń — od pierwszego
          kontaktu po oddanie materiału.
        </p>
      </header>

      <ul
        className={styles.offerValue}
        data-testid="pro-workflow-value"
        aria-label="Co zyskujesz z OurWed PRO"
      >
        {PRO_VALUE_PILLARS.map((item) => {
          const Icon = item.Icon
          return (
            <li key={item.title} className={styles.offerValueItem}>
              <span className={styles.offerValueIcon} aria-hidden>
                <Icon width={16} height={16} />
              </span>
              <div className={styles.offerValueCopy}>
                <p className={styles.offerValueTitle}>{item.title}</p>
                <p className={styles.offerValueDesc}>{item.description}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <p id="pro-cadence-label" className={styles.cadenceLabel}>
        Wybierz rozliczenie
      </p>
      <div
        className={styles.cadence}
        role="radiogroup"
        aria-labelledby="pro-cadence-label"
      >
        <button
          type="button"
          role="radio"
          className={`${styles.cadenceOption} ${styles.cadenceAnnual}`}
          data-testid="plan-annual"
          aria-checked={interval === 'year'}
          onClick={() => setInterval('year')}
        >
          <span className={styles.cadenceHead}>
            <span className={styles.cadenceChoice}>
              <span className={styles.cadenceMark} aria-hidden />
              <span className={styles.cadenceName}>Rocznie</span>
            </span>
            <span className={styles.badge}>{PRO_PLAN.annual.recommendedBadge}</span>
          </span>
          <span className={styles.cadenceBody}>
            <span className={styles.cadencePrice}>
              <span className={styles.cadenceAmount}>{PRO_PLAN.annual.label}</span>
              <span className={styles.cadencePeriod}>
                {PRO_PLAN.annual.periodLabel}
              </span>
            </span>
            <span className={styles.cadenceEquiv}>
              {PRO_PLAN.annual.monthlyEquivalentLabel}
            </span>
            <span className={styles.cadenceMeta}>
              {PRO_PLAN.annual.savingLabel}
              {' · '}
              {PRO_PLAN.annual.savingPercent}% taniej
            </span>
          </span>
        </button>

        <button
          type="button"
          role="radio"
          className={`${styles.cadenceOption} ${styles.cadenceMonthly}`}
          data-testid="plan-monthly"
          aria-checked={interval === 'month'}
          onClick={() => setInterval('month')}
        >
          <span className={styles.cadenceHead}>
            <span className={styles.cadenceChoice}>
              <span className={styles.cadenceMark} aria-hidden />
              <span className={styles.cadenceName}>Miesięcznie</span>
            </span>
          </span>
          <span className={styles.cadenceBody}>
            <span className={styles.cadencePrice}>
              <span className={styles.cadenceAmount}>{PRO_PLAN.monthly.label}</span>
              <span className={styles.cadencePeriod}>
                {PRO_PLAN.monthly.periodLabel}
              </span>
            </span>
            <span className={styles.cadenceMeta}>
              Pełna elastyczność · Bez długiego zobowiązania
            </span>
          </span>
        </button>
      </div>

      <div className={styles.ctaRow}>
        <Button
          type="button"
          variant="primary"
          disabled
          data-testid="pro-purchase-cta"
        >
          Zakup PRO wkrótce
        </Button>
      </div>

      <p className={styles.paymentsHint} data-testid="payments-hint">
        {paymentsUnavailableHint()}
      </p>
    </section>
  )
}

function CurrentPlanCard({ entitlement }: { entitlement: AccountEntitlement }) {
  if (entitlement.source === 'trial' && entitlement.accessLevel === 'pro') {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt)
    const remaining = trialRemainingParts(rem)

    return (
      <section
        className={styles.current}
        data-testid="subscription-current"
        data-state="trial"
        data-layout="trial"
        data-tone="quiet"
      >
        <div className={styles.currentHead}>
          <p className={styles.eyebrow}>Twój plan</p>
          <p className={styles.statusPill}>Aktywny</p>
        </div>
        <div className={styles.trialIntro}>
          <h2>Okres próbny PRO</h2>
          <aside
            className={styles.currentAside}
            data-testid="trial-remaining"
            aria-label={remaining.spoken}
          >
            <p className={styles.remaining}>{remaining.value}</p>
            {remaining.measure ? (
              <p className={styles.remainingMeasure}>{remaining.measure}</p>
            ) : null}
            <p className={styles.remainingVerb}>{remaining.verb}</p>
          </aside>
          <p className={styles.currentLead}>Pełny dostęp do OurWed</p>
          <p className={styles.meta} data-testid="trial-ends-at">
            do {formatWarsawDate(entitlement.trialEndsAt)}
          </p>
        </div>
      </section>
    )
  }

  if (entitlement.source === 'admin_override' && entitlement.accessLevel === 'pro') {
    return (
      <section
        className={styles.current}
        data-testid="subscription-current"
        data-state="manual"
        data-tone="premium"
      >
        <div className={styles.currentMain}>
          <div className={styles.currentHead}>
            <div>
              <p className={styles.eyebrow}>Twój plan</p>
              <h2>PRO</h2>
            </div>
            <p className={styles.statusPill}>Aktywny</p>
          </div>
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
      <section
        className={styles.current}
        data-testid="subscription-current"
        data-state="paid"
        data-tone="premium"
      >
        <div className={styles.currentMain}>
          <div className={styles.currentHead}>
            <div>
              <p className={styles.eyebrow}>Twój plan</p>
              <h2>{isAnnual ? 'PRO Roczny' : 'PRO Miesięczny'}</h2>
            </div>
            <p className={styles.statusPill}>Aktywny</p>
          </div>
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
    <section
      className={styles.current}
      data-testid="subscription-current"
      data-state="expired"
      data-tone="quiet"
    >
      <div className={styles.currentMain}>
        <div className={styles.currentHead}>
          <div>
            <p className={styles.eyebrow}>Twój plan</p>
            <h2>Okres próbny zakończony</h2>
          </div>
        </div>
        <p className={styles.currentLead}>
          Twoje dane pozostają dostępne w trybie tylko do odczytu.
        </p>
        <p className={styles.reassure}>
          Po aktywacji PRO wszystkie funkcje odblokują się automatycznie. Aby
          tworzyć nowe zlecenia i edytować dane, wybierz plan PRO poniżej.
        </p>
      </div>
    </section>
  )
}

function WorkflowValue({ heading }: { heading: string }) {
  return (
    <section
      className={styles.value}
      aria-labelledby="pro-value-title"
      data-testid="pro-workflow-value"
    >
      <h2 id="pro-value-title" className={styles.sectionTitle}>
        {heading}
      </h2>
      <ul className={styles.valueGrid}>
        {PRO_VALUE_PILLARS.map((item) => {
          const Icon = item.Icon
          return (
            <li key={item.title} className={styles.valueItem}>
              <span className={styles.valueIcon} aria-hidden>
                <Icon width={20} height={20} />
              </span>
              <div className={styles.valueCopy}>
                <p className={styles.valueTitle}>{item.title}</p>
                <p className={styles.valueDesc}>{item.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function HistoryCard({ entitlement }: { entitlement: AccountEntitlement }) {
  const items = buildSubscriptionHistory(entitlement)
  return (
    <section
      className={styles.history}
      aria-labelledby="history-title"
      data-testid="subscription-history"
    >
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
