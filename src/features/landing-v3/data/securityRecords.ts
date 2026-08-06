/** Fictional security records — six couples, never real user data. */
export const SECURITY_RECORDS = [
  {
    id: 'r1',
    couple: 'Julia i Adrian',
    kind: 'Umowa',
    detail: 'Umowa_2027.pdf',
  },
  {
    id: 'r2',
    couple: 'Marta i Jakub',
    kind: 'Płatność',
    detail: '1 200 zł',
  },
  {
    id: 'r3',
    couple: 'Natalia i Tomasz',
    kind: 'Ankieta',
    detail: '24 odpowiedzi',
  },
  {
    id: 'r4',
    couple: 'Zuzanna i Patryk',
    kind: 'Kalendarz',
    detail: 'Google Calendar',
  },
  {
    id: 'r5',
    couple: 'Anna i Piotr',
    kind: 'Kontakt',
    detail: 'a••••@example.pl',
  },
  {
    id: 'r6',
    couple: 'Maria i Paweł',
    kind: 'Lokalizacje',
    detail: '4 lokalizacje',
  },
] as const

/**
 * Centered 2×3 grid (stage %). Compact — not edge-to-edge.
 * Stage is ~920px; cards ~280px → columns near 8 / 36 / 64.
 */
export const SECURITY_RECORD_START = [
  { x: 8, y: 18 },
  { x: 36, y: 16 },
  { x: 64, y: 18 },
  { x: 8, y: 48 },
  { x: 36, y: 50 },
  { x: 64, y: 48 },
] as const

/** Compact data package — slightly offset so edges peek behind lock. */
export const SECURITY_RECORD_PACKAGE = [
  { x: 28, y: 32 },
  { x: 40, y: 36 },
  { x: 30, y: 40 },
  { x: 42, y: 44 },
  { x: 29, y: 48 },
  { x: 41, y: 52 },
] as const

/** Classic padlock one-shot duration — must be ≥ 3.6s. */
export const SECURITY_ANIMATION_DURATION_S = 3.75

/** Shackle width / body width — keep between 0.48 and 0.54. */
export const SECURITY_SHACKLE_RATIO = 0.52
