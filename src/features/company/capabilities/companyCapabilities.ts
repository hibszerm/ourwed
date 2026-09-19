import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const companyCapabilities: readonly Capability[] = [
  {
    id: 'settings.company',
    domain: 'settings',
    title: 'Profil studia',
    summary:
      'Dane firmy / profil studia (nazwa, e-mail kontaktowy) ustawiasz w Profilu studia.',
    help: {
      steps: [
        'Otwórz /ustawienia/firma.',
        'Uzupełnij dane studia i zapisz.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/firma',
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
      ownerFeature: 'company',
      verifiedAgainst: [
        'settingsNav.ts',
        'CompanyDetailsPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'settings.company_signature',
    domain: 'settings',
    title: 'Podpis studia',
    summary:
      'Podpis studia (rysowany lub wgrany) zarządzasz w Profilu studia — używany przy generowaniu dokumentów.',
    help: {
      steps: [
        'Otwórz /ustawienia/firma.',
        'W sekcji podpisu narysuj lub wgraj podpis.',
        'Zapisz.',
      ],
    },
    navigation: {
      routePattern: '/ustawienia/firma',
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
      ownerFeature: 'company',
      verifiedAgainst: [
        'CompanySignatureSection.tsx',
        'settingsNav.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
