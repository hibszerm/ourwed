/**
 * Shared domain error for capability execute() → runtime mapping.
 */

export class CapabilityDomainError extends Error {
  readonly safeCode: string
  readonly executionStatus: 'not_found' | 'needs_clarification' | 'error'
  readonly missingSlot?: 'resource' | 'participant' | 'subject' | 'other'

  constructor(input: {
    safeCode: string
    executionStatus: 'not_found' | 'needs_clarification' | 'error'
    missingSlot?: 'resource' | 'participant' | 'subject' | 'other'
  }) {
    super(input.safeCode)
    this.name = 'CapabilityDomainError'
    this.safeCode = input.safeCode
    this.executionStatus = input.executionStatus
    this.missingSlot = input.missingSlot
  }
}
