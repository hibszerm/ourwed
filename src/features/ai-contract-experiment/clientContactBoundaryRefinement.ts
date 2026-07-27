/**
 * Refine client address / phone exact spans — preserve immutable labels.
 */

import type { MappingBoundaryResolution } from './types'

const ADDRESS_LABEL =
  /^(?:zam\.|zamieszkał[ay]?|zamieszkały|adres:|przy ul\.)\s*/i

const PHONE_LABEL = /^(?:tel\.|telefon:|nr tel\.)\s*/i

const PHONE_VALUE =
  /^(?:\+48[\s-]?)?(?:\d[\s-]?){8,11}$/

export function refineClientAddressBoundary(input: {
  aiExactValue: string
  blockText: string
}): MappingBoundaryResolution | null {
  const { aiExactValue, blockText } = input
  let resolved = aiExactValue.trim()

  if (ADDRESS_LABEL.test(resolved)) {
    resolved = resolved.replace(ADDRESS_LABEL, '').trim()
  }

  if (!resolved || !blockText.includes(resolved)) return null

  if (resolved === aiExactValue.trim()) {
    return {
      originalExactValue: aiExactValue,
      resolvedExactValue: resolved,
      resolutionMethod: 'ai_exact',
    }
  }

  return {
    originalExactValue: aiExactValue,
    resolvedExactValue: resolved,
    resolutionMethod: 'refined_by_validator',
  }
}

export function refineClientPhoneBoundary(input: {
  aiExactValue: string
  blockText: string
}): MappingBoundaryResolution | null {
  const { aiExactValue, blockText } = input
  let resolved = aiExactValue.trim()

  if (PHONE_LABEL.test(resolved)) {
    resolved = resolved.replace(PHONE_LABEL, '').trim()
  }

  if (!resolved || !PHONE_VALUE.test(resolved.replace(/\s/g, ' '))) {
    return null
  }

  if (!blockText.includes(resolved)) return null

  if (resolved === aiExactValue.trim()) {
    return {
      originalExactValue: aiExactValue,
      resolvedExactValue: resolved,
      resolutionMethod: 'ai_exact',
    }
  }

  return {
    originalExactValue: aiExactValue,
    resolvedExactValue: resolved,
    resolutionMethod: 'refined_by_validator',
  }
}
