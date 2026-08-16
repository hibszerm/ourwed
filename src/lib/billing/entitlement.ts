export type AccessLevel = 'pro' | 'expired'
export type EntitlementSource =
  | 'trial'
  | 'paid_subscription'
  | 'admin_override'
  | 'none'
export type BillingInterval = 'month' | 'year' | null
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'expired'
  | 'past_due'
  | 'canceled'
  | 'manual'

export type AccountEntitlement = {
  accessLevel: AccessLevel
  source: EntitlementSource
  plan: 'pro'
  billingInterval: BillingInterval
  status: SubscriptionStatus | string
  subscriptionStatus?: string
  trialStartedAt: string | null
  trialEndsAt: string | null
  trialTotalDays: number | null
  currentPeriodStartedAt: string | null
  currentPeriodEndsAt: string | null
  manualAccessUntil: string | null
  manualAccessIndefinite: boolean
  provider: string | null
  providerStatus: string | null
  cancelAtPeriodEnd: boolean
  daysRemaining: number | null
  canUseProFeatures: boolean
  billingAccountId: string | null
  subscriptionId?: string | null
}

export type SubscriptionSummary = {
  entitlement: AccountEntitlement
  plans: unknown
  paymentsAvailable: boolean
  paymentsMessage: string
}

export type TrialRemainingKind =
  | 'days'
  | 'one_day'
  | 'today'
  | 'ended'

export type TrialTimeRemaining = {
  kind: TrialRemainingKind
  fullDays: number
  label: string
  endingSoon: boolean
  ended: boolean
}

/**
 * Presentation helper for trial countdown.
 * Database entitlement remains authoritative for access.
 */
export function getTrialTimeRemaining(
  endsAt: string | Date | null | undefined,
  now: Date = new Date(),
): TrialTimeRemaining {
  if (!endsAt) {
    return {
      kind: 'ended',
      fullDays: 0,
      label: 'Okres próbny zakończony',
      endingSoon: false,
      ended: true,
    }
  }
  const end = typeof endsAt === 'string' ? new Date(endsAt) : endsAt
  const ms = end.getTime() - now.getTime()
  if (ms <= 0) {
    return {
      kind: 'ended',
      fullDays: 0,
      label: 'Okres próbny zakończony',
      endingSoon: false,
      ended: true,
    }
  }
  const hours = ms / (1000 * 60 * 60)
  if (hours < 24) {
    return {
      kind: 'today',
      fullDays: 0,
      label: 'Kończy się dzisiaj',
      endingSoon: true,
      ended: false,
    }
  }
  const fullDays = Math.floor(hours / 24)
  if (fullDays === 1) {
    return {
      kind: 'one_day',
      fullDays: 1,
      label: 'Jeszcze 1 dzień',
      endingSoon: true,
      ended: false,
    }
  }
  return {
    kind: 'days',
    fullDays,
    label: `Jeszcze ${fullDays} dni`,
    endingSoon: fullDays <= 7,
    ended: false,
  }
}

export function trialProgressRatio(
  startedAt: string | null,
  endsAt: string | null,
  now: Date = new Date(),
): number {
  if (!startedAt || !endsAt) return 0
  const start = new Date(startedAt).getTime()
  const end = new Date(endsAt).getTime()
  if (end <= start) return 1
  const t = now.getTime()
  return Math.min(1, Math.max(0, (t - start) / (end - start)))
}

export function formatWarsawDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

export function formatWarsawShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw',
      day: 'numeric',
      month: 'long',
    }).format(new Date(iso))
  } catch {
    return '—'
  }
}

export function sidebarSubscriptionCopy(
  entitlement: AccountEntitlement,
  now: Date = new Date(),
): {
  title: string
  subtitle: string
  tone: 'default' | 'warm' | 'warmStrong' | 'muted'
  cta: 'choose_plan' | 'manage' | null
  ctaLabel: string | null
  showProgress: boolean
  progress: number
} {
  const { source, accessLevel, billingInterval } = entitlement

  if (source === 'admin_override' && accessLevel === 'pro') {
    if (entitlement.manualAccessIndefinite) {
      return {
        title: 'PRO',
        subtitle: 'Dostęp bezterminowy',
        tone: 'default',
        cta: 'manage',
        ctaLabel: null,
        showProgress: false,
        progress: 1,
      }
    }
    return {
      title: 'PRO',
      subtitle: `Aktywny do ${formatWarsawShortDate(entitlement.manualAccessUntil)}`,
      tone: 'default',
      cta: 'manage',
      ctaLabel: null,
      showProgress: false,
      progress: 1,
    }
  }

  if (source === 'paid_subscription' && accessLevel === 'pro') {
    if (billingInterval === 'year') {
      return {
        title: 'PRO Roczny',
        subtitle: `Aktywny do ${formatWarsawShortDate(entitlement.currentPeriodEndsAt)}`,
        tone: 'default',
        cta: 'manage',
        ctaLabel: null,
        showProgress: false,
        progress: 1,
      }
    }
    return {
      title: 'PRO Miesięczny',
      subtitle: `Aktywny do ${formatWarsawShortDate(entitlement.currentPeriodEndsAt)}`,
      tone: 'default',
      cta: 'manage',
      ctaLabel: null,
      showProgress: false,
      progress: 1,
    }
  }

  if (source === 'trial' && accessLevel === 'pro') {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt, now)
    const progress = trialProgressRatio(
      entitlement.trialStartedAt,
      entitlement.trialEndsAt,
      now,
    )
    if (rem.kind === 'today') {
      return {
        title: 'Okres próbny PRO',
        subtitle: 'Kończy się dzisiaj',
        tone: 'warmStrong',
        cta: 'choose_plan',
        ctaLabel: 'Wybierz plan',
        showProgress: true,
        progress,
      }
    }
    if (rem.fullDays <= 3) {
      return {
        title: 'Okres próbny PRO',
        subtitle:
          rem.fullDays === 1
            ? '1 dzień pozostał'
            : `${rem.fullDays} dni pozostało`,
        tone: 'warmStrong',
        cta: 'choose_plan',
        ctaLabel: 'Wybierz plan',
        showProgress: true,
        progress,
      }
    }
    if (rem.endingSoon) {
      return {
        title: 'Okres próbny PRO',
        subtitle: `${rem.fullDays} dni pozostało`,
        tone: 'warm',
        cta: 'choose_plan',
        ctaLabel: 'Wybierz plan',
        showProgress: true,
        progress,
      }
    }
    return {
      title: 'Okres próbny PRO',
      subtitle: `${rem.fullDays} dni pozostało`,
      tone: 'default',
      cta: 'choose_plan',
      ctaLabel: 'Wybierz plan',
      showProgress: true,
      progress,
    }
  }

  return {
    title: 'Okres próbny zakończony',
    subtitle: 'Aktywuj PRO',
    tone: 'muted',
    cta: 'choose_plan',
    ctaLabel: 'Wybierz plan',
    showProgress: false,
    progress: 1,
  }
}

