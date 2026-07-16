/**
 * Production Form Engine types — aligned with public.forms / form_instances / form_answers.
 * Separate from the legacy mock types in `@/types/form`.
 */

export type FormCategory =
  | 'contract'
  | 'pre_wedding'
  | 'wedding_day'
  | 'feedback'
  | 'planning'
  | 'other'

export type FormInstanceStatus =
  | 'pending'
  | 'opened'
  | 'submitted'
  | 'expired'
  | 'revoked'
  | 'approved'
  | 'rejected'
  | 'archived'

/** Complete form definition document stored in forms.schema. */
export type FormSchema = Record<string, unknown>

/** Full submitted answers document stored in form_answers.answer_json. */
export type FormAnswerJson = Record<string, unknown>

export interface FormDefinition {
  id: string
  name: string
  slug: string
  description: string | null
  category: FormCategory
  schema: FormSchema
  version: number
  isActive: boolean
  createdAt: string
}

export interface FormInstance {
  id: string
  formId: string
  /** Null for lead questionnaires generated before a wedding exists. */
  weddingId: string | null
  token: string
  status: FormInstanceStatus
  expiresAt: string | null
  openedAt: string | null
  submittedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  createdAt: string
}

export interface FormAnswerRecord {
  id: string
  instanceId: string
  answerJson: FormAnswerJson
  createdAt: string
}
