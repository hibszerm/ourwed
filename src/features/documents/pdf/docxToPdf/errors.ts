/**
 * Re-export canonical contract PDF errors from Edge module (single implementation).
 */
export {
  ContractPdfError,
  contractPdfErrorUserMessage,
  mapContractPdfErrorForUser,
  statusForContractPdfCode,
  type ContractPdfErrorCode,
} from '../../../../../supabase/functions/contract-docx-to-pdf/contractPdfErrors.ts'
