/**
 * Landing-demo pricing configuration — experimental presentation only.
 * Not connected to checkout, billing, or subscriptions.
 */
export const LANDING_PRICING = {
  trialDays: 30,
  monthlyPrice: 49,
  annualPrice: 490,
  annualSaving: 98,
  annualSavingPercent: 17,
  monthlyEquivalentLabel: '40,83 zł / miesiąc',
  monthlyPriceLabel: '49 zł',
  annualPriceLabel: '490 zł',
  annualSavingLabel: 'Oszczędzasz 98 zł rocznie',
  annualDiscountLabel: '17% taniej',
  annualBonusLabel: '2 miesiące gratis',
} as const

export const LANDING_PRO_FEATURES = [
  'Nielimitowane śluby i sesje',
  'Ankiety do umowy i przedślubne',
  'Własne szablony dokumentów',
  'Płatności i podsumowania finansowe',
  'Google Calendar i Apple Calendar',
  'Brief PDF',
] as const

export const LANDING_TRIAL_FEATURES = [
  'Wszystkie funkcje Pro',
  'Bez ograniczania modułów',
  'Bez karty płatniczej',
  'Rezygnacja w dowolnym momencie okresu próbnego',
] as const
