/** Approved security claims — verified against codebase (auth, RLS, tokens, secrets). */
export const SECURITY_CLAIMS = [
  {
    id: 'auth',
    text: 'Dostęp wymaga zalogowania.',
  },
  {
    id: 'rls',
    text: 'Dane są rozdzielone między konta i przestrzenie.',
  },
  {
    id: 'public-forms',
    text: 'Publiczne formularze korzystają z unikalnych linków.',
  },
  {
    id: 'calendar-secrets',
    text: 'Poufne dane integracji nie są ujawniane w interfejsie.',
  },
] as const

/** Claims explicitly rejected for marketing (unsupported). */
export const SECURITY_REJECTED = [
  'military-grade',
  'bank-level',
  'end-to-end',
  'zero knowledge',
  'GDPR certified',
  'audited',
  'SOC2',
  'HSTS',
  'military',
  'bank-level security',
] as const
