import type { Capability } from '@/features/assistant/v7/knowledge/types'

export const calendarIntegrationsCapabilities: readonly Capability[] = [
  {
    id: 'calendar.integrations',
    domain: 'calendar',
    title: 'Integracje kalendarza',
    summary:
      'Kalendarze zewnętrzne ustawiasz w Ustawieniach → Integracje (/ustawienia/integracje): Google Calendar łączysz kontem (synchronizacja), Apple Calendar dodajesz jako prywatną subskrypcję w aplikacji Kalendarz na Apple.',
    help: {
      steps: [
        'Otwórz /ustawienia/integracje.',
        'Google Calendar: Połącz z Google Calendar i wybierz, co synchronizować.',
        'Apple Calendar: aktywuj i dodaj prywatny link subskrypcji w aplikacji Kalendarz (iPhone / Mac).',
      ],
      notes: [
        'Apple nie używa tego samego połączenia konta co Google — to subskrypcja kalendarza OurWed.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/integracje',
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
      ownerFeature: 'calendar-integrations',
      verifiedAgainst: [
        'pages/CalendarIntegrationsPage.tsx',
        'calendarIntegrationsService.ts',
        'settingsNav.ts',
        'routes/router.tsx#/ustawienia/integracje',
      ],
      lastVerified: '2026-09-19',
    },
  },
] as const
