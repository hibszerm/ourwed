/**
 * Canonical legal metadata for OurWed public legal surfaces.
 * Single source for version / effective date / operator — do not duplicate literals.
 *
 * ---------------------------------------------------------------------------
 * INTERNAL LAUNCH TODOs (not user-visible)
 * ---------------------------------------------------------------------------
 *
 * LEGAL: update Terms, Privacy Policy, processor/subprocessor disclosures and
 * billing terms when the production payment provider is selected.
 *
 * P0 PAYMENT LEGAL REVIEW — complete together with production checkout:
 * - classification of the OurWed digital service
 * - consumer pre-contract information
 * - 14-day withdrawal mechanics
 * - request to begin performance before withdrawal period where applicable
 * - consequences of withdrawal after performance begins
 * - automatic renewal disclosure
 * - cancellation
 * - price / billing period
 * - durable-medium confirmation
 * - digital-service conformity obligations
 * - updates
 * - consumer remedies for lack of conformity
 * - refund mechanics
 * - consumer vs entrepreneur-with-consumer-rights treatment
 *
 * LEGAL: before paid checkout launches, review the checkout flow for:
 * - consumer pre-contract information
 * - recurring subscription disclosure
 * - price/billing interval
 * - automatic renewal disclosure
 * - cancellation
 * - statutory withdrawal mechanics
 * - request/consent for beginning digital service before expiry of withdrawal
 *   period where legally applicable
 * - durable-medium confirmation
 *
 * P0 ACCOUNT DELETION — irreversible account deletion before public registration
 * launches (product UI + auth user + CRM/storage cleanup).
 * Phase 2A backend: Edge Function delete-account + erase_account_data RPC (QA passed).
 * Phase 2B.1: Settings danger-zone UI (local) — password + "USUŃ KONTO" confirmation.
 *
 * P0 PAYMENT ACCOUNT-DELETION INTEGRATION — when production PSP is selected,
 * extend erasure to cancel remote subscriptions, retain legally required
 * invoice/tax records, and coordinate webhook races before Auth delete.
 *
 * P0 LEGAL ACCEPTANCE PERSISTENCE — record accepted_terms_version /
 * accepted_terms_at (and privacy acknowledgement if required) at signup.
 *
 * LEGAL/OWNER FOLLOW-UP BEFORE LAUNCH — operational procedure for Administrator
 * objection to intended subprocessor addition/replacement (timing, channel,
 * contractual consequence of unresolved objection). Not invented in user copy.
 *
 * P0 LEGAL — verify for each production provider (Supabase, Vercel, Resend,
 * Google, OpenAI, Cloudmersive, PDFShift) and later the payment provider:
 * - legal entity
 * - processing role
 * - DPA / processor terms
 * - hosting/processing regions where relevant
 * - EEA/non-EEA transfers
 * - transfer mechanism where required
 * - privacy/subprocessor disclosure accuracy
 */

export const LEGAL_VERSION = '1.1'

/** ISO date shown on legal pages (YYYY-MM-DD). */
export const LEGAL_EFFECTIVE_DATE = '2026-09-07'

/** Polish display form of the effective date. */
export const LEGAL_EFFECTIVE_DATE_PL = '7 września 2026 r.'

export const LEGAL_ROUTES = {
  terms: '/regulamin',
  privacy: '/polityka-prywatnosci',
  dpa: '/powierzenie-danych',
} as const

export const LEGAL_OPERATOR = {
  name: 'Video Productions Marcin Hibszer',
  nip: '6482810484',
  regon: '522500508',
  street: 'ul. Juliusza Słowackiego 6/17',
  postalCity: '41-800 Zabrze',
  country: 'Polska',
  email: 'kontakt.ourwed@gmail.com',
  productName: 'OurWed',
  productDescription:
    'internetowa platforma SaaS (CRM) dla profesjonalistów i twórców branży ślubnej',
  jurisdiction: 'prawo polskie',
  minAge: 18,
} as const

export type LegalProcessor = {
  id: string
  name: string
  purpose: string
  dataCategories: string
  whenUsed: string
}

/**
 * Maintainable provider list for Privacy Policy / DPA.
 * Do not invent regions, certifications, or DPA URLs here.
 */
export const LEGAL_PROCESSORS: readonly LegalProcessor[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    purpose: 'Hostowanie bazy danych, uwierzytelniania, storage i funkcji serwerowych',
    dataCategories:
      'Dane konta, dane CRM, pliki, tokeny sesji oraz dane techniczne związane z działaniem usługi',
    whenUsed: 'Zawsze przy korzystaniu z OurWed',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    purpose: 'Hosting aplikacji webowej OurWed',
    dataCategories:
      'Dane techniczne żądań HTTP, logi infrastrukturalne oraz treści niezbędne do dostarczenia aplikacji',
    whenUsed: 'Zawsze przy korzystaniu z aplikacji webowej',
  },
  {
    id: 'resend',
    name: 'Resend',
    purpose: 'Wysyłka transakcyjnych powiadomień e-mail do użytkownika studia',
    dataCategories:
      'Adres e-mail odbiorcy oraz ograniczona treść powiadomienia o zdarzeniach w usłudze',
    whenUsed: 'Gdy OurWed wysyła powiadomienia produktowe (np. o wypełnieniu ankiety)',
  },
  {
    id: 'google',
    name: 'Google (Maps / Places / Routes / Calendar)',
    purpose:
      'Autouzupełnianie adresów, geokodowanie, wyliczanie tras oraz opcjonalna synchronizacja kalendarza',
    dataCategories:
      'Adresy, identyfikatory miejsc, współrzędne, zapytania lokalizacyjne oraz — przy integracji — dane konta Google i metadane wydarzeń',
    whenUsed:
      'Przy funkcjach lokalizacji/podróży oraz gdy użytkownik świadomie podłączy Google Calendar',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    purpose: 'Asystowanie przy analizie i generowaniu dokumentów/umów na żądanie użytkownika',
    dataCategories:
      'Treść dokumentów, fragmenty umów oraz powiązane dane zlecenia niezbędne do wykonania wybranej operacji AI',
    whenUsed: 'Wyłącznie gdy użytkownik uruchomi funkcję AI',
  },
  {
    id: 'cloudmersive',
    name: 'Cloudmersive',
    purpose: 'Konwersja wygenerowanych dokumentów DOCX do PDF',
    dataCategories: 'Treść finalnego dokumentu DOCX (może zawierać dane klientów)',
    whenUsed: 'Gdy użytkownik generuje/eksportuje PDF umowy w trybie produkcyjnym',
  },
  {
    id: 'pdfshift',
    name: 'PDFShift',
    purpose: 'Generowanie PDF Briefu / dokumentów HTML',
    dataCategories: 'Treść Briefu lub innego dokumentu HTML przekazanego do konwersji',
    whenUsed: 'Gdy użytkownik generuje Brief lub inny PDF przez tę ścieżkę',
  },
] as const

export function legalPageTitle(documentTitle: string): string {
  return `${documentTitle} — OurWed`
}
