/** Account deletion P0 — shared constants / types (client-safe). */

export const ACCOUNT_DELETION_CONFIRMATION_PHRASE = 'USUŃ KONTO' as const

export const ACCOUNT_DELETED_QUERY = 'accountDeleted' as const

export type AccountDeletionErrorCode =
  | 'AUTH_REQUIRED'
  | 'REAUTH_FAILED'
  | 'REAUTH_METHOD_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'ADMIN_DELETION_BLOCKED'
  | 'CALENDAR_LOCAL_CLEANUP_FAILED'
  | 'DATABASE_ERASURE_FAILED'
  | 'STORAGE_ERASURE_FAILED'
  | 'AUTH_ERASURE_FAILED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'NETWORK_AMBIGUOUS'
  | 'UNKNOWN'

export class AccountDeletionError extends Error {
  readonly code: AccountDeletionErrorCode
  readonly retryable: boolean

  constructor(
    code: AccountDeletionErrorCode,
    message: string,
    options?: { retryable?: boolean },
  ) {
    super(message)
    this.name = 'AccountDeletionError'
    this.code = code
    this.retryable = options?.retryable ?? true
  }
}

export type DeleteAccountResult =
  | { status: 'completed' }
  | { status: 'failed'; error: AccountDeletionError }
