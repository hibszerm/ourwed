import type { Capability } from '@/features/assistant/v7/knowledge/types'

const VERIFIED = '2026-09-19'

export const contractsCapabilities: readonly Capability[] = [
  {
    id: 'contracts.generate',
    domain: 'contracts',
    title: 'Wygeneruj umowę',
    summary:
      'Generowanie umowy DOCX: gdy pakiet ma wzór i dane (w tym dojazd) są kompletne. Pytania „czy mogę już / co jeszcze brakuje przed wygenerowaniem” dotyczą tej gotowości.',
    help: {
      steps: [
        'Sprawdź kompletność danych (para, przyjęcie, pakiet, dojazd, płatności) i wzór DOCX pakietu.',
        'Otwórz zlecenie → Umowa i finanse i uruchom generowanie.',
        'Oznacz umowę jako wysłaną, potem podpisaną — według faktów poza systemem.',
      ],
      prerequisites: [
        'Pakiet ze wzorem DOCX',
        'Komplet danych walidacji generowania (m.in. dojazd rozliczony)',
      ],
      notes: [
        'OurWed nie wysyła umów e-mailem i nie prowadzi podpisu elektronicznego.',
        'Gotowość konkretnego zlecenia wynika z kanonicznej walidacji generowania (mayGenerateContract).',
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
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'CONTRACT.READINESS'] },
    provenance: {
      ownerFeature: 'documents',
      verifiedAgainst: [
        'guideEducationContent.ts#umowy',
        'validateContractGeneration.ts',
        'contractGenerationIntegrity.ts#mayGenerateContract',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'contracts.status',
    domain: 'contracts',
    title: 'Status umowy',
    summary:
      'Status umowy (brak / wygenerowana / wysłana / podpisana) widzisz na karcie zlecenia w Umowa i finanse.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Sprawdź status dokumentu umowy.',
      ],
      notes: [
        'Wysłanie i podpis oznaczasz ręcznie — bez e-maila i e-podpisu w OurWed.',
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
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'CONTRACT.SIGNED'] },
    provenance: {
      ownerFeature: 'documents',
      verifiedAgainst: [
        'ModernWeddingContractFinanceWorkspace.tsx',
        'CONTRACT.SIGNED concept',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'contracts.mark_sent',
    domain: 'contracts',
    title: 'Oznacz umowę jako wysłaną',
    summary:
      'Oznaczanie umowy jako wysłanej: po fizycznym wysłaniu oznaczasz status na karcie zlecenia. OurWed nie wysyła e-mailem.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Oznacz umowę jako wysłaną.',
      ],
      notes: [
        'Brak automatycznej wysyłki e-mail.',
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
      ownerFeature: 'documents',
      verifiedAgainst: [
        'guideEducationContent.ts#umowy',
        'workflowEngine.ts',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'contracts.mark_signed',
    domain: 'contracts',
    title: 'Oznacz umowę jako podpisaną',
    summary:
      'Po podpisaniu poza systemem oznaczasz umowę jako podpisaną na karcie zlecenia.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Oznacz umowę jako podpisaną.',
      ],
      notes: [
        'Brak podpisu elektronicznego w OurWed.',
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
      ownerFeature: 'documents',
      verifiedAgainst: [
        'guideEducationContent.ts#umowy',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'contracts.templates',
    domain: 'contracts',
    title: 'Szablony umów DOCX',
    summary:
      'Wzory umów DOCX przypisujesz do pakietów w Studio → Pakiety; konfiguracja szablonu jest powiązana z pakietem.',
    help: {
      steps: [
        'Otwórz Studio → Pakiety (/studio/pakiety).',
        'Edytuj pakiet i przypisz lub skonfiguruj wzór DOCX.',
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
        'guideEducationContent.ts#umowy',
        'routes/router.tsx#/studio/pakiety',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'contracts.generation_page',
    domain: 'contracts',
    title: 'Strona generowania umowy',
    summary:
      'Szczegółowy przepływ generowania dokumentu otwiera się z zlecenia (ścieżka /sluby/:id/umowy/nowa) po spełnieniu gotowości.',
    help: {
      steps: [
        'Dopnij gotowość zlecenia.',
        'Uruchom generowanie z Umowa i finanse.',
        'Przejrzyj wynik na stronie generowania.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId/umowy/nowa',
      contextKeys: ['weddingId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'CONTRACT.READINESS'] },
    provenance: {
      ownerFeature: 'documents',
      verifiedAgainst: [
        'routes/router.tsx#umowy/nowa',
        'WeddingContractGenerationPage.tsx',
      ],
      lastVerified: VERIFIED,
    },
  },
  {
    id: 'contracts.open_existing',
    domain: 'contracts',
    title: 'Otwórz plik umowy',
    summary:
      'Plik umowy (wygenerowany DOCX/PDF) otwierasz z karty zlecenia → Umowa i finanse albo /sluby/:id/umowy/:contractId.',
    help: {
      steps: [
        'Otwórz zlecenie → Umowa i finanse.',
        'Otwórz istniejący dokument umowy.',
      ],
    },
    navigation: {
      routePattern: '/sluby/:weddingId/umowy/:contractId',
      contextKeys: ['weddingId', 'contractId'],
      deepLinkQuality: 'context_required',
    },
    permissions: {
      canExplain: true,
      canNavigate: true,
      canExecute: false,
      requiresConfirmation: false,
    },
    knowledge: { mode: 'contextual', contextRequirements: ['weddingId', 'contractId'] },
    provenance: {
      ownerFeature: 'documents',
      verifiedAgainst: [
        'routes/router.tsx#umowy/:contractId',
      ],
      lastVerified: VERIFIED,
    },
  },
] as const
