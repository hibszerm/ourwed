/**
 * Post-reconstruction completeness verification.
 */

import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { textContainsNormalized, normalizeForMatch } from './normalize'
import type {
  DocumentQualityReport,
  QualityIssue,
  TransformationExpectationManifest,
} from './types'

function joinedText(blocks: Array<{ text: string }>): string {
  return blocks.map((b) => b.text).join('\n')
}

function fieldAppears(
  text: string,
  values: string[],
): boolean {
  return values.some((v) => v && textContainsNormalized(text, v))
}

/** Location stale check: also match distinctive place tokens / light inflection. */
function sourceValueRemains(text: string, sourceValue: string): boolean {
  if (textContainsNormalized(text, sourceValue) || text.includes(sourceValue)) {
    return true
  }
  const tokens = sourceValue
    .split(/[\s,/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 5 && !/^(hotel|palac|kosciol|bazylika|ulica)$/i.test(normalizeForMatch(t)))
  for (const token of tokens) {
    if (text.includes(token)) return true
    const stem = token.replace(/(?:u|em|owi|ie|ią|ę|ą|a|y)$/i, '')
    if (stem.length >= 4) {
      const re = new RegExp(`\\b${stem}[a-ząćęłńóśźż]{0,3}\\b`, 'i')
      if (re.test(text)) return true
    }
  }
  return false
}

export function verifyTransformationCompleteness(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  manifest: TransformationExpectationManifest
}): {
  issues: QualityIssue[]
  summary: DocumentQualityReport['completeness']
} {
  const issues: QualityIssue[] = []
  const transformedText = joinedText(input.transformedBlocks)
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b.text]))

  const missingFields: string[] = []
  const staleSourceValues: string[] = []
  const partialApplications: string[] = []
  const mixedSourceTargetFields: string[] = []
  let satisfied = 0

  // A. Stale source values that must disappear
  for (const src of input.manifest.sourceSpecificValues) {
    if (!src.mustDisappear) continue
    if (!sourceValueRemains(transformedText, src.sourceValue)) continue
    // Ignore if source value is also a protected provider value
    const isProtected = input.manifest.protectedFields.some((p) =>
      p.sourceValues.some((v) => textContainsNormalized(v, src.sourceValue)),
    )
    if (isProtected) continue

    const stillInBlocks = src.sourceBlockIds.filter((id) => {
      const t = byId.get(id)
      return t ? sourceValueRemains(t, src.sourceValue) : false
    })
    staleSourceValues.push(src.canonicalField)
    issues.push({
      code: 'stale_source_value_remaining',
      severity: 'blocking',
      canonicalField: src.canonicalField,
      blockId: stillInBlocks[0] ?? src.sourceBlockIds[0],
      safeDescription: `Old ${src.canonicalField} value remains after transformation`,
    })
  }

  // B/C. Expected values + partial application
  for (const req of input.manifest.requiredFields) {
    if (req.requirement === 'optional_if_template_has_no_slot') {
      const hasSlot =
        req.expectedContexts?.some((c) => c.blockIds.length > 0) ??
        req.sourceValues.length > 0
      if (!hasSlot) {
        satisfied += 1
        continue
      }
    }

    const appears = fieldAppears(transformedText, req.expectedValues)
    if (!appears && req.expectedValues.length > 0) {
      missingFields.push(req.canonicalField)
      issues.push({
        code: 'expected_dataset_value_missing',
        severity: 'blocking',
        canonicalField: req.canonicalField,
        safeDescription: `Expected ${req.canonicalField} is missing from the transformed document`,
      })
      continue
    }

    // Partial: source contexts still contain old value while some have new
    if (req.sourceValues.length > 0 && req.expectedValues.length > 0) {
      const contextIds = [
        ...new Set(
          (req.expectedContexts ?? []).flatMap((c) => c.blockIds).concat(
            input.manifest.requiredReplacements.find(
              (r) => r.canonicalField === req.canonicalField,
            )?.requiredContextBlockIds ?? [],
          ),
        ),
      ]
      if (contextIds.length >= 2) {
        let withNew = 0
        let withOld = 0
        for (const id of contextIds) {
          const t = byId.get(id)
          if (!t) continue
          if (fieldAppears(t, req.expectedValues)) withNew += 1
          if (req.sourceValues.some((v) => sourceValueRemains(t, v))) withOld += 1
        }
        if (withNew > 0 && withOld > 0) {
          partialApplications.push(req.canonicalField)
          issues.push({
            code: 'partial_field_application',
            severity: 'blocking',
            canonicalField: req.canonicalField,
            safeDescription: `${req.canonicalField} updated in some contexts but not all required ones`,
          })
        }
      }
    }

    if (appears) satisfied += 1
  }

  // D. Mixed source and target for same field
  for (const req of input.manifest.requiredFields) {
    if (req.sourceValues.length === 0 || req.expectedValues.length === 0) continue
    const hasOld = req.sourceValues.some((v) => sourceValueRemains(transformedText, v))
    const hasNew = fieldAppears(transformedText, req.expectedValues)
    if (hasOld && hasNew) {
      mixedSourceTargetFields.push(req.canonicalField)
      if (
        !issues.some(
          (i) =>
            i.canonicalField === req.canonicalField &&
            (i.code === 'mixed_source_and_target_values' ||
              i.code === 'stale_source_value_remaining' ||
              i.code === 'partial_field_application'),
        )
      ) {
        issues.push({
          code: 'mixed_source_and_target_values',
          severity: 'blocking',
          canonicalField: req.canonicalField,
          safeDescription: `Document mixes old and new values for ${req.canonicalField}`,
        })
      }
    }
  }

  const status =
    issues.some((i) => i.severity === 'blocking')
      ? 'fail'
      : issues.some((i) => i.severity === 'review_required')
        ? 'review_required'
        : 'pass'

  return {
    issues,
    summary: {
      status,
      requiredFieldCount: input.manifest.requiredFields.length,
      satisfiedFieldCount: satisfied,
      missingFields: [...new Set(missingFields)],
      staleSourceValues: [...new Set(staleSourceValues)],
      partialApplications: [...new Set(partialApplications)],
      mixedSourceTargetFields: [...new Set(mixedSourceTargetFields)],
    },
  }
}
