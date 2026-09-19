import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const travelCapabilities: readonly Capability[] = [
  {
    id: 'travel.settings',
    domain: 'travel',
    title: 'Ustawienia kosztów dojazdu',
    summary:
      'Domyślne reguły i stawki dojazdu konfigurujesz w Ustawieniach podróży. Ostateczną decyzję o dojeździe zapisujesz przy każdym zleceniu.',
    help: {
      steps: [
        'Otwórz Ustawienia → Podróż (/ustawienia/podroz).',
        'Skonfiguruj reguły i punkt startowy.',
      ],
      notes: [
        'Podpowiedź z ustawień nie zastępuje zapisu przy zleceniu.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/podroz',
      deepLinkQuality: 'direct',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'travel',
      verifiedAgainst: [
        'guideEducationContent.ts#finanse',
        'routes/router.tsx#/ustawienia/podroz',
        'settingsNav.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'travel.resolve_fee',
    domain: 'travel',
    title: 'Ustal dojazd przy zleceniu',
    summary:
      'Dojazd ustalasz osobno dla każdego zlecenia: nieustalony, w cenie albo płatna kwota. Tylko płatny dojazd dolicza się do wartości umowy.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Ustaw status dojazdu lub wpisz kwotę.',
        'Zapisz.',
      ],
      notes: [
        'OurWed może podpowiedzieć koszt z ustawień, ale decyzję zapisujesz przy zleceniu.',
        'Nierozliczony dojazd blokuje generowanie umowy (mayGenerateContract).',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=contract_finance',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'TRAVEL.RESOLVED', 'CONTRACT.READINESS'] },
    provenance: {
      ownerFeature: 'travel',
      verifiedAgainst: [
        'guideEducationContent.ts#finanse',
        'travelFeeCommercial.ts',
        'validateContractGeneration.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'travel.logistics_day',
    domain: 'travel',
    title: 'Trasa dnia operacyjnego',
    summary:
      'Trasa operacyjna dnia (studio → miejsca, bez powrotu) jest widoczna w planie dnia zlecenia; dystanse pochodzą z cache segmentów.',
    help: {
      steps: [
        'Otwórz zlecenie → Dzień ślubu.',
        'Sprawdź miejsca i kolejność trasy operacyjnej.',
      ],
      notes: [
        'Czas jazdy ≠ koszt dojazdu komercyjnego.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=wedding_day',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'travel',
      verifiedAgainst: [
        'logisticsAuthority.ts',
        'guideEducationContent.ts#dzien-slubu',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'travel.studio_start',
    domain: 'travel',
    title: 'Punkt startowy dojazdu',
    summary:
      'Punkt startowy (baza studia) do wyliczeń dojazdu ustawiasz w Ustawieniach podróży.',
    help: {
      steps: [
        'Otwórz /ustawienia/podroz.',
        'Ustaw lokalizację startową i zasady.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/podroz',
      deepLinkQuality: 'direct',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'travel',
      verifiedAgainst: [
        'TravelSettingsPage.tsx',
        'settingsNav.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
