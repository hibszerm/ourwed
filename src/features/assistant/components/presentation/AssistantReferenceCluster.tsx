/**
 * Presentation helpers retained for tests / SafeText-adjacent use.
 * Visual clustering moved to AssistantContextCard + buildContextCards.
 */

import type { AssistantReference } from '../../v7/presentation/types'
import { formatPresentationCalendarLabel } from './formatPresentationDate'

export function displayLabelForReference(
  ref: AssistantReference,
): string | null {
  if (ref.kind === 'calendar' && ref.label) {
    return formatPresentationCalendarLabel(ref.label)
  }
  return ref.label?.trim() || null
}

/** @deprecated — context cards always surface phone/email/address values. */
export function shouldShowReferenceValue(
  kind: AssistantReference['kind'],
  value: string | null,
  _answerMessage: string,
): boolean {
  if (!value) return false
  return kind === 'phone' || kind === 'email' || kind === 'address'
}
