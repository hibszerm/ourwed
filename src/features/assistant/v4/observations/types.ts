/**
 * Compact typed Assistant observations — facts only, no raw CRM rows / PII dumps.
 */

import type { V4FinanceMetric } from '../execution/financeTypes'

export type MoneyObservation = {
  kind: 'money'
  resource: {
    kind: 'wedding'
    id: string
  }
  metric: V4FinanceMetric
  amount: number
  currency: string
  /** Optional safe presentation label (already used by Assistant cards). */
  displayName?: string
}

/** Semantic place role from TaskSpec (not DB enum). */
export type PlaceFactRole = 'preparations' | 'ceremony' | 'reception'

export type PlaceObservation = {
  kind: 'place'
  resource: {
    kind: 'wedding'
    id: string
  }
  role: PlaceFactRole
  /** Bound participant for preparations; null when unscoped. */
  participantKey: 'p1' | 'p2' | null
  label: string | null
  name: string | null
  address: string | null
  /** false when the requested place fact is unset. */
  set: boolean
  displayName?: string
  /**
   * When preparations is unscoped, both bride/groom slots (same SoT as V3).
   * Omitted for ceremony/reception / participant-scoped prep.
   */
  entries?: Array<{
    participantKey: 'p1' | 'p2'
    name: string | null
    address: string | null
    set: boolean
  }>
}

/** Semantic time role from TaskSpec. No invented end-time until product SoT exists. */
export type TimeFactRole = 'preparations' | 'ceremony' | 'reception'

export type TimeObservation = {
  kind: 'time'
  resource: {
    kind: 'wedding'
    id: string
  }
  role: TimeFactRole
  participantKey: 'p1' | 'p2' | null
  /** Normalized HH:MM from operational day-plan; null = not set. */
  time: string | null
  displayName?: string
}

/** Phase 3D/3E — collection aggregate / rank / list facts (no raw CRM rows). */
export type CollectionObservation = {
  kind: 'collection'
  resource: 'wedding'
  operation: 'count' | 'sum' | 'rank' | 'list'
  filters: {
    dateRange: { from: string; to: string } | null
    locationQuery?: string | null
    locationRole?: 'preparations' | 'ceremony' | 'reception' | 'any' | null
    label: string | null
  }
  totalCount: number
  returnedCount: number
  truncated: boolean
  metric?: V4FinanceMetric | null
  amount?: number
  currency: string
  items?: Array<{
    resource: { kind: 'wedding'; id: string }
    displayName: string
    date: string | null
    metricValue?: number
  }>
}

export type AssistantObservation =
  | MoneyObservation
  | PlaceObservation
  | TimeObservation
  | CollectionObservation
  | import('../domainQuery/observations').DomainQueryObservation