export type SubscriptionHistoryStatus =
  | 'active'
  | 'scheduled'
  | 'ended'
  | 'revoked'

export type SubscriptionHistoryItem = {
  id: string
  title: string
  detail: string
  status: SubscriptionHistoryStatus
  statusLabel: string
}

/**
 * Derive factual lifecycle rows from entitlement timestamps — no fake payments.
 * Status labels: Aktywne | Zaplanowane | Zakończone | Cofnięte
 * (Cofnięte only when revocation is known — not inferred.)
 */
export function buildSubscriptionHistory(
  entitlement: AccountEntitlement,
  now: Date = new Date(),
): SubscriptionHistoryItem[] {
  const items: SubscriptionHistoryItem[] = []

  if (entitlement.trialStartedAt) {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt, now)
    const trialLive =
      entitlement.source === 'trial' && entitlement.accessLevel === 'pro' && !rem.ended
    items.push({
      id: 'trial-started',
      title: 'Okres próbny rozpoczęty',
      detail: formatWarsawDate(entitlement.trialStartedAt),
      status: trialLive ? 'active' : 'ended',
      statusLabel: trialLive ? 'Aktywne' : 'Zakończone',
    })
  }

  if (entitlement.trialEndsAt) {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt, now)
    if (!rem.ended && entitlement.source === 'trial' && entitlement.accessLevel === 'pro') {
      items.push({
        id: 'trial-ends',
        title: 'Okres próbny zakończy się',
        detail: formatWarsawDate(entitlement.trialEndsAt),
        status: 'scheduled',
        statusLabel: 'Zaplanowane',
      })
      items.push({
        id: 'post-trial',
        title: 'Dostęp po okresie próbnym',
        detail: 'Wybierz plan PRO, aby kontynuować pełny dostęp.',
        status: 'scheduled',
        statusLabel: 'Zaplanowane',
      })
    } else if (rem.ended) {
      items.push({
        id: 'trial-ended',
        title: 'Okres próbny zakończony',
        detail: formatWarsawDate(entitlement.trialEndsAt),
        status: 'ended',
        statusLabel: 'Zakończone',
      })
    }
  }

  if (entitlement.source === 'admin_override' && entitlement.accessLevel === 'pro') {
    items.push({
      id: 'manual-pro',
      title: 'PRO przyznane ręcznie',
      detail: entitlement.manualAccessIndefinite
        ? 'Bezterminowo'
        : `Aktywne do ${formatWarsawDate(entitlement.manualAccessUntil)}`,
      status: 'active',
      statusLabel: 'Aktywne',
    })
  }

  if (entitlement.source === 'paid_subscription' && entitlement.accessLevel === 'pro') {
    items.push({
      id: 'paid-active',
      title:
        entitlement.billingInterval === 'year' ? 'PRO Roczny aktywny' : 'PRO Miesięczny aktywny',
      detail: entitlement.currentPeriodEndsAt
        ? `Okres do ${formatWarsawDate(entitlement.currentPeriodEndsAt)}`
        : 'Aktywne',
      status: 'active',
      statusLabel: 'Aktywne',
    })
  }

  return items
}

export function adminSubscriptionBadge(
  entitlement: AccountEntitlement,
  now: Date = new Date(),
): string {
  if (entitlement.source === 'admin_override' && entitlement.accessLevel === 'pro') {
    return 'PRO · ręczny'
  }
  if (entitlement.source === 'paid_subscription' && entitlement.accessLevel === 'pro') {
    if (entitlement.billingInterval === 'year') return 'PRO roczny'
    if (entitlement.billingInterval === 'month') return 'PRO miesięczny'
    return 'PRO'
  }
  if (entitlement.source === 'trial' && entitlement.accessLevel === 'pro') {
    const rem = getTrialTimeRemaining(entitlement.trialEndsAt, now)
    if (rem.ended) return 'Wygasł'
    if (rem.kind === 'today') return 'Okres próbny · dziś'
    return `Okres próbny · ${rem.fullDays} dni`
  }
  if (entitlement.status === 'past_due') return 'Problem z płatnością'
  return 'Wygasł'
}
