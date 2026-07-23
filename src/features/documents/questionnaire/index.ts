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
export { generateQuestionnaireDraft } from './generateQuestionnaireDraft'
export {
  buildPackageVariablesFromAi,
  createEmptyPackageVariable,
  buildTemplateDefaultsFromAi,
  createEmptyTemplateDefault,
} from './buildPackageVariables'
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
