/**
 * Canonical DTO for the offline Wedding Brief PDF (field guide / call sheet).
 * Derived operational view — not a questionnaire archive.
 */

export type BriefMoneySummary = {
  contractValue: number
  totalPaid: number
  remainingToPay: number
  currency: string
  dueLabel?: string
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

export type BriefTimelineItem = {
  /** Empty string when stage is known but untimed. */
  time: string
  title: string
  placeName?: string
  shortAddress?: string
  /** Optional one-line critical context. */
  context?: string
  untimed?: boolean
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
  /** Compact travel fee when resolved (charged/included). */
  travelFeeLabel?: string
}

/** Coverage audit — every answered operational question must appear here. */
export type BriefCoverageAudit = {
  mappedQuestionIds: string[]
  adminOnlyQuestionIds: string[]
  additionalQuestionIds: string[]
  unmappedNonEmptyQuestionIds: string[]
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
  operationalSections: BriefOperationalSection[]
  vendors: BriefVendor[]
  settlement?: BriefSettlementSummary
  sessions?: BriefSession[]
  /** Unmapped / leftover operational answers (compact). */
  additionalOperational: BriefOperationalItem[]
  footer: {
    generatedBy: string
    coupleDisplayName: string
    weddingDateLabel: string
  }
  coverageAudit: BriefCoverageAudit
  missingOperational?: string[]
}
