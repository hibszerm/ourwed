/**
 * Separate semantic confidence from deterministic patch confidence.
 */

export type ConfidenceBreakdown = {
  semanticConfidence: number
  spanConfidence: number
  bindingConfidence: number
  patchConfidence: number
  reasons: string[]
}

export function computePatchConfidence(input: {
  semanticConfidence: number
  exactValueSpanResolved: boolean
  sourceSpanIsValueOnly: boolean
  uniqueInsideAnchor: boolean
  canonicalBindingExists: boolean
  contextAgreement: boolean
  isLegalReference: boolean
  isDefinedTerm: boolean
  typedSpanStrategy?: string | null
}): ConfidenceBreakdown {
  const reasons: string[] = []
  let spanConfidence = 0
  if (input.exactValueSpanResolved) {
    spanConfidence = 0.7
    reasons.push('exact value span')
    if (input.sourceSpanIsValueOnly) {
      spanConfidence += 0.2
      reasons.push('value-only patch')
    }
    if (input.typedSpanStrategy?.startsWith('typed_')) {
      spanConfidence = Math.max(spanConfidence, 0.95)
      reasons.push(`typed strategy: ${input.typedSpanStrategy}`)
    }
    if (input.typedSpanStrategy === 'exact_literal') {
      spanConfidence = 1
    }
  }

  let bindingConfidence = 0
  if (input.canonicalBindingExists) {
    bindingConfidence = 0.95
    reasons.push('canonical binding exists')
  }
  if (input.contextAgreement) {
    bindingConfidence = Math.min(1, bindingConfidence + 0.05)
    reasons.push('context agreement')
  }

  const valueTypeSafety =
    input.sourceSpanIsValueOnly && !input.isLegalReference && !input.isDefinedTerm
      ? 1
      : 0
  if (valueTypeSafety === 1) reasons.push('value type safe')
  if (input.uniqueInsideAnchor) reasons.push('unique inside anchor')

  if (input.isLegalReference || input.isDefinedTerm) {
    return {
      semanticConfidence: input.semanticConfidence,
      spanConfidence,
      bindingConfidence,
      patchConfidence: 0,
      reasons: [
        ...reasons,
        input.isDefinedTerm ? 'defined term' : 'legal reference',
      ],
    }
  }

  // Safe deterministic patch: perfect score when all gates pass
  if (
    input.exactValueSpanResolved &&
    input.sourceSpanIsValueOnly &&
    input.canonicalBindingExists &&
    input.uniqueInsideAnchor &&
    !input.isLegalReference &&
    !input.isDefinedTerm
  ) {
    return {
      semanticConfidence: input.semanticConfidence,
      spanConfidence: Math.min(1, Math.max(spanConfidence, 1)),
      bindingConfidence: Math.min(1, Math.max(bindingConfidence, 1)),
      patchConfidence: 1,
      reasons: [...reasons, 'deterministic safe patch'],
    }
  }

  const uniqueness = input.uniqueInsideAnchor ? 1 : 0.7
  const patchConfidence = Math.min(
    1,
    spanConfidence * 0.4 +
      bindingConfidence * 0.3 +
      valueTypeSafety * 0.2 +
      uniqueness * 0.1,
  )

  return {
    semanticConfidence: input.semanticConfidence,
    spanConfidence: Math.min(1, spanConfidence),
    bindingConfidence: Math.min(1, bindingConfidence),
    patchConfidence: Math.round(patchConfidence * 1000) / 1000,
    reasons,
  }
}

/**
 * Status from separate semantic + patch confidences.
 */
export function decideStatusFromConfidence(input: {
  semanticConfidence: number
  patchConfidence: number
  exactValueSpanResolved: boolean
  valuesDiffer: boolean
  isDerived: boolean
  ambiguous: boolean
  ignored: boolean
}): 'REPLACEMENT' | 'DERIVED' | 'REVIEW' | 'UNCHANGED' | 'AMBIGUOUS' | 'IGNORED' {
  if (input.ignored) return 'IGNORED'
  if (input.ambiguous) return 'AMBIGUOUS'
  if (!input.valuesDiffer) return 'UNCHANGED'
  if (!input.exactValueSpanResolved) return 'REVIEW'

  const auto =
    input.semanticConfidence >= 0.8 &&
    input.patchConfidence >= 0.95 &&
    input.exactValueSpanResolved

  if (auto) return input.isDerived ? 'DERIVED' : 'REPLACEMENT'
  if (input.patchConfidence >= 0.7) return 'REVIEW'
  return 'REVIEW'
}
