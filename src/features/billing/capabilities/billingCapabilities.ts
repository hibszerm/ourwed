import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const billingCapabilities: readonly Capability[] = [
  {
    id: 'settings.subscription',
    domain: 'settings',
    title: 'Subskrypcja',
    summary:
      'Plan PRO i dostęp do OurWed zarządzasz w Ustawieniach → Subskrypcja.',
    help: {
      steps: [
        'Otwórz /ustawienia/subskrypcja.',
        'Sprawdź plan i opcje subskrypcji.',
      ],
      notes: [
        'Asystent nie zmienia bilingu ani nie przetwarza kart.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/subskrypcja',
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
      ownerFeature: 'billing',
      verifiedAgainst: [
        'settingsNav.ts',
        'SubscriptionSettingsPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
