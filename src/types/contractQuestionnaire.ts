/**
 * Contract questionnaire configuration, option snapshots, and custom fields.
 * Company defaults live in studio_details.questionnaire_config;
 * each issued form_instance may freeze a public-safe options_snapshot.
 */

import type { ContractQuestionnaireBlock } from '@/types/questionnaireBlocks'

export type QuestionnaireCustomFieldType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'checkbox'
  | 'date'
  | 'number'
  | 'phone'
  | 'email'

export interface QuestionnaireCustomFieldOption {
  value: string
  label: string
}

export interface QuestionnaireCustomField {
  id: string
  /** Stable internal key — never change when renaming the label. */
  fieldKey: string
  label: string
  helperText?: string
  type: QuestionnaireCustomFieldType
  required: boolean
  enabled: boolean
  order: number
  options?: QuestionnaireCustomFieldOption[]
  placeholder?: string
}

export interface ContractQuestionnaireConfig {
  version: number
  greeting?: string
  footerText?: string
  questionnaireTitle?: string
  submitButtonLabel?: string
  successMessage?: string
  showPackages: boolean
  allowMultiplePackages: boolean
  showAdditionalServices: boolean
  packagesRequired: boolean
  requiredFields?: Record<string, boolean>
  /** Legacy custom fields — kept in sync from blocks. */
  customFields: QuestionnaireCustomField[]
  /** Ordered form-builder blocks (v2+). */
  blocks?: ContractQuestionnaireBlock[]
}

export interface PackageOptionSnapshot {
  id: string
  name: string
  description?: string | null
  price?: number | null
  currency?: string | null
}

export interface AdditionalServiceOptionSnapshot {
  id: string
  name: string
  description?: string | null
  price?: number | null
  currency?: string | null
}

export interface FormInstanceOptionsSnapshot {
  version: number
  config: ContractQuestionnaireConfig
  packageOptions: PackageOptionSnapshot[]
  additionalServiceOptions: AdditionalServiceOptionSnapshot[]
  createdAt: string
}

export interface CustomFieldAnswer {
  fieldId: string
  fieldKey?: string
  labelSnapshot: string
  type: string
  value: unknown
  /** Frozen choice options at submit time (label resolution without live config). */
  optionSnapshots?: Array<{ value: string; label: string }>
}

export const CONTRACT_QUESTIONNAIRE_CONFIG_VERSION = 2

export function defaultContractQuestionnaireConfig(): ContractQuestionnaireConfig {
  return {
    version: CONTRACT_QUESTIONNAIRE_CONFIG_VERSION,
    greeting:
      'Bardzo się cieszymy, że będziemy mogli być z Wami w tym wyjątkowym dniu. Poniżej prosimy o uzupełnienie kilku informacji.',
    footerText: 'W razie pytań napiszcie do nas — chętnie pomożemy.',
    showPackages: true,
    allowMultiplePackages: true,
    showAdditionalServices: true,
    packagesRequired: true,
    customFields: [],
  }
}
