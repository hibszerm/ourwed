/**
 * Review-field validation for contract generation.
 * Draft values may be incomplete; only committed valid values resolve issues.
 */

export type FieldValidationResult =
  | { ok: true }
  | { ok: false; message: string }

function isAddressKey(registryKey: string): boolean {
  return /address|adres/i.test(registryKey)
}

function isNameKey(registryKey: string): boolean {
  return /(_name|full_name|imie|nazwisk)/i.test(registryKey)
}

function isPhoneKey(registryKey: string): boolean {
  return /phone|telefon|tel_/i.test(registryKey)
}

function isEmailKey(registryKey: string): boolean {
  return /email|e-mail|mail/i.test(registryKey)
}

function isDateKey(registryKey: string): boolean {
  return /_date$|due_date|wedding_date|execution_date/i.test(registryKey)
}

function isMoneyKey(registryKey: string): boolean {
  return /amount|price|fee|deposit|value|kwot|wynagrod|rate/i.test(registryKey)
}

function isLocationKey(registryKey: string): boolean {
  return /location|venue|miejsce|city|miasto/i.test(registryKey)
}

/**
 * Validate a draft/committed override value for a registry key.
 * Empty/whitespace is unresolved (not a validation error message for empty —
 * caller decides whether emptiness is required).
 */
export function validateContractFieldValue(
  registryKey: string,
  raw: string | null | undefined,
): FieldValidationResult {
  const value = (raw ?? '').trim()
  if (!value) {
    return { ok: false, message: 'Uzupełnij to pole.' }
  }

  if (isAddressKey(registryKey)) {
    if (value.length < 2) {
      return { ok: false, message: 'Wpisz pełny adres.' }
    }
    return { ok: true }
  }

  if (isNameKey(registryKey)) {
    if (value.length < 2) {
      return { ok: false, message: 'Wpisz pełne imię i nazwisko.' }
    }
    return { ok: true }
  }

  if (isPhoneKey(registryKey)) {
    const digits = value.replace(/\D/g, '')
    if (digits.length < 9) {
      return { ok: false, message: 'Wpisz poprawny numer telefonu.' }
    }
    return { ok: true }
  }

  if (isEmailKey(registryKey)) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { ok: false, message: 'Wpisz poprawny adres e-mail.' }
    }
    return { ok: true }
  }

  if (isDateKey(registryKey)) {
    // Accept common Polish / ISO-ish forms without inventing a full parser.
    if (
      !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(value) &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return { ok: false, message: 'Wpisz pełną datę (np. 15.07.2026).' }
    }
    return { ok: true }
  }

  if (isMoneyKey(registryKey)) {
    if (!/\d/.test(value) || value.length < 2) {
      return { ok: false, message: 'Wpisz pełną kwotę.' }
    }
    return { ok: true }
  }

  if (isLocationKey(registryKey)) {
    if (value.length < 2) {
      return { ok: false, message: 'Wpisz pełną lokalizację.' }
    }
    return { ok: true }
  }

  // Generic: one character is never enough to resolve a missing field.
  if (value.length < 2) {
    return { ok: false, message: 'Wpisz pełną wartość.' }
  }
  return { ok: true }
}

/** True when a non-empty string is still too weak to count as resolved. */
export function isIncompleteContractFieldValue(
  registryKey: string,
  raw: string | null | undefined,
): boolean {
  const value = (raw ?? '').trim()
  if (!value) return true
  return !validateContractFieldValue(registryKey, value).ok
}
