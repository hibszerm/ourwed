/**
 * @deprecated LEGACY — AI no longer owns questionnaires.
 *
 * Template-first architecture (2026-07):
 * - AI import builds reusable contract templates (slot_map + templated DOCX).
 * - Users create questionnaires manually under /ankiety.
 * - Contract generation is deterministic via VariableResolver + DOCX fill.
 *
 * These exports remain for any residual Mapping Wizard / migration paths.
 * Do not wire them into SimpleContractImportFlow.
 */

export type {
  ClassifiedVariable,
  ContractValueSource,
  DraftQuestion,
  PackageVariablePresence,
  QuestionnaireDraft,
  QuestionnaireDraftCounts,
  SuggestedPackageKind,
  TemplateDefaultValue,
} from './types'
export {
  CONTRACT_VALUE_SOURCE_LABELS,
  QUESTION_TYPE_LABELS,
  isQuestionnaireSource,
} from './types'
export { applyAskClientDefaults, shouldAskClientsByDefault } from './askDefaults'
export { classifyDetectedFields, countBySource } from './classifyVariables'
/** @deprecated Use template slot builder — do not call from import flow. */
export { generateQuestionnaireDraft } from './generateQuestionnaireDraft'
export {
  buildPackageVariablesFromAi,
  createEmptyPackageVariable,
  buildTemplateDefaultsFromAi,
  createEmptyTemplateDefault,
} from './buildPackageVariables'
/** @deprecated Import flow must not create FormDefinitions. */
export {
  saveQuestionnaireDraft,
  QuestionnaireValidationError,
  persistQuestionnaireDraft,
} from './saveQuestionnaireDraft'
export type { SaveQuestionnaireResult } from './saveQuestionnaireDraft'
export { mapDraftToFormTemplate } from './questionnaireMapper'
export {
  buildQuestionnaireFromReviewDraft,
  selectEnabledQuestionnaireQuestions,
  getPackageQuestionDefinition,
} from './buildQuestionnaireFromReviewDraft'
export { validateQuestionnaireDraft } from './validateQuestionnaireDraft'
export {
  generateQuestionsFromClassification,
  ensurePackageSelectQuestion,
} from './reuseEngine'
export {
  prepareReviewDraft,
  questionnaireQuestionsForSave,
  packageKindDisplayLabel,
  confidenceForQuestion,
  isSuggestedConfidence,
  toUiSource,
  fromUiSource,
} from './prepareReviewDraft'
export type { UiValueSource } from './prepareReviewDraft'
