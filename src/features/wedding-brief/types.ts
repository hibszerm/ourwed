/**
 * Canonical DTO for the offline Wedding Brief PDF.
 * Built from wedding aggregates — never from React DOM.
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
  role: string
  name?: string
  address: string
  latitude?: number | null
  longitude?: number | null
  note?: string
}

export type BriefTimelineItem = {
  time: string
  title: string
  location?: string
  address?: string
  description?: string
  note?: string
}

export type BriefNote = {
  label?: string
  content: string
  critical?: boolean
}

export type BriefQuestionnaireAnswer = {
  label: string
  value: string
  kind: 'text' | 'location' | 'time' | 'date' | 'long_text'
}

export type BriefQuestionnaireSection = {
  title: string
  answers: BriefQuestionnaireAnswer[]
}

export type BriefVendor = {
  name: string
  role?: string
  detail?: string
}

export type BriefEquipmentItem = {
  label: string
  ready: boolean
}

export type BriefEquipmentSection = {
  items: BriefEquipmentItem[]
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
  quickSummary: {
    keyContacts: BriefContact[]
    startTime?: string
    firstLocation?: BriefLocation
    remainingPayment?: BriefMoneySummary
    criticalNote?: string
  }
  timeline: BriefTimelineItem[]
  locations: BriefLocation[]
  contacts: BriefContact[]
  importantNotes: BriefNote[]
  questionnaire: {
    title?: string
    submittedAt?: string
    sections: BriefQuestionnaireSection[]
  } | null
  contractQuestionnaire: {
    sections: BriefQuestionnaireSection[]
  } | null
  vendors: BriefVendor[]
  equipment?: BriefEquipmentSection
  settlement?: BriefSettlementSummary
  sessions?: BriefSession[]
  footer: {
    generatedBy: string
    coupleDisplayName: string
    weddingDateLabel: string
  }
  missingOperational?: string[]
}
