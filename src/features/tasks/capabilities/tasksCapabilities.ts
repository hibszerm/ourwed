import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const tasksCapabilities: readonly Capability[] = [
  {
    id: 'tasks.list',
    domain: 'tasks',
    title: 'Lista zadań',
    summary:
      'Zadania studia i powiązane ze zleceniami widzisz w Zadaniach.',
    help: {
      steps: [
        'Otwórz Zadania (/zadania).',
        'Przeglądaj i filtruj listę.',
      ],
    },
    navigation: {
      routePattern: '/zadania',
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
      ownerFeature: 'tasks',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'guideEducationContent.ts#organizacja',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'tasks.create',
    domain: 'tasks',
    title: 'Dodaj zadanie',
    summary:
      'Dodajesz zadanie (todo) w Zadaniach — przy zleceniu albo dla całej firmy.',
    help: {
      steps: [
        'Otwórz /zadania.',
        'Dodaj zadanie i ewentualnie powiąż ze zleceniem.',
        'Zapisz.',
      ],
    },
    navigation: {
      routePattern: '/zadania',
      deepLinkQuality: 'route_only',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'tasks',
      verifiedAgainst: [
        'guideEducationContent.ts#organizacja',
        'routes/router.tsx#/zadania',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'tasks.complete',
    domain: 'tasks',
    title: 'Oznacz zadanie jako wykonane',
    summary:
      'Status wykonania zadania zmieniasz na liście zadań lub w kontekście zlecenia.',
    help: {
      steps: [
        'Otwórz Zadania lub zadania na karcie.',
        'Oznacz zadanie jako wykonane.',
      ],
    },
    navigation: {
      routePattern: '/zadania',
      deepLinkQuality: 'route_only',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'tasks',
      verifiedAgainst: [
        'TasksPage',
        'taskService',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'tasks.wedding_scoped',
    domain: 'tasks',
    title: 'Zadania przy zleceniu',
    summary:
      'Zadania możesz tworzyć i przeglądać w kontekście konkretnego zlecenia oraz na globalnej liście Zadań.',
    help: {
      steps: [
        'Otwórz zlecenie lub /zadania.',
        'Dodaj zadanie powiązane ze zleceniem.',
      ],
    },
    navigation: {
      routePattern: '/zadania',
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
      ownerFeature: 'tasks',
      verifiedAgainst: [
        'guideEducationContent.ts#organizacja',
        'taskService',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
