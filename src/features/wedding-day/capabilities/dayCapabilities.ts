import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const dayCapabilities: readonly Capability[] = [
  {
    id: 'day.places.edit',
    domain: 'day',
    title: 'Zmień miejsca dnia ślubu',
    summary:
      'Miejsca dnia ślubu (przygotowania, ceremonia, przyjęcie) edytujesz na karcie w zakładce Dzień ślubu.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Przejdź do Dzień ślubu.',
        'Edytuj role miejsc i zapisz.',
      ],
      notes: [
        'Część danych może pochodzić z ankiety przedślubnej.',
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
      ownerFeature: 'wedding-day',
      verifiedAgainst: [
        'weddingWorkspaceSelectors.ts#LOCATION_ROLES',
        'guideEducationContent.ts#dzien-slubu',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'day.schedule.edit',
    domain: 'day',
    title: 'Plan / harmonogram dnia',
    summary:
      'Harmonogram i ustalenia dnia realizacji edytujesz w zakładce Dzień ślubu (oraz częściowo po ankiecie przedślubnej).',
    help: {
      steps: [
        'Otwórz zlecenie → Dzień ślubu.',
        'Uzupełnij plan / czasy operacyjne.',
        'Zapisz.',
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
      ownerFeature: 'wedding-day',
      verifiedAgainst: [
        'guideEducationContent.ts#dzien-slubu',
        'operationalDayPlan',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'day.cockpit',
    domain: 'day',
    title: 'Widok dnia ślubu (cockpit)',
    summary:
      'W dniu realizacji masz pod ręką dane zlecenia w przestrzeni dnia ślubu na karcie (oraz powiązane widoki operacyjne).',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Wejdź w Dzień ślubu / widok realizacji.',
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
      ownerFeature: 'wedding-day',
      verifiedAgainst: [
        'routes/router.tsx#dzien-slubu',
        'wedding-day-cockpit',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'day.brief',
    domain: 'day',
    title: 'Wedding Brief PDF',
    summary:
      'Wedding Brief PDF zbiera ustalenia dnia z danych zlecenia — generujesz go z karty zlecenia, gdy dane są kompletne.',
    help: {
      steps: [
        'Uzupełnij dane dnia i miejsca.',
        'Uruchom generowanie Wedding Brief z karty zlecenia.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId',
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
      ownerFeature: 'wedding-day',
      verifiedAgainst: [
        'guideEducationContent.ts#dzien-slubu',
        'ModernWeddingDetailHeader.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'day.standalone_route',
    domain: 'day',
    title: 'Dzień ślubu — pełny widok',
    summary:
      'Pełny widok dnia ślubu jest też dostępny pod /sluby/:weddingId/dzien-slubu.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Wejdź w Dzień ślubu z karty lub bezpośrednio po URL dnia.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId/dzien-slubu',
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
      ownerFeature: 'wedding-day',
      verifiedAgainst: [
        'routes/router.tsx#dzien-slubu',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
