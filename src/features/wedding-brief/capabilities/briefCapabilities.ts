import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const briefCapabilities: readonly Capability[] = [
  {
    id: 'day.brief_download',
    domain: 'day',
    title: 'Pobierz Wedding Brief',
    summary:
      'Wedding Brief PDF pobierasz z karty zlecenia przyciskiem pobierania Briefu, gdy dane źródłowe są dostępne.',
    help: {
      steps: [
        'Uzupełnij dane dnia i miejsca.',
        'Na karcie zlecenia użyj pobierania Wedding Brief.',
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
      ownerFeature: 'wedding-brief',
      verifiedAgainst: [
        'WeddingBriefDownloadButton.tsx',
        'useWeddingBriefAction.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
