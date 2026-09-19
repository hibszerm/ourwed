import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const sessionsCapabilities: readonly Capability[] = [
  {
    id: 'sessions.list',
    domain: 'sessions',
    title: 'Lista sesji',
    summary:
      'Listę sesji zdjęciowych otwierasz w Sesje.',
    help: {
      steps: [
        'Przejdź do Sesje (/sesje).',
        'Otwieraj szczegóły sesji z listy.',
      ],
    },
    navigation: {
      routePattern: '/sesje',
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
      ownerFeature: 'sessions',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'routes/router.tsx#/sesje',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'sessions.create',
    domain: 'sessions',
    title: 'Utwórz sesję',
    summary:
      'Nową sesję dodajesz z listy Sesje przez formularz /sesje/nowa.',
    help: {
      steps: [
        'Otwórz Sesje.',
        'Wybierz nową sesję (/sesje/nowa).',
        'Uzupełnij dane i zapisz.',
      ],
    },
    navigation: {
      routePattern: '/sesje/nowa',
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
      ownerFeature: 'sessions',
      verifiedAgainst: [
        'routes/router.tsx#/sesje/nowa',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'sessions.open',
    domain: 'sessions',
    title: 'Otwórz sesję',
    summary:
      'Kartę sesji otwierasz z listy Sesje (/sesje/:sessionId).',
    help: {
      steps: [
        'Otwórz Sesje.',
        'Wybierz sesję z listy.',
      ],
    },
    navigation: {
      routePattern: '/sesje/:sessionId',
      contextKeys: ['sessionId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['sessionId'] },
    provenance: {
      ownerFeature: 'sessions',
      verifiedAgainst: [
        'routes/router.tsx#/sesje/:sessionId',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'sessions.edit',
    domain: 'sessions',
    title: 'Edytuj sesję',
    summary:
      'Żeby zmienić datę sesji lub inne szczegóły: /sesje/:sessionId/edytuj albo edycja na karcie sesji.',
    help: {
      steps: [
        'Otwórz sesję.',
        'Przejdź do edycji.',
        'Zapisz.',
      ],
    },
    navigation: {
      routePattern: '/sesje/:sessionId/edytuj',
      contextKeys: ['sessionId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['sessionId'] },
    provenance: {
      ownerFeature: 'sessions',
      verifiedAgainst: [
        'routes/router.tsx#/sesje/:sessionId/edytuj',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'sessions.link_wedding',
    domain: 'sessions',
    title: 'Powiąż sesję ze zleceniem',
    summary:
      'Sesję możesz powiązać ze zleceniem przy tworzeniu lub edycji sesji — powiązanie widać też z karty wesela.',
    help: {
      steps: [
        'Otwórz sesję lub formularz nowej sesji.',
        'Wybierz powiązane zlecenie i zapisz.',
      ],
    },
    navigation: {
      routePattern: '/sesje/:sessionId/edytuj',
      contextKeys: ['sessionId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['sessionId'] },
    provenance: {
      ownerFeature: 'sessions',
      verifiedAgainst: [
        'routes/router.tsx',
        'list_related SESSIONS',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
