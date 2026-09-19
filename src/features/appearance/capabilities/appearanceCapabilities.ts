import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const appearanceCapabilities: readonly Capability[] = [
  {
    id: 'settings.appearance',
    domain: 'settings',
    title: 'Wygląd panelu',
    summary:
      'Tryb jasny/ciemny i motyw kolorystyczny ustawiasz w Wyglądzie panelu.',
    help: {
      steps: [
        'Otwórz /ustawienia/wyglad.',
        'Wybierz tryb jasny lub ciemny oraz motyw kolorystyczny.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/wyglad',
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
      ownerFeature: 'appearance',
      verifiedAgainst: [
        'settingsNav.ts',
        'AppearanceSettingsPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
