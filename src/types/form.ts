import type { WeddingNote } from '@/types/wedding'

export type QuestionType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'multiselect'
  | 'location'
  | 'section_title'
  | 'paragraph'

export type FormTemplateType =
  | 'contract_questionnaire'
  | 'wedding_questionnaire'
  | 'contact'
  | 'booking'

export type FormStatus = 'open' | 'submitted' | 'closed'

export type AnswerValue = string | string[] | boolean

export interface QuestionOption {
  value: string
  label: string
}

export interface Question {
  id: string
  type: QuestionType
  /** Display label (inputs). For section_title / paragraph: main text. */
  label: string
  description?: string
  required?: boolean
  placeholder?: string
  options?: QuestionOption[]
  /**
   * Logical field used when mapping answers → wedding / pending wedding.
   * Display-only types omit this.
   */
  fieldKey?: string
}

export interface FormTemplate {
  id: string
  type: FormTemplateType
  title: string
  description: string
  questions: Question[]
  successTitle: string
  successDescription: string
  submitLabel: string
  /** When true, public form shows a coming-soon state instead of inputs. */
  comingSoon?: boolean
}

/** Studio-editable copy (later: Settings). */
export interface FormSettings {
  welcomeTitle: string
  welcomeDescription: string
  footerMessage: string
  successTitle: string
  successDescription: string
  /** Prefill for "Wyślij ankietę" optional message (contract). */
  contractQuestionnaireMessage?: string
  /** Prefill for "Wyślij ankietę" optional message (pre-wedding). */
  weddingQuestionnaireMessage?: string
}

/**
 * A concrete form instance reachable via /forms/:token.
 * weddingId set → Scenario A (update wedding).
 * weddingId null → Scenario B (create Pending Wedding).
 */
export interface Form {
  id: string
  token: string
  templateId: string
  weddingId: string | null
  status: FormStatus
  createdAt: string
  /** Optional per-form overrides of FormSettings. */
  settingsOverride?: Partial<FormSettings>
}

export interface QuestionAnswer {
  questionId: string
  value: AnswerValue
}

export interface FormSubmission {
  id: string
  formId: string
  answers: QuestionAnswer[]
  submittedAt: string
}

export type PendingWeddingStatus = 'pending' | 'accepted' | 'rejected'

export interface PendingWedding {
  id: string
  status: PendingWeddingStatus
  formId: string
  submissionId: string
  coupleLabel: string
  partner1FirstName: string
  partner1LastName: string
  partner2FirstName: string
  partner2LastName: string
  weddingDate: string
  packageId: string
  packageName: string
  packagePrice: number
  ceremonyLocation: string
  receptionLocation: string
  preparationLocation: string
  additionalNotes: string
  /** System notes to copy onto the Wedding after Akceptuj. */
  systemNotes: WeddingNote[]
  partner1: {
    firstName: string
    lastName: string
    address: string
    postalCode: string
    city: string
    phone: string
    email: string
  }
  partner2: {
    firstName: string
    lastName: string
    address: string
    postalCode: string
    city: string
    phone: string
    email: string
  }
  submittedAt: string
  reviewedAt?: string
  weddingId?: string
}

export interface ResolvedForm {
  form: Form
  template: FormTemplate
  settings: FormSettings
  /** Prefilled answers when wedding already exists. */
  initialAnswers: Record<string, AnswerValue>
}

export interface SubmitFormResult {
  success: true
  submission: FormSubmission
  scenario: 'update_wedding' | 'pending_wedding'
  pendingWeddingId?: string
  weddingId?: string
  packageChanged?: boolean
}
