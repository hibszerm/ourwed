/**
 * Founder qualification chapter — continues the same black Founder surface.
 * Editorial self-selection; no feature demos; no sticky choreography; no motion.
 */

export const LV2_QUALIFICATION_OPENING = {
  eyebrow: 'DLA KOGO JEST OURWED?',
  headlineLine1: 'OurWed będzie dla Ciebie,',
  headlineLine2: 'jeśli nie chcesz już prowadzić',
  headlineLine3: 'zleceń z pamięci.',
  support:
    'Jeśli informacje o zleceniach nadal żyją w kilku miejscach, znasz problem, który OurWed ma uporządkować.',
} as const

export const LV2_QUALIFICATION_SIGNALS = [
  {
    id: '01',
    headline: 'Ustalenia są w wiadomościach.',
    support:
      'A umowa, płatności, terminy i kolejne informacje żyją gdzie indziej.',
  },
  {
    id: '02',
    headline: 'Przed ślubem wracasz do rozmów.',
    support:
      'Szukasz godziny, adresu, kontaktu albo ustalenia, które na pewno gdzieś było zapisane.',
  },
  {
    id: '03',
    headline: 'Część sezonu nadal masz w głowie.',
    support:
      'Im więcej zleceń, tym więcej rzeczy trzeba pamiętać, sprawdzać i pilnować.',
  },
  {
    id: '04',
    headline: 'Twój obecny system działa. Ale wymaga Ciebie.',
    support:
      'OurWed ma zmniejszyć liczbę rzeczy, których musisz szukać i o których musisz pamiętać.',
  },
] as const

export const LV2_QUALIFICATION_AUDIENCE = {
  eyebrow: 'ZAPROJEKTOWANE DLA TWÓRCÓW ŚLUBNYCH',
  labels: ['Fotografowie', 'Filmowcy', 'Duety foto + video', 'Twórcy ślubni'] as const,
  support:
    'Niezależnie od tego, czy pracujesz sam czy w duecie — najważniejsze informacje o zleceniu powinny być w jednym miejscu.',
} as const
