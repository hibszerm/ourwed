/**
 * Defaults: ask clients only for couple / package selection.
 * Payments and studio settings are never questionnaire fields.
 */

import {
  isCoupleFacingRegistryKey,
  isPackageFacingRegistryKey,
  isStudioFacingRegistryKey,
} from '@/features/documents/ai/canonicalVariableIds'
import type { DraftQuestion } from './types'

export function shouldAskClientsByDefault(question: DraftQuestion): boolean {
  if (question.source === 'studio' || question.source === 'system') return false
  if (question.source === 'package') return false
  if (question.registryKey && isStudioFacingRegistryKey(question.registryKey)) {
    return false
  }
  if (question.registryKey && isPackageFacingRegistryKey(question.registryKey)) {
    return false
  }
  if (question.source === 'ourwed_configuration') return true
  if (question.registryKey && isCoupleFacingRegistryKey(question.registryKey)) {
    return true
  }
  return question.source === 'couple'
}

export function applyAskClientDefaults(
  questions: DraftQuestion[],
): DraftQuestion[] {
  return questions.map((q) => {
    if (q.registryKey && isPackageFacingRegistryKey(q.registryKey)) {
      // Should not appear as questions — filtered by classify — safety net
      return { ...q, source: 'package', enabled: false }
    }
    if (q.registryKey && isStudioFacingRegistryKey(q.registryKey)) {
      return {
        ...q,
        source: q.source === 'system' ? 'system' : 'studio',
        enabled: true,
      }
    }
    return {
      ...q,
      enabled: shouldAskClientsByDefault(q),
    }
  })
}
