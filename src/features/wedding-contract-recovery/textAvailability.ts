import { ContractRecoveryError } from './errors'
import type { DocumentTextAvailability, ExtractedDocumentText } from './types'

export function assertTextAvailable(extracted: ExtractedDocumentText): void {
  if (extracted.availability === 'no_text_detected' || !extracted.plainText.trim()) {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_EMPTY_DOCUMENT_TEXT')
  }
  if (extracted.availability === 'password_protected') {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_PASSWORD_PROTECTED_PDF')
  }
  if (extracted.availability === 'parse_failed') {
    throw new ContractRecoveryError('CONTRACT_RECOVERY_DOCUMENT_PARSE_FAILED')
  }
}

export function classifyTextAvailability(plainText: string): DocumentTextAvailability {
  return plainText.trim() ? 'text_available' : 'no_text_detected'
}
