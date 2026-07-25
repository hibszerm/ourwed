/**
 * Ordered questionnaire block model for the form builder + public renderer.
 */

export type QuestionnaireBlockType =
  | 'heading'
  | 'text'
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'checkbox'
  | 'date'
  | 'number'
  | 'email'
  | 'phone'
  | 'packages'
  | 'additional_services'
  | 'location'
  | 'divider'
  | 'system_field'

export type SystemFieldKey =
  | 'weddingDate'
  | 'partner1.firstName'
  | 'partner1.lastName'
  | 'partner1.phone'
  | 'partner1.email'
  | 'partner1.address'
  | 'partner1.postalCode'
  | 'partner1.city'
  | 'partner2.firstName'
  | 'partner2.lastName'
  | 'partner2.phone'
  | 'partner2.email'
  | 'partner2.address'
  | 'additionalNotes'

export type LocationRole =
  | 'bride_preparation'
  | 'groom_preparation'
  | 'ceremony'
  | 'reception'

export interface QuestionnaireChoiceOption {
  id: string
  value: string
  label: string
}

export interface QuestionnaireBlockBase {
  id: string
  type: QuestionnaireBlockType
  order: number
  enabled: boolean
}

export interface QuestionnaireHeadingBlock extends QuestionnaireBlockBase {
  type: 'heading'
  text: string
  description?: string
  level?: 1 | 2 | 3
}

export interface QuestionnaireTextBlock extends QuestionnaireBlockBase {
  type: 'text'
  content: string
  /** greeting | footer | general — for compat / semantics */
  role?: 'greeting' | 'footer' | 'general'
}

export interface QuestionnaireDividerBlock extends QuestionnaireBlockBase {
  type: 'divider'
}

export interface QuestionnaireSystemFieldBlock extends QuestionnaireBlockBase {
  type: 'system_field'
  systemKey: SystemFieldKey
  label: string
  helperText?: string
  required: boolean
  inputType: 'text' | 'phone' | 'email' | 'date' | 'textarea' | 'address'
}

export interface QuestionnaireCustomFieldBlock extends QuestionnaireBlockBase {
  type:
    | 'short_text'
    | 'long_text'
    | 'single_choice'
    | 'multiple_choice'
    | 'checkbox'
    | 'date'
    | 'number'
    | 'email'
    | 'phone'
  fieldKey: string
  label: string
  helperText?: string
  required: boolean
  placeholder?: string
  options?: QuestionnaireChoiceOption[]
}

export interface QuestionnairePackageSelectionBlock extends QuestionnaireBlockBase {
  type: 'packages'
  label: string
  helperText?: string
  required: boolean
}

export interface QuestionnaireAdditionalServicesBlock
  extends QuestionnaireBlockBase {
  type: 'additional_services'
  label: string
  helperText?: string
  required: boolean
}

export interface QuestionnaireLocationBlock extends QuestionnaireBlockBase {
  type: 'location'
  locationRole: LocationRole
  label: string
  helperText?: string
  required: boolean
}

export type ContractQuestionnaireBlock =
  | QuestionnaireHeadingBlock
  | QuestionnaireTextBlock
  | QuestionnaireDividerBlock
  | QuestionnaireSystemFieldBlock
  | QuestionnaireCustomFieldBlock
  | QuestionnairePackageSelectionBlock
  | QuestionnaireAdditionalServicesBlock
  | QuestionnaireLocationBlock

export const LOCATION_ROLE_TO_FIELD_KEY: Record<LocationRole, string> = {
  bride_preparation: 'bridePreparationLocation',
  groom_preparation: 'groomPreparationLocation',
  ceremony: 'ceremonyLocation',
  reception: 'receptionLocation',
}

export const PROTECTED_SYSTEM_KEYS: SystemFieldKey[] = [
  'weddingDate',
  'partner1.firstName',
  'partner1.lastName',
  'partner1.phone',
  'partner1.email',
  'partner1.address',
  'partner2.firstName',
  'partner2.lastName',
  'partner2.phone',
  'partner2.email',
  'partner2.address',
]

export function newBlockId(prefix = 'blk'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
