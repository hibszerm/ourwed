import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const paymentsCapabilities: readonly Capability[] = [
  {
    id: 'payments.add',
    domain: 'payments',
    title: 'Dodaj wpłatę',
    summary:
      'Zaliczkę, płatność i kolejne wpłaty zapisujesz (odnotowujesz) w sekcji Umowa i finanse danego zlecenia. OurWed pokazuje, ile pozostało do rozliczenia.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Przejdź do Umowa i finanse.',
        'Wybierz dodanie wpłaty (lub zadatku).',
        'Uzupełnij kwotę i zapisz.',
      ],
      notes: [
        'Deep link prowadzi do zakładki — modal dodawania nie ma osobnego URL.',
        'Termin płatności końcowej ustala się dla całego zlecenia.',
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
      ownerFeature: 'finance',
      verifiedAgainst: [
        'guideEducationContent.ts#finanse',
        'ModernModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'payments.edit',
    domain: 'payments',
    title: 'Edytuj wpłatę',
    summary:
      'Edycja wpłaty: zmieniasz kwotę lub datę istniejącej wpłaty na liście płatności w Umowa i finanse.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Wybierz edycję wpłaty na liście.',
        'Zapisz zmiany.',
      ],
      notes: [
        'Modal edycji nie ma osobnego deep linku.',
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
      ownerFeature: 'finance',
      verifiedAgainst: [
        'ModernModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'payments.delete',
    domain: 'payments',
    title: 'Usuń wpłatę',
    summary:
      'Wpłatę usuwasz z listy płatności w Umowa i finanse; usunięcie wymaga potwierdzenia.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Wybierz usunięcie wpłaty.',
        'Potwierdź.',
      ],
      notes: [
        'Asystent nie usuwa wpłat.',
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
      ownerFeature: 'finance',
      verifiedAgainst: [
        'ModernModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'finance.studio_hub',
    domain: 'finance',
    title: 'Finanse studia',
    summary:
      'Hub Finanse (/finanse) pokazuje przekrój finansowy zleceń w skali studia.',
    help: {
      steps: [
        'Otwórz Finanse z nawigacji (/finanse).',
        'Przeglądaj wartości i statusy płatności w skali sezonu/listy.',
      ],
    },
    navigation: {
      routePattern: '/finanse',
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
      ownerFeature: 'finance',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'routes/router.tsx#/finanse',
        'guideEducationContent.ts#finanse',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'finance.wedding_overview',
    domain: 'finance',
    title: 'Finanse zlecenia',
    summary:
      'Wartość umowy, wpłaty i pozostałość do zapłaty widzisz w Umowa i finanse konkretnego zlecenia.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Przejdź do Umowa i finanse.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=contract_finance',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'finance',
      verifiedAgainst: [
        'ModernWeddingContractFinanceWorkspace.tsx',
        'guideEducationContent.ts#finanse',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'payments.add_deposit',
    domain: 'payments',
    title: 'Dodaj zadatek',
    summary:
      'Zadatek (zaliczkę) dodajesz osobnym przyciskiem w Umowa i finanse zlecenia.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Wybierz dodanie zadatku.',
        'Uzupełnij kwotę i zapisz.',
      ],
      notes: [
        'Modal nie ma osobnego URL.',
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
      ownerFeature: 'finance',
      verifiedAgainst: [
        'ModernModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'finance.remaining',
    domain: 'finance',
    title: 'Pozostało do zapłaty',
    summary:
      'Kwotę pozostałą do zapłaty OurWed liczy kanonicznie z wartości umowy i wpłat — widoczna w Umowa i finanse oraz hubie Finanse.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse albo /finanse.',
        'Sprawdź pozostałość do rozliczenia.',
      ],
      notes: [
        'Asystent podaje kwoty wyłącznie z narzędzi CRM.',
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
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'FIN.REMAINING'] },
    provenance: {
      ownerFeature: 'finance',
      verifiedAgainst: [
        'financeAuthority.ts',
        'ModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
