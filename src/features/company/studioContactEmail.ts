import { isValidEmailStructure } from '@/features/weddings/import/normalizeContact'

const CONTACT_EMAIL_ERROR = 'Wpisz poprawny adres e-mail.'

/** Empty is valid (optional). Non-empty must look like an email. */
export function getStudioContactEmailError(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!isValidEmailStructure(trimmed)) return CONTACT_EMAIL_ERROR
  return null
}
