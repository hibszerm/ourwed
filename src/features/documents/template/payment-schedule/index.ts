export type {
  DetectedPaymentEntry,
  DetectedPaymentSchedule,
  FriendlyQualitySummary,
  ManualPaymentScheduleIssue,
  ManualPaymentScheduleSubmission,
  OurWedFinanceSnapshot,
  PaymentNormalizedRole,
  PaymentSchedulePolicyResult,
  PaymentValueSource,
} from './types'

export {
  detectPaymentSchedule,
} from './detectPaymentSchedule'
export type { PaymentParagraphEvidence } from './detectPaymentSchedule'

export {
  evaluatePaymentSchedulePolicy,
  buildManualPaymentScheduleRequiredIssue,
  validateManualPaymentSubmission,
  applyOurWedAmountsToEntries,
} from './paymentSchedulePolicy'

export {
  formatPlnMajorUnits,
  normalizePaymentLabelRole,
  parsePlnMajorUnits,
  installmentOrdinal,
} from './normalize'

export {
  applyManualPaymentSchedule,
  rematerializeDocxAfterPaymentPatch,
} from './applyManualPaymentSchedule'
export type {
  ApplyManualPaymentScheduleResult,
  PaymentDocumentParagraph,
} from './applyManualPaymentSchedule'

export { buildFriendlyQualitySummary } from './friendlyQualitySummary'

export {
  contractGenerationRunService,
} from './generationRunService'
export type {
  ContractGenerationRun,
  ContractGenerationRunStatus,
} from './generationRunService'
