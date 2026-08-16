/**
 * Unit tests for entitlement presentation + precedence helpers.
 * Controlled `now` — no global clock mutation.
 */
import {
  adminSubscriptionBadge,
  buildSubscriptionHistory,
  getTrialTimeRemaining,
  sidebarSubscriptionCopy,
  type AccountEntitlement,
} from '@/lib/billing/entitlement'
import { PLAN_REASSURANCE, PRO_PLAN } from '@/lib/billing/planCatalog'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL entitlement — ${msg}`)
}

function base(overrides: Partial<AccountEntitlement> = {}): AccountEntitlement {
  return {
    accessLevel: 'pro',
    source: 'trial',
    plan: 'pro',
    billingInterval: null,
    status: 'trialing',
    trialStartedAt: '2026-07-01T00:00:00.000Z',
    trialEndsAt: '2026-07-31T00:00:00.000Z',
    trialTotalDays: 30,
    currentPeriodStartedAt: null,
    currentPeriodEndsAt: null,
    manualAccessUntil: null,
    manualAccessIndefinite: false,
    provider: null,
    providerStatus: null,
    cancelAtPeriodEnd: false,
    daysRemaining: 10,
    canUseProFeatures: true,
    billingAccountId: 'ba-1',
    subscriptionId: 'sub-1',
    ...overrides,
  }
}

const day1 = new Date('2026-07-01T12:00:00.000Z')
const day23 = new Date('2026-07-23T12:00:00.000Z')
const day28 = new Date('2026-07-28T12:00:00.000Z')
const almostEnd = new Date('2026-07-30T18:00:00.000Z')

{
  const rem = getTrialTimeRemaining('2026-07-31T00:00:00.000Z', day1)
  assert(rem.kind === 'days' && rem.fullDays === 29, 'day1 ~29 full days')
}

{
  const copy = sidebarSubscriptionCopy(base(), day1)
  assert(copy.title === 'Okres próbny PRO', 'sidebar trial title')
  assert(copy.subtitle === '29 dni pozostało', 'sidebar compact remaining')
}

{
  const copy = sidebarSubscriptionCopy(base(), day23)
  assert(copy.tone === 'warm', 'warm at 7 days')
}

{
  const copy = sidebarSubscriptionCopy(base(), day28)
  assert(copy.tone === 'warmStrong', 'stronger warm at <=3')
}

{
  const copy = sidebarSubscriptionCopy(base(), almostEnd)
  assert(copy.subtitle === 'Kończy się dzisiaj', 'today sidebar')
}

{
  const copy = sidebarSubscriptionCopy(
    base({
      source: 'paid_subscription',
      billingInterval: 'month',
      status: 'active',
      currentPeriodEndsAt: '2026-09-12T00:00:00.000Z',
    }),
  )
  assert(copy.title === 'PRO Miesięczny', 'monthly title')
  assert(copy.subtitle.startsWith('Aktywny do'), 'monthly active until')
  assert(!/bez limitu/i.test(copy.subtitle), 'no unlimited on monthly')
}

{
  const copy = sidebarSubscriptionCopy(
    base({
      source: 'paid_subscription',
      billingInterval: 'year',
      status: 'active',
      currentPeriodEndsAt: '2027-08-12T00:00:00.000Z',
    }),
  )
  assert(copy.title === 'PRO Roczny', 'annual title')
  assert(copy.subtitle.startsWith('Aktywny do'), 'annual active until')
}

{
  const copy = sidebarSubscriptionCopy(
    base({
      source: 'admin_override',
      status: 'manual',
      manualAccessIndefinite: true,
    }),
  )
  assert(copy.title === 'PRO', 'manual title')
  assert(copy.subtitle === 'Dostęp bezterminowy', 'indefinite sidebar')
}

{
  const copy = sidebarSubscriptionCopy(
    base({
      source: 'admin_override',
      status: 'manual',
      manualAccessUntil: '2026-12-31T00:00:00.000Z',
    }),
  )
  assert(copy.subtitle.startsWith('Aktywny do'), 'dated manual sidebar')
}

{
  const copy = sidebarSubscriptionCopy(
    base({ accessLevel: 'expired', source: 'none', canUseProFeatures: false }),
  )
  assert(copy.title === 'Okres próbny zakończony', 'expired sidebar')
  assert(copy.subtitle === 'Aktywuj PRO', 'activate PRO copy')
}

{
  const history = buildSubscriptionHistory(base(), day1)
  assert(history.some((h) => h.id === 'trial-started' && h.statusLabel === 'Aktywne'), 'history start')
  assert(history.some((h) => h.id === 'trial-ends' && h.statusLabel === 'Zaplanowane'), 'history end')
  assert(history.some((h) => h.id === 'post-trial' && h.statusLabel === 'Zaplanowane'), 'history post trial scheduled')
  assert(!history.some((h) => h.statusLabel === 'Wymaga akcji'), 'no action_required label')
  assert(!history.some((h) => h.statusLabel === 'Zapisane'), 'no legacy Zapisane')
  assert(!history.some((h) => /płatn|invoice|stripe/i.test(h.title + h.detail)), 'no fake payments')
  for (const h of history) {
    assert(
      ['Aktywne', 'Zaplanowane', 'Zakończone', 'Cofnięte'].includes(h.statusLabel),
      `allowed status: ${h.statusLabel}`,
    )
  }
}

{
  const history = buildSubscriptionHistory(
    base({
      source: 'admin_override',
      status: 'manual',
      manualAccessIndefinite: true,
      accessLevel: 'pro',
    }),
    day1,
  )
  const manual = history.find((h) => h.id === 'manual-pro')
  assert(manual?.detail === 'Bezterminowo', 'manual indefinite history')
  assert(manual?.statusLabel === 'Aktywne', 'manual active')
}

assert(adminSubscriptionBadge(base(), day23).startsWith('Okres próbny'), 'admin badge trial')

assert(PRO_PLAN.monthly.amountPln === 49, 'monthly 49')
assert(PRO_PLAN.annual.amountPln === 490, 'annual 490')
assert(PRO_PLAN.annual.savingPln === 98, 'saving 98')
assert(PRO_PLAN.annual.savingPercent === 17, '17%')

assert(PLAN_REASSURANCE[1]?.title === 'Elastyczny wybór', 'benefit flexible choice')
assert(!PLAN_REASSURANCE.some((b) => /anuluj/i.test(b.title + b.description)), 'no cancel claim')

console.log('PASS  billing entitlement presentation')
