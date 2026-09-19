import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const preweddingCapabilities: readonly Capability[] = [
  {
    id: 'q.prewedding.send',
    domain: 'prewedding',
    title: 'Wyślij ankietę przedślubną',
    summary:
      'Ankietę przedślubną wysyłasz z karty zlecenia (zakładka Ankieta przedślubna). Para uzupełnia harmonogram i miejsca — odpowiedzi trafiają do zlecenia.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Przejdź do Ankieta przedślubna.',
        'Wygeneruj lub skopiuj link i przekaż parze.',
      ],
      prerequisites: [
        'Szablon ankiety przedślubnej w ustawieniach / bibliotece',
      ],
      notes: [
        'Powiadomienie pojawia się po uzupełnieniu przez parę.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=pre_wedding_questionnaire',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'q.prewedding_status'] },
    provenance: {
      ownerFeature: 'prewedding',
      verifiedAgainst: [
        'guideEducationContent.ts#dzien-slubu',
        'weddingWorkspaceSelectors.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'q.prewedding.templates',
    domain: 'prewedding',
    title: 'Szablony ankiety przedślubnej',
    summary:
      'Szablony ankiet przedślubnych konfigurujesz w Ustawieniach (/ustawienia/ankiety-przedslubne) oraz w bibliotece /ankiety/przedslubne/:id.',
    help: {
      steps: [
        'Otwórz /ustawienia/ankiety-przedslubne lub listę ankiet przedślubnych.',
        'Edytuj pytania i zapisz szablon.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/ankiety-przedslubne',
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
      ownerFeature: 'prewedding',
      verifiedAgainst: [
        'routes/router.tsx#/ustawienia/ankiety-przedslubne',
        'PreWeddingTemplatesPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'q.prewedding.status',
    domain: 'prewedding',
    title: 'Status ankiety przedślubnej',
    summary:
      'Status ankiety przedślubnej (niewysłana / wysłana / uzupełniona) widzisz na karcie zlecenia w zakładce Ankieta przedślubna.',
    help: {
      steps: [
        'Otwórz zlecenie → Ankieta przedślubna.',
        'Sprawdź status odpowiedzi.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=pre_wedding_questionnaire',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'q.prewedding_status'] },
    provenance: {
      ownerFeature: 'prewedding',
      verifiedAgainst: [
        'weddingWorkspaceSelectors.ts',
        'q.prewedding_status concept',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'q.prewedding.library',
    domain: 'prewedding',
    title: 'Biblioteka ankiet przedślubnych',
    summary:
      'Szablony ankiet przedślubnych edytujesz także pod /ankiety/przedslubne/:templateId.',
    help: {
      steps: [
        'Otwórz listę/szablon ankiety przedślubnej.',
        'Edytuj pytania i zapisz.',
      ],
    },
    navigation: {
      routePattern: '/ankiety/przedslubne/:templateId',
      contextKeys: ['templateId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['templateId'] },
    provenance: {
      ownerFeature: 'prewedding',
      verifiedAgainst: [
        'routes/router.tsx#/ankiety/przedslubne',
        'PreWeddingTemplatesPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
