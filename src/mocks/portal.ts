/**
 * @deprecated Couple Portal mocks — prefer `mocks/forms.ts` + `mocks/formTemplates.ts`.
 */
import type { Portal, PortalSection, PortalSettings } from '@/types/portal'

export const mockPortalSettings: PortalSettings = {
  welcomeTitle: 'Cześć! 👋',
  welcomeDescription:
    'Bardzo się cieszymy, że będziemy mogli być z Wami w tym wyjątkowym dniu.',
  welcomeParagraph:
    'Poniżej znajdziecie wszystkie informacje związane ze współpracą z nami. W odpowiednim momencie poprosimy Was również o uzupełnienie kilku informacji.',
  contractInstructions:
    'Prosimy o uzupełnienie danych potrzebnych do przygotowania umowy. Pola oznaczone gwiazdką są wymagane.',
  footerMessage: 'W razie pytań napiszcie do nas — chętnie pomożemy.',
  studioName: 'OurWed Studio',
}

export const PORTAL_SECTIONS: PortalSection[] = [
  { id: 'start', label: 'Start', path: '', available: true },
  { id: 'contract_data', label: 'Dane do umowy', path: 'dane', available: true },
  {
    id: 'wedding_questionnaire',
    label: 'Ankieta ślubna',
    path: 'ankieta',
    available: false,
  },
  { id: 'contract', label: 'Umowa', path: 'umowa', available: false },
  { id: 'status', label: 'Status współpracy', path: 'status', available: true },
  { id: 'contact', label: 'Kontakt', path: 'kontakt', available: false },
]

/** Token → portal. Ready for future ourwed.pl/p/{token}. */
export const mockPortals: Portal[] = [
  {
    id: 'portal-demo',
    token: 'demo',
    weddingId: 'w3',
    createdAt: '2026-06-20',
  },
  {
    id: 'portal-anna',
    token: 'anna-michal',
    weddingId: 'w1',
    createdAt: '2026-03-10',
  },
]
