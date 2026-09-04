/**
 * Landing V2 conversion FAQ — answers only from verified product/billing truth.
 * Source: planCatalog + documented product behavior (no inventing payment/legal terms).
 */

import { PRO_PLAN, TRIAL_HIGHLIGHTS } from '@/lib/billing/planCatalog'

export type LandingFaqItem = {
  id: string
  question: string
  answer: string
  /** Short provenance for acceptance / audit. */
  source: string
}

export const LV2_CONVERSION_FAQ: readonly LandingFaqItem[] = [
  {
    id: 'change-plan',
    question: 'Czy mogę zmienić plan później?',
    answer:
      'Tak. Po okresie próbnym wybierasz plan miesięczny albo roczny — wtedy, gdy chcesz kontynuować.',
    source: 'planCatalog PLAN_REASSURANCE / TRIAL_HIGHLIGHTS',
  },
  {
    id: 'wedding-limit',
    question: 'Czy liczba zleceń jest limitowana?',
    answer:
      'Nie. Aktualny plan Pro nie wprowadza limitu liczby zleceń — korzystasz z pełnego dostępu do modułów OurWed.',
    source: 'planCatalog — no maxWeddings / wedding caps in billing',
  },
  {
    id: 'mobile',
    question: 'Czy mogę korzystać z OurWed na telefonie?',
    answer:
      'Tak. OurWed działa w przeglądarce na telefonie — możesz sprawdzić zlecenie, brief i harmonogram także w terenie.',
    source: 'product web app + existing FAQ truth (responsive, not native store app)',
  },
  {
    id: 'import',
    question: 'Czy mogę przenieść istniejące zlecenia do OurWed?',
    answer:
      'Tak. Możesz zaimportować sezon z arkusza (xlsx) — mapujesz kolumny i tworzysz zlecenia w OurWed.',
    source: 'src/features/weddings/import — spreadsheet import pipeline',
  },
  {
    id: 'all-features',
    question: 'Czy wszystkie funkcje są dostępne w każdym planie?',
    answer:
      'OurWed ma jeden plan Pro. W okresie próbnym i po wyborze Pro masz dostęp do tych samych funkcji produktu.',
    source: 'planCatalog — single pro SKU; PRO_CAPABILITIES shared',
  },
  {
    id: 'trial',
    question: 'Jak działa okres próbny?',
    answer: `Dostajesz ${PRO_PLAN.trialDays} dni pełnego dostępu bez karty płatniczej. Po tym czasie decydujesz, czy kontynuować z Pro.`,
    source: `planCatalog trialDays=${PRO_PLAN.trialDays}; ${TRIAL_HIGHLIGHTS.join('; ')}`,
  },
  {
    id: 'stop-trial',
    question: 'Czy mogę zakończyć korzystanie w okresie próbnym?',
    answer:
      'Tak. W okresie próbnym możesz zakończyć korzystanie w dowolnym momencie. Płatności online będą dostępne wkrótce — obecnie rejestracja nie wymaga karty.',
    source: 'LANDING_TRIAL_FEATURES trial-scoped exit; UnavailableBillingProvider',
  },
] as const
