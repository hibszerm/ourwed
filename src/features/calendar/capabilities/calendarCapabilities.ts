import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const calendarCapabilities: readonly Capability[] = [
  {
    id: 'calendar.open',
    domain: 'calendar',
    title: 'Kalendarz',
    summary:
      'Kalendarz łączy daty zleceń i sesji w jednym widoku.',
    help: {
      steps: [
        'Otwórz Kalendarz (/kalendarz).',
        'Przeglądaj terminy ślubów i sesji.',
      ],
    },
    navigation: {
      routePattern: '/kalendarz',
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
      ownerFeature: 'calendar',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'guideEducationContent.ts#organizacja',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'calendar.assignments',
    domain: 'calendar',
    title: 'Terminy zleceń i sesji',
    summary:
      'W Kalendarzu widzisz połączone terminy ślubów i sesji — to widok organizacyjny, nie osobny CRM zapisów.',
    help: {
      steps: [
        'Otwórz /kalendarz.',
        'Przejrzyj wydarzenia i otwórz powiązane zlecenie lub sesję.',
      ],
    },
    navigation: {
      routePattern: '/kalendarz',
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
      ownerFeature: 'calendar',
      verifiedAgainst: [
        'CalendarRoutePage',
        'guideEducationContent.ts#organizacja',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
