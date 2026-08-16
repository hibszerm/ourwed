/**
 * Canonical commercial plan catalog — landing + app + future checkout.
 * Describes the OFFER, not what a customer owns.
 */

export const BILLING_CURRENCY = 'PLN' as const

export const PRO_PLAN = {
  id: 'pro',
  trialDays: 30,
  monthly: {
    interval: 'month' as const,
    amountPln: 49,
    label: '49 zł',
    periodLabel: '/ miesiąc',
  },
  annual: {
    interval: 'year' as const,
    amountPln: 490,
    label: '490 zł',
    periodLabel: '/ rok',
    monthlyEquivalentLabel: '40,83 zł / miesiąc',
    savingPln: 98,
    savingPercent: 17,
    savingLabel: 'Oszczędzasz 98 zł rocznie',
    discountLabel: '17% taniej niż plan miesięczny',
    recommendedBadge: 'Najlepsza wartość',
  },
} as const

/** Shared PRO capability bullets — only ship features that exist in product. */
export const PRO_CAPABILITIES = [
  'Zlecenia ślubne i sesje',
  'Ankiety dla klientów',
  'Generowanie dokumentów',
  'Finanse i rozliczenia',
  'Plan dnia',
  'Brief PDF',
  'Kalendarze i terminy',
  'Powiadomienia',
] as const

/** Compact benefit points beside plan cards (offer messaging, not entitlement). */
export const PLAN_REASSURANCE = [
  {
    title: 'Bez karty płatniczej',
    description: 'Zacznij teraz. Płatność dopiero po wyborze planu.',
  },
  {
    title: 'Elastyczny wybór',
    description:
      'Wybierasz plan miesięczny albo roczny — wtedy, gdy chcesz kontynuować.',
  },
  {
    title: 'Pełny dostęp',
    description: 'Wszystkie funkcje PRO są dostępne już w okresie próbnym.',
  },
] as const

export const TRIAL_HIGHLIGHTS = [
  '30 dni pełnego dostępu',
  'Bez karty płatniczej',
  'Po okresie próbnym wybierasz, czy kontynuować z PRO',
] as const

/** @deprecated Prefer PRO_PLAN — kept for landing imports during transition */
export const LANDING_PRICING = {
  trialDays: PRO_PLAN.trialDays,
  monthlyPrice: PRO_PLAN.monthly.amountPln,
  annualPrice: PRO_PLAN.annual.amountPln,
  annualSaving: PRO_PLAN.annual.savingPln,
  annualSavingPercent: PRO_PLAN.annual.savingPercent,
  monthlyEquivalentLabel: PRO_PLAN.annual.monthlyEquivalentLabel,
  monthlyPriceLabel: PRO_PLAN.monthly.label,
  annualPriceLabel: PRO_PLAN.annual.label,
  annualSavingLabel: PRO_PLAN.annual.savingLabel,
  annualDiscountLabel: '17% taniej',
  /** Marketing-only landing line; not a billing entitlement. */
  annualBonusLabel: '2 miesiące gratis',
} as const

export const LANDING_PRO_FEATURES = PRO_CAPABILITIES

export const LANDING_TRIAL_FEATURES = [
  'Wszystkie funkcje Pro',
  'Bez ograniczania modułów',
  'Bez karty płatniczej',
  'Rezygnacja w dowolnym momencie okresu próbnego',
] as const
