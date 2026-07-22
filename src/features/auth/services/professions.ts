/**
 * Profession options for studio registration.
 * Values are stable English keys stored in profiles.profession;
 * labels are Polish for the UI.
 */

export const PROFESSIONS = [
  { value: 'wedding_photographer', label: 'Fotograf ślubny' },
  { value: 'wedding_filmmaker', label: 'Kamerzysta ślubny' },
  { value: 'photographer_filmmaker', label: 'Fotograf + kamerzysta' },
  { value: 'wedding_planner', label: 'Wedding planner' },
  { value: 'dj', label: 'DJ' },
  { value: 'band', label: 'Zespół' },
  { value: 'decorator', label: 'Dekorator' },
  { value: 'florist', label: 'Florysta' },
  { value: 'makeup_artist', label: 'Makijażystka' },
  { value: 'hair_stylist', label: 'Fryzjer / stylista' },
  { value: 'wedding_venue', label: 'Sala weselna' },
  { value: 'catering', label: 'Catering' },
  { value: 'content_creator', label: 'Twórca treści' },
  { value: 'other', label: 'Inne' },
] as const

export type ProfessionValue = (typeof PROFESSIONS)[number]['value']

export const PROFESSION_VALUES = PROFESSIONS.map((p) => p.value) as [
  ProfessionValue,
  ...ProfessionValue[],
]
