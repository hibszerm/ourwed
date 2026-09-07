/**
 * Profession options for studio accounts.
 * Values are stable English keys stored in profiles.profession.
 *
 * REGISTRATION_PROFESSIONS = choices shown on /register (product scope).
 * LEGACY_PROFESSION_VALUES = previously selectable values that may still exist
 * on stored profiles — keep for display/compatibility; do not remove.
 */

/** New registration UI — OurWed creator roles only. */
export const REGISTRATION_PROFESSIONS = [
  { value: 'wedding_photographer', label: 'Fotograf ślubny' },
  { value: 'wedding_filmmaker', label: 'Filmowiec ślubny' },
  { value: 'photographer_filmmaker', label: 'Fotograf + filmowiec' },
  { value: 'content_creator', label: 'Content creator' },
] as const

export type RegistrationProfessionValue =
  (typeof REGISTRATION_PROFESSIONS)[number]['value']

export const REGISTRATION_PROFESSION_VALUES = REGISTRATION_PROFESSIONS.map(
  (p) => p.value,
) as [RegistrationProfessionValue, ...RegistrationProfessionValue[]]

/**
 * Legacy values that may still appear on existing profiles.
 * Not offered in new registration; do not delete — avoids invalidating stored data.
 */
export const LEGACY_PROFESSION_VALUES = [
  'wedding_planner',
  'dj',
  'band',
  'decorator',
  'florist',
  'makeup_artist',
  'hair_stylist',
  'wedding_venue',
  'catering',
  'other',
] as const

/** @deprecated Prefer REGISTRATION_PROFESSIONS for the register UI. */
export const PROFESSIONS = REGISTRATION_PROFESSIONS

export type ProfessionValue =
  | RegistrationProfessionValue
  | (typeof LEGACY_PROFESSION_VALUES)[number]

export const PROFESSION_VALUES = [
  ...REGISTRATION_PROFESSION_VALUES,
  ...LEGACY_PROFESSION_VALUES,
] as ProfessionValue[]

const LABEL_BY_VALUE: Record<string, string> = {
  ...Object.fromEntries(REGISTRATION_PROFESSIONS.map((p) => [p.value, p.label])),
  wedding_planner: 'Wedding planner',
  dj: 'DJ',
  band: 'Zespół',
  decorator: 'Dekorator',
  florist: 'Florysta',
  makeup_artist: 'Makijażystka',
  hair_stylist: 'Fryzjer / stylista',
  wedding_venue: 'Sala weselna',
  catering: 'Catering',
  other: 'Inne',
}

/** Display label for any stored profession value (registration or legacy). */
export function professionLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return LABEL_BY_VALUE[value] ?? value
}
