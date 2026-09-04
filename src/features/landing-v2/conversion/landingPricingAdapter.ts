/**
 * Thin landing adapter over canonical planCatalog — no duplicated commercial amounts.
 *
 * Commercial model: ONE OurWed Pro + monthly/annual billing cards + trial as trust.
 */

import { PRO_CAPABILITIES, PRO_PLAN } from '@/lib/billing/planCatalog'

/** Decision-relevant inclusions — ONE shared list for both billing cards. */
export const LANDING_PRO_DECISION_CAPABILITIES = PRO_CAPABILITIES.slice(0, 6)

export type LandingBillingOption = {
  id: 'pro-month' | 'pro-year'
  cadence: 'month' | 'year'
  /** Card title under OurWed Pro eyebrow — e.g. "Pro miesięcznie" */
  title: string
  priceLabel: string
  periodLabel: string
  supportLine1: string
  supportLine2: string
  recommended?: boolean
  badge?: string
  secondaryPriceHint?: string
  savingLabel?: string
}

export type LandingProProduct = {
  name: string
  capabilitiesLabel: string
  capabilities: readonly string[]
  ctaLabel: string
  ctaTo: '/register'
  billing: readonly LandingBillingOption[]
}

export function getLandingBillingOptions(): readonly LandingBillingOption[] {
  return [
    {
      id: 'pro-month',
      cadence: 'month',
      title: 'Pro miesięcznie',
      priceLabel: PRO_PLAN.monthly.label,
      periodLabel: PRO_PLAN.monthly.periodLabel,
      supportLine1: 'Pełny dostęp do OurWed Pro.',
      supportLine2: 'Rozliczenie co miesiąc.',
    },
    {
      id: 'pro-year',
      cadence: 'year',
      title: 'Pro rocznie',
      priceLabel: PRO_PLAN.annual.label,
      periodLabel: PRO_PLAN.annual.periodLabel,
      supportLine1: 'Pełny dostęp do OurWed Pro.',
      supportLine2: 'Rozliczenie raz w roku.',
      recommended: true,
      badge: PRO_PLAN.annual.recommendedBadge,
      secondaryPriceHint: PRO_PLAN.annual.monthlyEquivalentLabel,
      savingLabel: PRO_PLAN.annual.savingLabel,
    },
  ]
}

export function getLandingProProduct(): LandingProProduct {
  return {
    name: 'OurWed Pro',
    capabilitiesLabel: 'Najważniejsze funkcje',
    capabilities: LANDING_PRO_DECISION_CAPABILITIES,
    ctaLabel: 'Załóż konto',
    ctaTo: '/register',
    billing: getLandingBillingOptions(),
  }
}

export function getLandingPricingCopy() {
  return {
    eyebrow: 'CENNIK',
    headlineLine1: 'Jeden plan.',
    headlineLine2: 'Całe OurWed.',
    support: 'Pełny dostęp do OurWed Pro. Wybierasz tylko sposób rozliczenia.',
    trialBox: {
      eyebrow: `${PRO_PLAN.trialDays} DNI PEŁNEGO DOSTĘPU`,
      headline: `Wypróbuj OurWed Pro przez ${PRO_PLAN.trialDays} dni.`,
      support: 'Bez karty płatniczej.',
      ctaLabel: 'Zacznij bezpłatnie',
      ctaTo: '/register' as const,
    },
    ctaTrust: `${PRO_PLAN.trialDays} dni pełnego dostępu · Bez karty płatniczej`,
    registerTo: '/register' as const,
    currency: 'PLN' as const,
    trialDays: PRO_PLAN.trialDays,
  }
}

/** @deprecated Prefer getLandingProProduct — kept for transition of older callers. */
export function getLandingPricingOffers() {
  const product = getLandingProProduct()
  return product.billing.map((option) => ({
    id: option.id,
    kind: 'paid' as const,
    name: option.title,
    priceLabel: option.priceLabel,
    periodLabel: option.periodLabel,
    support: `${option.supportLine1} ${option.supportLine2}`,
    features: product.capabilities,
    ctaLabel: product.ctaLabel,
    ctaTo: product.ctaTo,
    recommended: option.recommended,
    badge: option.badge,
    secondaryPriceHint: option.secondaryPriceHint,
    savingLabel: option.savingLabel,
  }))
}

/** Verified final-CTA friction lines only — no paid cancel claim. */
export function getLandingFinalCtaTrust() {
  return [
    `${PRO_PLAN.trialDays} dni pełnego dostępu`,
    'Bez karty płatniczej',
  ] as const
}
