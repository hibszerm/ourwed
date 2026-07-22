/**
 * Defaults: ask clients only for couple / package info.
 * Studio finances and sensitive IDs stay off unless the user opts in.
 */

import type { DraftQuestion } from './types'

const DO_NOT_ASK_RE =
  /pesel|dowód|tożsamo|nip|regon|\bfirma\b|company|tax|numer dowodu|id number|cena|price|zadatek|deposit|pozostał|remaining|bank|konto|iban|termin płat|copyright|prawa autorsk|godzin pracy|nip studia/i

export function shouldAskClientsByDefault(question: DraftQuestion): boolean {
  if (question.source === 'studio' || question.source === 'system') return false
  if (question.source === 'ourwed_configuration') return true

  const blob = `${question.title} ${question.contractLabel} ${question.fieldKey ?? ''}`
  if (DO_NOT_ASK_RE.test(blob)) return false

  return question.source === 'couple'
}

export function applyAskClientDefaults(
  questions: DraftQuestion[],
): DraftQuestion[] {
  return questions.map((q) => ({
    ...q,
    enabled: shouldAskClientsByDefault(q),
  }))
}
