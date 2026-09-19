import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'
const off = {
  canExplain: true as const,
  canNavigate: true as const,
  canExecute: false as const,
  requiresConfirmation: false as const,
}

export const weddingsCapabilities: readonly Capability[] = [
  {
    id: 'weddings.list',
    domain: 'weddings',
    title: 'Lista zleceń',
    summary: 'Listę potwierdzonych zleceń otwierasz w Śluby.',
    help: {
      steps: ['Przejdź do Śluby (/sluby).', 'Przeglądaj i otwieraj karty zleceń.'],
    },
    navigation: { routePattern: '/sluby', deepLinkQuality: 'direct' },
    permissions: off,
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['layouts/Sidebar.tsx', 'routes/router.tsx#/sluby'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.create',
    domain: 'weddings',
    title: 'Dodaj zlecenie',
    summary:
      'Potwierdzone zlecenie dodajesz ręcznie, importem z arkusza albo zbierając dane ankietą do umowy — także gdy masz już nową parę i chcesz wprowadzić ją do CRM.',
    help: {
      steps: [
        'Otwórz listę Śluby.',
        'Wybierz Dodaj zlecenie (/sluby/nowy) albo Importuj zlecenia.',
        'Uzupełnij dane pary i zapisz.',
      ],
      notes: [
        'OurWed przechowuje potwierdzone zlecenia, nie zapytania.',
        'Import nie wysyła wiadomości do par.',
      ],
    },
    navigation: { routePattern: '/sluby/nowy', deepLinkQuality: 'direct' },
    permissions: off,
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'guideEducationContent.ts#zlecenia',
        'routes/router.tsx#/sluby/nowy',
        'firstRunRoutes.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.import',
    domain: 'weddings',
    title: 'Importuj zlecenia',
    summary:
      'Import przenosi podstawowe dane z Excel/CSV — datę, parę, kontakt, wartość i notatkę. Przed zapisem widzisz podgląd i ostrzeżenia.',
    help: {
      steps: [
        'Otwórz Śluby → Importuj (/sluby/import).',
        'Wgraj arkusz i sprawdź podgląd.',
        'Potwierdź import.',
      ],
      notes: ['Import nie wysyła wiadomości do par.'],
    },
    navigation: { routePattern: '/sluby/import', deepLinkQuality: 'direct' },
    permissions: off,
    knowledge: { mode: 'static' },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'guideEducationContent.ts#zlecenia',
        'routes/router.tsx#/sluby/import',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.open',
    domain: 'weddings',
    title: 'Otwórz zlecenie',
    summary:
      'Kartę zlecenia (szczegóły ślubu) otwierasz z listy Śluby; dalej pracujesz w zakładkach.',
    help: {
      steps: [
        'Przejdź do Śluby (/sluby).',
        'Wybierz zlecenie z listy.',
        'Użyj zakładek: Przegląd, Dzień ślubu, Umowa i finanse, Ankieta przedślubna, Historia.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'routes/router.tsx#/sluby/:id',
        'weddingWorkspaceSelectors.ts#WORKSPACE_TABS',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.edit_couple',
    domain: 'weddings',
    title: 'Edytuj dane pary',
    summary:
      'Dane pary (imiona, kontakty, adres) edytujesz na karcie zlecenia — z przeglądu lub menu edycji tożsamości.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Uruchom edycję danych pary / tożsamości.',
        'Zapisz zmiany.',
      ],
      notes: [
        'Etykieta przycisku może różnić się między wariantem Classic i Modern.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=overview',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['ModernWeddingDetailHeader.tsx', 'weddingDetailEditAcceptance.test.ts'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.contacts',
    domain: 'weddings',
    title: 'Kontakty zlecenia',
    summary:
      'Telefony i dane kontaktowe pary są częścią danych zlecenia; edytujesz je w danych pary na karcie.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Edytuj dane kontaktowe pary.',
        'Zapisz.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['contactService', 'ModernWeddingDetailHeader.tsx'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.archive',
    domain: 'weddings',
    title: 'Zarchiwizuj zlecenie',
    summary:
      'Zlecenie przenosisz do archiwum z menu akcji w nagłówku karty (Archiwizuj). Wymagane potwierdzenie.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Menu akcji w nagłówku → Archiwizuj.',
        'Potwierdź.',
      ],
      notes: ['Asystent nie wykonuje archiwizacji — tylko wyjaśnia.'],
    },
    navigation: {
      routePattern: '/sluby/:weddingId',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['ModernWeddingDetailHeader.tsx#wedding-menu-archive'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.delete',
    domain: 'weddings',
    title: 'Usuń zlecenie',
    summary:
      'Trwałe usunięcie / skasowanie zlecenia jest w menu akcji karty (Usuń) i wymaga potwierdzenia.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Menu akcji → Usuń.',
        'Potwierdź zgodnie z dialogiem.',
      ],
      notes: ['Operacja destrukcyjna — asystent jej nie wykonuje.'],
    },
    navigation: {
      routePattern: '/sluby/:weddingId',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['ModernWeddingDetailHeader.tsx#wedding-menu-delete'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.contract_recovery',
    domain: 'weddings',
    title: 'Uzupełnij zlecenie z umowy',
    summary:
      'Uzupełnianie zlecenia z umowy: wgrywasz istniejącą umowę PDF/DOCX; OurWed podpowiada dane, Ty akceptujesz.',
    help: {
      steps: [
        'Otwórz /sluby/:weddingId/uzupelnij-z-umowy lub funkcję na karcie.',
        'Wgraj dokument.',
        'Zaakceptuj wybrane propozycje.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId/uzupelnij-z-umowy',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'guideEducationContent.ts#umowy',
        'routes/router.tsx#uzupelnij-z-umowy',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.tab.overview',
    domain: 'weddings',
    title: 'Zakładka Przegląd',
    summary: 'Zakładka Przegląd pokazuje skrót statusu i kluczowe informacje zlecenia.',
    help: {
      steps: ['Otwórz zlecenie.', 'Wybierz Przegląd (?tab=overview).'],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=overview',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.tab.wedding_day',
    domain: 'weddings',
    title: 'Zakładka Dzień ślubu',
    summary:
      'Zakładka Dzień ślubu służy do harmonogramu, miejsc i ustaleń dnia realizacji.',
    help: {
      steps: ['Otwórz zlecenie.', 'Wybierz Dzień ślubu (?tab=wedding_day).'],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=wedding_day',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.tab.contract_finance',
    domain: 'weddings',
    title: 'Zakładka Umowa i finanse',
    summary:
      'Zakładka Umowa i finanse zbiera umowę, pakiet, wpłaty i ustalenia komercyjne.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Wybierz Umowa i finanse (?tab=contract_finance).',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=contract_finance',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'weddingWorkspaceSelectors.ts#WORKSPACE_TABS',
        'ModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.tab.pre_wedding_questionnaire',
    domain: 'weddings',
    title: 'Zakładka Ankieta przedślubna',
    summary:
      'Zakładka Ankieta przedślubna służy do wysyłki i statusu ankiety dnia ślubu.',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Wybierz Ankieta przedślubna (?tab=pre_wedding_questionnaire).',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=pre_wedding_questionnaire',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['weddingWorkspaceSelectors.ts#WORKSPACE_TABS'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.tab.activity',
    domain: 'weddings',
    title: 'Zakładka Historia',
    summary:
      'Zakładka Historia pokazuje aktywność zlecenia; w Modern możesz stąd edytować notatki.',
    help: {
      steps: ['Otwórz zlecenie.', 'Wybierz Historia (?tab=activity).'],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=activity',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'weddingWorkspaceSelectors.ts#WORKSPACE_TABS',
        'ModernWeddingHistoriaWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.notes',
    domain: 'weddings',
    title: 'Notatki zlecenia',
    summary:
      'Notatki do zlecenia dodajesz i edytujesz na karcie (sekcja notatek / Historia).',
    help: {
      steps: [
        'Otwórz zlecenie.',
        'Otwórz sekcję notatek lub Edytuj notatki.',
        'Dodaj treść i zapisz.',
      ],
      notes: [
        'Asystent nie odczytuje treści notatek użytkownikowi.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=activity',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'route_only',
    },
    permissions: off,
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId'] },
    provenance: {
      ownerFeature: 'weddings',
      verifiedAgainst: ['AddNoteModal.tsx', 'NotesSection.tsx'],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.quick_create',
    domain: 'weddings',
    title: 'Szybkie dodanie zlecenia',
    summary:
      'Szybkie dodanie zlecenia (/sluby/nowy?quick=1) pozwala szybko dodać potwierdzone zlecenie z uzupełnieniem później.',
    help: {
      steps: [
        'Otwórz /sluby/nowy?quick=1.',
        'Wprowadź dane podstawowe i zapisz.',
      ],
    },
    navigation: {
      routePattern: '/sluby/nowy?quick=1',
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
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'firstRunRoutes.ts#createExisting',
        'NewWeddingPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'weddings.package_on_card',
    domain: 'weddings',
    title: 'Pakiet na karcie zlecenia',
    summary:
      'Wybrany pakiet i jego wpływ na wartość umowy widać i zmieniasz w Umowa i finanse na karcie zlecenia.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Zmień pakiet w sekcji pakietu.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId?tab=contract_finance',
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
      ownerFeature: 'weddings',
      verifiedAgainst: [
        'ModernModernWeddingContractFinanceWorkspace.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
