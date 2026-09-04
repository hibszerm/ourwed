/**
 * Landing V2 Security + History — verified public copy only.
 * Claims must map to codebase evidence (auth, RLS, storage). Rejected phrases stay banned.
 */

/** Verified micro-points (max 3 on landing). */
export const LV2_SECURITY_MICRO_POINTS = [
  {
    id: 'auth',
    text: 'Dostęp tylko po zalogowaniu',
    evidence: 'ProtectedRoute + Supabase Auth session',
  },
  {
    id: 'isolation',
    text: 'Dane oddzielone między konta',
    evidence: 'RLS + is_wedding_owner + enforce_wedding_owner',
  },
  {
    id: 'documents',
    text: 'Dokumenty przypisane do Twojego studia',
    evidence: 'document-files private bucket; path = auth.uid()',
  },
] as const

export const LV2_SECURITY_COPY = {
  eyebrow: 'Bezpieczeństwo',
  /**
   * Two visual lines on desktop (white-space: pre-line).
   * Concrete: studio data stays in the authenticated account.
   */
  headline: 'Dane Twojego studia\nzostają w Twoim koncie.',
  /**
   * Names concrete data classes + login gate + account isolation.
   * Does NOT claim field encryption, backups, certifications, or bank-level security.
   */
  support:
    'Umowy, dane klientów, płatności i informacje o zleceniach są dostępne po zalogowaniu i oddzielone od danych innych kont.',
} as const

export const LV2_HISTORY_COPY = {
  studioLabel: 'Twoje studio',
  headlineLine1: 'Cała historia Twojego studia.',
  headlineLine2: 'Sezon po sezonie.',
  /** Retention of wedding records in CRM — not a backup/SLA claim. */
  support:
    'Zlecenia, dokumenty i informacje o klientach pozostają uporządkowane, kiedy zaczynasz kolejny sezon.',
} as const

/** Phrases that must never appear in this chapter's public-facing strings. */
export const LV2_SECURITY_BANNED = [
  'end-to-end',
  'bank-grade',
  'military-grade',
  'SOC 2',
  'SOC2',
  'ISO 27001',
  'GDPR certified',
  'zero knowledge',
  'military',
  'bank-level',
] as const

/** Public strings scanned by acceptance (headline + support + micro + history). */
export const LV2_SECURITY_PUBLIC_TEXT = [
  LV2_SECURITY_COPY.eyebrow,
  LV2_SECURITY_COPY.headline,
  LV2_SECURITY_COPY.support,
  ...LV2_SECURITY_MICRO_POINTS.map((p) => p.text),
  LV2_HISTORY_COPY.studioLabel,
  LV2_HISTORY_COPY.headlineLine1,
  LV2_HISTORY_COPY.headlineLine2,
  LV2_HISTORY_COPY.support,
] as const

export type SeasonYear = 2026 | 2027 | 2028

export type SeasonRecord = {
  couple: string
  date?: string
}

export type SeasonRecordsSix = readonly [
  SeasonRecord,
  SeasonRecord,
  SeasonRecord,
  SeasonRecord,
  SeasonRecord,
  SeasonRecord,
]

export const LV2_HISTORY_SEASONS: ReadonlyArray<{
  year: SeasonYear
  footer: string
  records: SeasonRecordsSix
}> = [
  {
    year: 2026,
    footer: 'i 8 innych zleceń',
    records: [
      { couple: 'Julia i Maksymilian' },
      { couple: 'Karolina i Jan' },
      { couple: 'Zuzanna i Kamil' },
      { couple: 'Alicja i Tomasz' },
      { couple: 'Magdalena i Piotr' },
      { couple: 'Weronika i Michał' },
    ],
  },
  {
    year: 2027,
    footer: 'i 9 innych zleceń',
    records: [
      { couple: 'Natalia i Filip' },
      { couple: 'Anna i Michał' },
      { couple: 'Oliwia i Jan' },
      { couple: 'Paulina i Szymon' },
      { couple: 'Ewa i Bartek' },
      { couple: 'Klaudia i Jakub' },
    ],
  },
  {
    year: 2028,
    footer: 'i 11 innych zleceń',
    records: [
      { couple: 'Marta i Kamil' },
      { couple: 'Julia i Adam' },
      { couple: 'Lena i Filip' },
      { couple: 'Dominika i Adrian' },
      { couple: 'Patrycja i Wojciech' },
      { couple: 'Izabela i Maciej' },
    ],
  },
]
