/**
 * Session — standalone photography assignment (not a Wedding workflow).
 */

export type SessionType =
  | 'engagement'
  | 'postWedding'
  | 'family'
  | 'business'
  | 'other'

export interface SessionPerson {
  firstName?: string
  lastName?: string
}

export interface SessionLocation {
  name?: string
  address?: string
  formattedAddress?: string
  placeId?: string
  latitude?: number
  longitude?: number
  source?: string
  verificationStatus?: string
}

export interface Session {
  id: string
  customName?: string
  primaryPerson: SessionPerson
  secondaryPerson?: SessionPerson
  sessionType: SessionType
  customSessionType?: string
  date: string
  startTime?: string
  endTime?: string
  location?: SessionLocation
  totalPrice: number
  depositAmount: number
  notes?: string
  linkedWeddingId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateSessionInput {
  customName?: string
  primaryPerson?: SessionPerson
  secondaryPerson?: SessionPerson
  sessionType: SessionType
  customSessionType?: string
  date: string
  startTime?: string
  endTime?: string
  location?: SessionLocation
  totalPrice: number
  depositAmount: number
  notes?: string
  linkedWeddingId?: string | null
}

export type UpdateSessionInput = Partial<CreateSessionInput>
