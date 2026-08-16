/**
 * Canonical DTO for the offline Wedding Brief PDF (field guide / call sheet).
 * Stable operational overview + dynamic questionnaire detail sections.
 */

import type { PreWeddingFieldType } from '@/types/preweddingQuestionnaire'

export type BriefMoneySummary = {
  contractValue: number
  totalPaid: number
  remainingToPay: number
  currency: string
}

export type BriefContact = {
  role: string
  name: string
  phone?: string
  email?: string
  note?: string
}

export type BriefLocation = {
  /** One or more operational roles for this unique place. */
  roles: string[]
  name?: string
  address: string
  latitude?: number | null
  longitude?: number | null
  note?: string
}

/** Cached road leg into this Plan dnia stop (from previous consecutive stop). */
export type BriefTravelFromPrevious = {
  distanceMeters: number
  durationSeconds: number
}

export type BriefTimelineItem = {
  /** Empty string when stage is known but untimed. */
  time: string
  title: string
  placeName?: string
  shortAddress?: string
  /** Optional one-line critical context. */
  context?: string
  untimed?: boolean
  /**
   * Subtle travel connector before this stop.
   * Only when a cached ok road segment exists between verified consecutive places.
   */
  travelFromPrevious?: BriefTravelFromPrevious
}

export type BriefNote = {
  label: string
  content: string
}

export type BriefOperationalItem = {
  label: string
  value: string
}

export type BriefOperationalSection = {
  id: string
  title: string
  items: BriefOperationalItem[]
}

export type BriefVendor = {
  name: string
  role?: string
  detail?: string
}

export type BriefSession = {
  title: string
  date: string
  time?: string
  location?: string
  notes?: string
}

export type BriefSettlementSummary = BriefMoneySummary & {
  depositPaid: number
  settled?: boolean
}

/** Coverage audit — every answered operational question must appear here. */
export type BriefCoverageAudit = {
  mappedQuestionIds: string[]
  adminOnlyQuestionIds: string[]
  additionalQuestionIds: string[]
  unmappedNonEmptyQuestionIds: string[]
  /** Question ids rendered in Layer B dynamic questionnaire sections. */
  questionnaireDetailQuestionIds: string[]
}

/** Layer B — one questionnaire section from the instance snapshot. */
export type BriefQuestionnaireSection = {
  id: string
  title: string
  items: BriefQuestionnaireItem[]
}

export type BriefQuestionnaireItem = {
  questionId: string
  label: string
  type: PreWeddingFieldType
  displayValue: string
  semanticMapping?: string
  critical?: boolean
  consumedByOperationalBlock?: boolean
}

export type WeddingBriefPdfData = {
  document: {
    title: string
    generatedAt: string
    generatedAtLabel: string
    locale: 'pl-PL'
    timezone: string
  }
  wedding: {
    id: string
    coupleDisplayName: string
    weddingDate: string
    weddingDateLabel: string
    daysRemaining?: number
    packageName?: string
    additionalServices: string[]
    coverageStart?: string
    coverageEnd?: string
    guestCount?: number
  }
  contacts: BriefContact[]
  timeline: BriefTimelineItem[]
  locations: BriefLocation[]
  /** Nie przegap — P1 critical field notes only. */
  criticalNotes: BriefNote[]
  /**
   * @deprecated Dynamic Brief V1 — kept empty for API compatibility.
   * Questionnaire detail lives in questionnaireSections.
   */
  operationalSections: BriefOperationalSection[]
  vendors: BriefVendor[]
  settlement?: BriefSettlementSummary
  sessions?: BriefSession[]
  /**
   * Legacy orphan fallback only (missing snapshot ids / empty schema).
   * Normal custom answers use questionnaireSections.
   */
  additionalOperational: BriefOperationalItem[]
  /** Layer B — sections from schema_snapshot_json in array order. */
  questionnaireSections: BriefQuestionnaireSection[]
  footer: {
    generatedBy: string
    coupleDisplayName: string
    weddingDateLabel: string
  }
  coverageAudit: BriefCoverageAudit
  missingOperational?: string[]
}
