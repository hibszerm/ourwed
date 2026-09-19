import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const guideCapabilities: readonly Capability[] = [
  {
    id: 'guide.open',
    domain: 'guide',
    title: 'Otwórz Przewodnik',
    summary:
      'Przewodnik (/przewodnik) to wbudowana warstwa edukacyjna i dokumentacja produktowa OurWed.',
    help: {
      steps: [
        'Otwórz /przewodnik.',
        'Wybierz kategorię (Zlecenia, Umowy, Dzień ślubu, Finanse, Organizacja).',
      ],
    },
    navigation: {
      routePattern: '/przewodnik',
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
      ownerFeature: 'onboarding/guide',
      verifiedAgainst: [
        'guideEducationContent.ts',
        'routes/router.tsx#/przewodnik',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'settings.open',
    domain: 'settings',
    title: 'Otwórz Ustawienia',
    summary:
      'Ustawienia studia, konta, integracji i planu otwierasz z /ustawienia (domyślnie Profil studia na desktopie).',
    help: {
      steps: [
        'Otwórz /ustawienia.',
        'Wybierz kategorię: Studio, Konto, Integracje lub Plan.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia',
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
      ownerFeature: 'onboarding/guide',
      verifiedAgainst: [
        'settingsNav.ts',
        'SettingsPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'guide.categories',
    domain: 'guide',
    title: 'Kategorie Przewodnika',
    summary:
      'Przewodnik ma kategorie edukacyjne: Zlecenia, Umowy, Dzień ślubu, Finanse, Organizacja — zweryfikowane względem produkcji.',
    help: {
      steps: [
        'Otwórz /przewodnik.',
        'Wybierz kategorię tematyczną.',
      ],
    },
    navigation: {
      routePattern: '/przewodnik',
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
      ownerFeature: 'onboarding/guide',
      verifiedAgainst: [
        'guideEducationContent.ts#GUIDE_LEARN_CATEGORIES',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
