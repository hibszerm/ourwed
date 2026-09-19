import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const dashboardCapabilities: readonly Capability[] = [
  {
    id: 'dashboard.open',
    domain: 'dashboard',
    title: 'Pulpit',
    summary:
      'Pulpit pokazuje najbliższe zlecenia, terminy i rzeczy wymagające uwagi na dziś.',
    help: {
      steps: [
        'Otwórz Pulpit (/dashboard).',
        'Przejrzyj najbliższe zobowiązania i alerty.',
      ],
    },
    navigation: {
      routePattern: '/dashboard',
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
      ownerFeature: 'dashboard',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'guideEducationContent.ts#organizacja',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'dashboard.attention',
    domain: 'dashboard',
    title: 'Rzeczy wymagające uwagi',
    summary:
      'Pulpit wyróżnia rzeczy wymagające uwagi (m.in. oczekujące, terminy) bez osobnego systemu KPI.',
    help: {
      steps: [
        'Otwórz Pulpit.',
        'Przejrzyj sekcje wymagające uwagi i przejdź do powiązanego zlecenia.',
      ],
    },
    navigation: {
      routePattern: '/dashboard',
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
      ownerFeature: 'dashboard',
      verifiedAgainst: [
        'guideEducationContent.ts#organizacja',
        'DashboardRoutePage',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
