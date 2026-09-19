import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const accountCapabilities: readonly Capability[] = [
  {
    id: 'settings.account',
    domain: 'settings',
    title: 'Profil konta',
    summary:
      'Imię, nazwisko i e-mail konta ustawiasz w Ustawieniach → Profil.',
    help: {
      steps: [
        'Otwórz /ustawienia/konto.',
        'Zaktualizuj dane i zapisz.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/konto',
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
      ownerFeature: 'account',
      verifiedAgainst: [
        'settingsNav.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'settings.account_security',
    domain: 'settings',
    title: 'Konto i dostęp',
    summary:
      'Dane konta (profil) zarządzasz w /ustawienia/konto; logowanie i reset hasła odbywają się poza panelem CRM (/login, /forgot-password).',
    help: {
      steps: [
        'Otwórz /ustawienia/konto dla profilu.',
        'Do logowania użyj publicznych ekranów auth.',
      ],
      notes: [
        'Asystent nie resetuje haseł ani nie zmienia auth.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/konto',
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
      ownerFeature: 'account',
      verifiedAgainst: [
        'settingsNav.ts',
        'routes/router.tsx#/login',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
