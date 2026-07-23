/**
 * System Variable Registry — types.
 * Primary IDs are snake_case (company_name). Legacy dotted keys stay as aliases.
 */

import type {
  DocumentVariableDataSource,
  DocumentVariableSection,
  DocumentVariableValueType,
} from '@/types/documents'
import type { VariableSourceId } from '@/lib/variables/types'

export type SystemVariableCategory =
  | 'company'
  | 'package'
  | 'wedding'
  | 'couple'
  | 'questionnaire'
  | 'crm'
  | 'travel'
  | 'invoice'
  | 'automation'
  | 'system'

export type SystemVariableType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'money'
  | 'location'
  | 'email'
  | 'phone'

export type SystemQuestionType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'location'
  | 'checkbox'

export interface SystemVariableDef {
  /** Canonical ID — AI and Resolve() use this. */
  id: string
  /** Primary UI label (Polish). */
  label: string
  /** English label for AI / docs (optional). */
  labelEn?: string
  description?: string
  category: SystemVariableCategory
  /** Owning data domain / provider. */
  source: VariableSourceId | 'computed' | 'draft' | 'system'
  type: SystemVariableType
  required?: boolean
  questionnaireAvailable: boolean
  documentAvailable: boolean
  crmAvailable: boolean
  /** Provider that supplies runtime values. */
  defaultProvider: VariableSourceId | 'computed' | 'draft' | 'system'
  /**
   * Legacy dotted key used in stored templates / DB registry
   * (e.g. studio.name). Always dual-written by providers.
   */
  legacyKey?: string
  /** Extra historical / AI aliases (not the primary id). */
  aliases?: string[]
  sortOrder?: number
  questionType?: SystemQuestionType
  /** Whether AI may emit this ID (default: documentAvailable || questionnaireAvailable). */
  aiAvailable?: boolean
  /** Adapter metadata for document UI sections. */
  documentSection?: DocumentVariableSection
  documentDataSource?: DocumentVariableDataSource
  documentValueType?: DocumentVariableValueType
}

export interface SystemVariableCategoryMeta {
  id: SystemVariableCategory
  label: string
}
