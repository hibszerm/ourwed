export type CollaborativeWeddingPlaceRole =
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'

export interface CollaborativeWeddingListItem {
  wedding_id: string
  couple_first_name: string
  couple_second_name: string
  wedding_date: string | null
}

export interface CollaborativeWeddingPlace {
  role: CollaborativeWeddingPlaceRole
  formatted_address: string
  operational_time: string | null
}

export interface CollaborativeWeddingDetail {
  wedding_id: string
  couple_first_name: string
  couple_second_name: string
  wedding_date: string | null
  places: CollaborativeWeddingPlace[]
}

export interface CollaborativeWeddingCursor {
  afterWeddingDate: string | null
  afterWeddingId: string | null
}

export const COLLABORATIVE_WEDDING_PAGE_SIZE = 50

export const COLLABORATIVE_PLACE_ROLES: readonly CollaborativeWeddingPlaceRole[] = [
  'bride_preparation',
  'groom_preparation',
  'ceremony',
  'reception',
]

export function isCollaborativePlaceRole(value: unknown): value is CollaborativeWeddingPlaceRole {
  return typeof value === 'string' && COLLABORATIVE_PLACE_ROLES.includes(value as CollaborativeWeddingPlaceRole)
}

export function isValidOperationalClock(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function formatCollaborativeWeddingDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeZone: 'UTC' }).format(parsed)
}
