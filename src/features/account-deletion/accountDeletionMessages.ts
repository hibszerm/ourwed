import { LEGAL_OPERATOR } from '@/features/legal/legalMeta'
import type { AccountDeletionErrorCode } from '@/features/account-deletion/accountDeletionTypes'

const GENERIC_FAILURE =
  'Nie udało się dokończyć usuwania konta. Spróbuj ponownie. Jeśli problem się powtórzy, skontaktuj się z pomocą OurWed.'

const SUPPORT = LEGAL_OPERATOR.email

/** Calm Polish copy for delete-account error codes. Never expose raw server details. */
export function messageForAccountDeletionError(
  code: AccountDeletionErrorCode,
): string {
  switch (code) {
    case 'REAUTH_FAILED':
      return 'Hasło jest nieprawidłowe. Spróbuj ponownie.'
    case 'RATE_LIMITED':
      return 'Wykonano zbyt wiele prób. Spróbuj ponownie za kilka minut.'
    case 'REAUTH_METHOD_UNAVAILABLE':
      return `Nie możemy potwierdzić tożsamości tą metodą. Skontaktuj się z pomocą OurWed (${SUPPORT}).`
    case 'ADMIN_DELETION_BLOCKED':
      return `Tego konta nie można obecnie usunąć automatycznie. Skontaktuj się z pomocą OurWed (${SUPPORT}).`
    case 'AUTH_REQUIRED':
      return 'Sesja wygasła. Zaloguj się ponownie.'
    case 'BAD_REQUEST':
      return 'Nieprawidłowe żądanie. Odśwież stronę i spróbuj ponownie.'
    case 'CALENDAR_LOCAL_CLEANUP_FAILED':
    case 'DATABASE_ERASURE_FAILED':
    case 'STORAGE_ERASURE_FAILED':
    case 'AUTH_ERASURE_FAILED':
    case 'INTERNAL_ERROR':
    case 'NETWORK_AMBIGUOUS':
    case 'UNKNOWN':
    default:
      return GENERIC_FAILURE
  }
}

export function isConfirmationPhraseValid(value: string): boolean {
  return value.trim() === 'USUŃ KONTO'
}
