/**
 * Intermediate model between contract AI analysis and the Form Engine.
 * AI produces this only — persistence goes through QuestionnaireMapper + services.
 */

import type { QuestionOption, QuestionType } from '@/types/form'

/** Where a contract value comes from — never shown as registry jargon. */
export type ContractValueSource =
  | 'couple'
  | 'studio'
  | 'system'
  | 'ourwed_configuration'
  | 'package'

export type SuggestedPackageKind =
  | 'photo'
  | 'video'
  | 'photo_video'
  | 'unknown'

export interface ClassifiedVariable {
  fieldId: string
  /** Internal registry key — never show in normal UX. */
  registryKey: string | null
  /** Human label for summaries / advanced views. */
  label: string
  source: ContractValueSource
  confidence: number
}

export interface DraftQuestion {
  id: string
  enabled: boolean
  title: string
  description: string
  placeholder: string
  required: boolean
  type: QuestionType
  /** CRM field key used by approve/merge (e.g. partner1.firstName). */
  fieldKey: string | null
  /** Semantic label of the contract slot (not a registry key). */
  contractLabel: string
  /** Internal — for reuse / persist only. */
  registryKey: string | null
  source: ContractValueSource
  reused: boolean
  order: number
  /** For select / radio / multiselect — e.g. studio packages. */
  options?: QuestionOption[]
}

/**
 * Package slot detected in the contract — presence only.
 * Values always come from Studio → Packages at generation time.
 */
export interface PackageVariablePresence {
  id: string
  registryKey: string
  label: string
  enabled: boolean
  confidence: number
}

/** @deprecated Use PackageVariablePresence */
export type TemplateDefaultValue = PackageVariablePresence & {
  value?: string
  valueType?: string
  placeholder?: string
  unit?: string
}

export interface QuestionnaireDraftCounts {
  couple: number
  studio: number
  system: number
  ourwedConfiguration: number
  packageVariables: number
  /** @deprecated */
  templateDefaults: number
}

export interface QuestionnaireDraft {
  name: string
  description: string
  suggestedPackageKind: SuggestedPackageKind
  suggestedPackageLabel: string | null
  /** Matched studio package id when catalog match is found. */
  linkedPackageId: string | null
  classification: ClassifiedVariable[]
  counts: QuestionnaireDraftCounts
  questions: DraftQuestion[]
  /** Section 3 — package slots (values from Studio Packages). */
  packageVariables: PackageVariablePresence[]
  /**
   * @deprecated Always empty — kept so older draft code paths don't crash.
   */
  templateDefaults: TemplateDefaultValue[]
  generatedAt: string
  savedFormId: string | null
  savedInstanceId: string | null
  savedFormUrl: string | null
}

export const CONTRACT_VALUE_SOURCE_LABELS: Record<
  ContractValueSource,
  string
> = {
  couple: 'Para',
  studio: 'Studio',
  system: 'System',
  ourwed_configuration: 'Konfiguracja OurWed',
  package: 'Pakiet',
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Tekst',
  textarea: 'Tekst długi',
  email: 'E-mail',
  phone: 'Telefon',
  date: 'Data',
  select: 'Lista wyboru',
  checkbox: 'Checkbox',
  radio: 'Radio',
  multiselect: 'Wielokrotny wybór',
  location: 'Lokalizacja',
  section_title: 'Nagłówek',
  paragraph: 'Akapit',
}

/** Sources that become questionnaire questions the couple sees. */
export function isQuestionnaireSource(source: ContractValueSource): boolean {
  return source === 'couple' || source === 'ourwed_configuration'
}
