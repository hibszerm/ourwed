import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const documentsCapabilities: readonly Capability[] = [
  {
    id: 'documents.hub',
    domain: 'documents',
    title: 'Dokumenty / szablony',
    summary:
      'Szablony dokumentów i konfiguracja pól są powiązane z pakietami; wejście produktowe to Studio → Pakiety (ścieżki /ustawienia/dokumenty przekierowują do pakietów).',
    help: {
      steps: [
        'Otwórz /studio/pakiety.',
        'Edytuj pakiet i konfigurację wzoru DOCX.',
      ],
      notes: [
        'URL-e /ustawienia/dokumenty/* przekierowują do pakietów.',
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
      ownerFeature: 'documents',
      verifiedAgainst: [
        'routes/router.tsx#ustawienia/dokumenty',
        'PackagesPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'documents.package_template_config',
    domain: 'documents',
    title: 'Konfiguracja wzoru pakietu',
    summary:
      'Konfigurację pól i mapowania wzoru DOCX prowadzisz z poziomu pakietu w Studio → Pakiety.',
    help: {
      steps: [
        'Otwórz /studio/pakiety.',
        'Wejdź w pakiet i konfigurację wzoru/pól.',
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
      ownerFeature: 'documents',
      verifiedAgainst: [
        'PackagesPage.tsx',
        'routes/router.tsx package templates',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
