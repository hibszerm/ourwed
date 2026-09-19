import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const packagesCapabilities: readonly Capability[] = [
  {
    id: 'packages.manage',
    domain: 'packages',
    title: 'Pakiety studia',
    summary:
      'Pakiety oferty studia i wzory umów DOCX ustawiasz w Studio → Pakiety (/studio/pakiety).',
    help: {
      steps: [
        'Otwórz /studio/pakiety.',
        'Dodaj lub edytuj pakiet i przypisz wzór umowy.',
      ],
      notes: [
        'Zmiana pakietów nie aktualizuje automatycznie wcześniej utworzonych ankiet do umowy.',
      ],
    },
    navigation: {
      routePattern: '/studio/pakiety',
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
      ownerFeature: 'studio',
      verifiedAgainst: [
        'guideEducationContent.ts#umowy',
        'routes/router.tsx#/studio/pakiety',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'packages.assign_wedding',
    domain: 'packages',
    title: 'Przypisz pakiet do zlecenia',
    summary:
      'Pakiet przypisujesz na karcie zlecenia w Umowa i finanse (sekcja pakietu).',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Wybierz lub zmień pakiet i zapisz.',
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
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'studio',
      verifiedAgainst: [
        'ModernModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'extras.manage',
    domain: 'extras',
    title: 'Usługi dodatkowe',
    summary:
      'Katalog usług dodatkowych (extras) zarządzasz w Studio → Usługi dodatkowe.',
    help: {
      steps: [
        'Otwórz /studio/uslugi.',
        'Dodaj lub edytuj usługę dodatkową.',
      ],
    },
    navigation: {
      routePattern: '/studio/uslugi',
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
      ownerFeature: 'studio',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'routes/router.tsx#/studio/uslugi',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'extras.assign_wedding',
    domain: 'extras',
    title: 'Dodaj usługę dodatkową do zlecenia',
    summary:
      'Usługę dodatkową (extras) do zlecenia dodajesz w Umowa i finanse na karcie zlecenia.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Dodaj lub zmień usługi dodatkowe przypisane do zlecenia.',
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
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'studio',
      verifiedAgainst: [
        'guideEducationContent.ts#finanse',
        'ModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
