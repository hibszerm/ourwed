import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const questionnairesCapabilities: readonly Capability[] = [
  {
    id: 'questionnaires.hub',
    domain: 'questionnaires',
    title: 'Ankiety — hub',
    summary:
      'Sekcja Ankiety (/ankiety) zbiera ankiety do umowy i powiązane szablony.',
    help: {
      steps: [
        'Otwórz Ankiety z nawigacji (/ankiety).',
        'Wybierz ankietę do umowy lub szablon.',
      ],
    },
    navigation: {
      routePattern: '/ankiety',
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
      ownerFeature: 'questionnaires',
      verifiedAgainst: [
        'layouts/Sidebar.tsx',
        'routes/router.tsx#/ankiety',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'questionnaires.contract.send',
    domain: 'questionnaires',
    title: 'Ankieta do umowy — link',
    summary:
      'Ankietą do umowy zbierasz dane od pary przed utworzeniem zlecenia. Tworzysz link w Ankietach; wypełniona odpowiedź trafia do Oczekujących.',
    help: {
      steps: [
        'Otwórz /ankiety/dane-do-umowy (generate=1 otwiera generowanie linku).',
        'Wygeneruj link i przekaż go parze poza OurWed.',
        'Po wypełnieniu odpowiedź trafi do Oczekujących.',
      ],
      notes: [
        'Pakiety w ankiecie są ustalane przy tworzeniu linku.',
        'Brak automatycznej wysyłki wiadomości do pary.',
      ],
    },
    navigation: {
      routePattern: '/ankiety/dane-do-umowy?generate=1',
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
      ownerFeature: 'questionnaires',
      verifiedAgainst: [
        'guideEducationContent.ts#zlecenia',
        'firstRunRoutes.ts#collectByQuestionnaire',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'questionnaires.contract.pending',
    domain: 'questionnaires',
    title: 'Oczekujące odpowiedzi',
    summary:
      'Wypełnione ankiety do umowy trafiają do Oczekujących. Po Twojej decyzji powstaje zlecenie — bez automatycznych wiadomości do pary.',
    help: {
      steps: [
        'Otwórz Oczekujące (/oczekujace).',
        'Przejrzyj odpowiedź.',
        'Zaakceptuj, aby utworzyć zlecenie, albo odrzuć.',
      ],
    },
    navigation: {
      routePattern: '/oczekujace',
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
      ownerFeature: 'questionnaires',
      verifiedAgainst: [
        'guideEducationContent.ts#zlecenia',
        'routes/router.tsx#/oczekujace',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'questionnaires.templates',
    domain: 'questionnaires',
    title: 'Szablony ankiet',
    summary:
      'Szablony ankiet zarządzasz w Ankietach (/ankiety/szablony) oraz w ustawieniach szablonów ankiet.',
    help: {
      steps: [
        'Otwórz /ankiety/szablony lub /ustawienia/szablony-ankiet.',
        'Edytuj lub utwórz szablon.',
      ],
    },
    navigation: {
      routePattern: '/ankiety/szablony',
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
      ownerFeature: 'questionnaires',
      verifiedAgainst: [
        'routes/router.tsx#/ankiety/szablony',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'questionnaires.contract.editor',
    domain: 'questionnaires',
    title: 'Edytor ankiety do umowy',
    summary:
      'Edytor ankiety dane-do-umowy jest pod /ankiety/dane-do-umowy — tam budujesz i generujesz link.',
    help: {
      steps: [
        'Otwórz /ankiety/dane-do-umowy.',
        'Skonfiguruj ankietę i wygeneruj link.',
      ],
    },
    navigation: {
      routePattern: '/ankiety/dane-do-umowy',
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
      ownerFeature: 'questionnaires',
      verifiedAgainst: [
        'routes/router.tsx#/ankiety/dane-do-umowy',
        'firstRunRoutes.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
