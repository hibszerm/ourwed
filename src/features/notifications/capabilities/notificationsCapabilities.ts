import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const notificationsCapabilities: readonly Capability[] = [
  {
    id: 'notifications.center',
    domain: 'notifications',
    title: 'Powiadomienia',
    summary:
      'Powiadomienia o nowych danych od par (ankiety) widzisz w centrum Powiadomień.',
    help: {
      steps: [
        'Otwórz Powiadomienia (/powiadomienia).',
        'Przejrzyj i obsłuż alerty.',
      ],
    },
    navigation: {
      routePattern: '/powiadomienia',
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
      ownerFeature: 'notifications',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'guideEducationContent.ts#organizacja',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'notifications.preferences',
    domain: 'notifications',
    title: 'Preferencje powiadomień',
    summary:
      'Opcjonalne e-maile o uzupełnionych ankietach (dane do umowy i przedślubna) włączasz w Ustawieniach → Preferencje powiadomień. Alerty w aplikacji działają niezależnie w centrum Powiadomień.',
    help: {
      steps: [
        'Otwórz /ustawienia/powiadomienia.',
        'W sekcji E-mail włącz lub wyłącz alerty dla ankiety do umowy oraz ankiety przedślubnej.',
        'Gdy para uzupełni ankietę, dostaniesz też powiadomienie w aplikacji (/powiadomienia).',
      ],
      notes: [
        'Domyślnie e-mail dla tych zdarzeń jest włączony; możesz go wyłączyć w preferencjach.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/powiadomienia',
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
      ownerFeature: 'notifications',
      verifiedAgainst: [
        'pages/NotificationSettingsPage.tsx',
        'lib/api/notificationPreferencesService.ts',
        'lib/notifications/catalog.ts',
        'settingsNav.ts',
      ],
      lastVerified: '2026-09-19',
    },
  },
  {
    id: 'notifications.pending_inbox',
    domain: 'notifications',
    title: 'Skrzynka Oczekujące',
    summary:
      'Oczekujące to skrzynka wypełnionych ankiet do umowy wymagających Twojej decyzji przed utworzeniem zlecenia.',
    help: {
      steps: [
        'Otwórz /oczekujace.',
        'Zaakceptuj lub odrzuć odpowiedź.',
      ],
    },
    navigation: {
      routePattern: '/oczekujace',
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
      ownerFeature: 'notifications',
      verifiedAgainst: [
        'guideEducationContent.ts',
        'routes/router.tsx#/oczekujace',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
