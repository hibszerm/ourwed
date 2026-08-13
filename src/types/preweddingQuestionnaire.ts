// =============================================================================
// Pre-Wedding Questionnaire — TypeScript types
// =============================================================================

/** Field types supported by the pre-wedding questionnaire. */
export type PreWeddingFieldType =
  | 'short_text'
  | 'long_text'
  | 'date'
  | 'time'
  | 'single_choice'
  | 'multiple_choice'
  | 'yes_no'
  | 'address'
  | 'information'
  | 'acknowledgement'

export const PREWEDDING_FIELD_TYPE_LABELS: Record<PreWeddingFieldType, string> = {
  short_text: 'Krótka odpowiedź',
  long_text: 'Długa odpowiedź',
  date: 'Data',
  time: 'Godzina',
  single_choice: 'Wybór jednej opcji',
  multiple_choice: 'Wybór wielu opcji',
  yes_no: 'Tak / Nie',
  address: 'Adres',
  information: 'Informacja',
  acknowledgement: 'Potwierdzenie',
}

/** A single question/field within a section. */
export interface PreWeddingQuestion {
  id: string
  label: string
  type: PreWeddingFieldType
  required: boolean
  /** For single_choice / multiple_choice / yes_no */
  options?: string[]
  /** Optional placeholder text */
  placeholder?: string
  /** Optional helper text below the label */
  helpText?: string
  /** Optional hint about which Wedding Day field this maps to */
  weddingDayMapping?: string
  /** Whether this question is hidden for this specific wedding instance */
  hidden?: boolean
}

/** A section containing questions. */
export interface PreWeddingSection {
  id: string
  title: string
  description?: string
  questions: PreWeddingQuestion[]
}

/** The schema stored in schema_json / schema_snapshot_json. */
export interface PreWeddingTemplateSchema {
  sections: PreWeddingSection[]
}

// ---------------------------------------------------------------------------
// Template (photographer-owned, reusable)
// ---------------------------------------------------------------------------

/** Questionnaire library type — contract vs pre-wedding. */
export type QuestionnaireTemplateType = 'contract' | 'pre_wedding'

export const QUESTIONNAIRE_TEMPLATE_TYPE_LABELS: Record<QuestionnaireTemplateType, string> = {
  contract: 'Do umowy',
  pre_wedding: 'Przedślubna',
}

export interface QuestionnaireTemplate {
  id: string
  ownerId: string
  /** Internal library name (e.g. "Foto + Film"). */
  name: string
  type: QuestionnaireTemplateType
  sourceKey?: string | null
  /** Client-visible title on the public form. */
  title: string
  introduction: string
  schema: PreWeddingTemplateSchema
  version: number
  isDefault: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
  /** Optional usage count when loaded with join/aggregation. */
  usageCount?: number
}

// ---------------------------------------------------------------------------
// Wedding questionnaire status lifecycle
// ---------------------------------------------------------------------------

export type WeddingQuestionnaireStatus =
  | 'draft'
  | 'ready'
  | 'sent'
  | 'opened'
  | 'in_progress'
  | 'submitted'
  /** @deprecated Legacy — treated as submitted in UI and RPCs. */
  | 'reopened'
  | 'archived'

export const WEDDING_QUESTIONNAIRE_STATUS_LABELS: Record<WeddingQuestionnaireStatus, string> = {
  draft: 'Szkic',
  ready: 'Gotowa do wysłania',
  sent: 'Wysłana',
  opened: 'Otwarta',
  in_progress: 'W trakcie',
  submitted: 'Wypełniona',
  /** Legacy reopen — display as filled; reopen is no longer a product action. */
  reopened: 'Wypełniona',
  archived: 'Zarchiwizowana',
}

/** Statuses that mean the couple has completed at least one submission. */
export function isPreWeddingSubmittedStatus(
  status: WeddingQuestionnaireStatus,
): boolean {
  return status === 'submitted' || status === 'reopened'
}

// ---------------------------------------------------------------------------
// Wedding questionnaire instance
// ---------------------------------------------------------------------------

/** Prefill JSON values — scalars or structured places for address mappings. */
export type PrefillValue = string | import('@/types/travel').GeoPlace

export interface WeddingQuestionnaire {
  id: string
  weddingId: string
  ownerId: string
  templateId?: string | null
  templateVersion?: number | null
  title: string
  introduction: string
  schema: PreWeddingTemplateSchema
  /**
   * Prefill keyed by weddingDayMapping.
   * Location mappings may be GeoPlace (structured) or legacy plain address strings.
   */
  prefill: Record<string, PrefillValue>
  status: WeddingQuestionnaireStatus
  /** True when a public_token_hash exists (plaintext is never recoverable from DB). */
  hasPublicToken: boolean
  /** Plaintext token — only present when freshly generated, never stored in DB */
  publicToken?: string
  preparedAt?: string | null
  sentAt?: string | null
  firstOpenedAt?: string | null
  lastSavedAt?: string | null
  submittedAt?: string | null
  /** @deprecated Unused by product — kept for DB compatibility. */
  reopenedAt?: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Questionnaire response (couple answers)
// ---------------------------------------------------------------------------

export type PreWeddingAnswerValue =
  | string
  | boolean
  | string[]
  | import('@/types/travel').GeoPlace
  /** @deprecated Legacy questionnaire address JSON — still readable via answerToGeoPlace. */
  | import('@/features/prewedding/preweddingAddress').PreWeddingAddressAnswer

export interface WeddingQuestionnaireResponse {
  questionnaireId: string
  answers: Record<string, PreWeddingAnswerValue>
  answeredRequired: number
  totalRequired: number
  submittedAt?: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Public form view (loaded by couple via token)
// ---------------------------------------------------------------------------

export interface PublicPreWeddingForm {
  id: string
  title: string
  introduction: string
  schema: PreWeddingTemplateSchema
  prefill: Record<string, PrefillValue>
  status: WeddingQuestionnaireStatus
  submittedAt?: string | null
  savedAnswers: Record<string, PreWeddingAnswerValue>
  answeredRequired: number
  totalRequired: number
  /** Photographer studio branding (from studio_details). */
  studioName?: string | null
  studioLogoUrl?: string | null
}

// ---------------------------------------------------------------------------
// Wedding Day mapping proposal (for apply-answers flow)
// ---------------------------------------------------------------------------

export interface WeddingDayMappingProposal {
  questionId: string
  questionLabel: string
  weddingDayField: string
  weddingDayLabel: string
  currentValue: string
  proposedValue: string
  isEmpty: boolean
}

// ---------------------------------------------------------------------------
// Prefill keys — standard field identifiers
// ---------------------------------------------------------------------------

export const PREFILL_KEYS = {
  weddingDate: 'weddingDate',
  brideName: 'brideName',
  bridePhone: 'bridePhone',
  groomName: 'groomName',
  groomPhone: 'groomPhone',
  bridePreparationLocation: 'bridePreparationLocation',
  groomPreparationLocation: 'groomPreparationLocation',
  ceremonyLocation: 'ceremonyLocation',
  ceremonyTime: 'ceremonyTime',
  receptionVenue: 'receptionVenue',
} as const

export type PrefillKey = (typeof PREFILL_KEYS)[keyof typeof PREFILL_KEYS]
