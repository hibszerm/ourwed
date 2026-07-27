/**
 * Reference-number and location grammar consistency helpers.
 */

import { hasPossibleLocationGrammarIssue } from '../locationInsertionPolicy'
import type { TransformDocumentBlock, TransformedBlock } from '../types'
import { sanitizeDuplicatedLocationWrappers, textContainsNormalized } from './normalize'
import type { QualityIssue, TransformationExpectationManifest } from './types'
import {
  locationFromDatasetEntry,
  renderLocationSummary,
} from './locationRendering'
import type { ContractTransformationDataset } from '../types'

export function verifyReferenceNumberConsistency(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  weddingYear?: string
  executionYear?: string
  explicitNewReference?: string
}): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (input.explicitNewReference) return issues

  const text = input.transformedBlocks.map((b) => b.text).join('\n')
  const targetYear = input.executionYear ?? input.weddingYear
  if (!targetYear) return issues

  // Prefer years that appear inside reference-like tokens (nr … 2024/…)
  const refYearMatches = [
    ...text.matchAll(
      /(?:nr|ref|sygn\.?|umow[ay])[^\n]{0,40}?\b(20\d{2})\b/gi,
    ),
    ...text.matchAll(/\b(20\d{2})\/\d+/g),
  ]
  const refYears = [...new Set(refYearMatches.map((m) => m[1]!))]
  const conflicting = refYears.filter((y) => y !== targetYear)
  if (conflicting.length === 0) return issues

  const sourceHadRef = input.sourceBlocks.some(
    (b) =>
      /\b(nr|ref|sygn)\b/i.test(b.text) || /\b20\d{2}\/\d+/i.test(b.text),
  )
  if (sourceHadRef || conflicting.length > 0) {
    issues.push({
      code: 'reference_year_mismatch',
      severity: 'review_required',
      canonicalField: 'contract.referenceNumber',
      safeDescription:
        'Reference number year may conflict with the new contract/event year',
    })
  }
  return issues
}

export function verifyLocationConsistency(input: {
  dataset: ContractTransformationDataset
  transformedBlocks: TransformedBlock[]
  manifest: TransformationExpectationManifest
}): {
  issues: QualityIssue[]
  summary: {
    status: 'pass' | 'review_required' | 'fail'
    suppliedRoles: string[]
    representedRoles: string[]
    missingRoles: string[]
    staleLocations: string[]
    grammarIssues: string[]
  }
} {
  const issues: QualityIssue[] = []
  const text = input.transformedBlocks.map((b) => b.text).join('\n')
  const suppliedRoles: string[] = []
  const representedRoles: string[] = []
  const missingRoles: string[] = []
  const staleLocations: string[] = []
  const grammarIssues: string[] = []

  const roles = [
    ['preparation', input.dataset.locations.preparation],
    ['ceremony', input.dataset.locations.ceremony],
    ['reception', input.dataset.locations.reception],
  ] as const

  for (const [role, loc] of roles) {
    if (!loc) continue
    suppliedRoles.push(role)
    const value = locationFromDatasetEntry(loc)
    const rendered = value ? renderLocationSummary(value) : ''
    const candidates = [
      rendered,
      loc.displayName,
      loc.fullAddress,
      loc.city,
    ].filter(Boolean) as string[]
    const represented = candidates.some((c) => textContainsNormalized(text, c))
    if (represented) representedRoles.push(role)
    else {
      missingRoles.push(role)
      const hasSlot = input.manifest.requiredFields.some(
        (f) =>
          f.canonicalField ===
            (role === 'preparation'
              ? 'wedding.preparationLocation'
              : role === 'ceremony'
                ? 'wedding.ceremonyLocation'
                : 'wedding.receptionLocation') &&
          (f.expectedContexts?.some((c) => c.blockIds.length > 0) ?? false),
      )
      issues.push({
        code: hasSlot
          ? 'expected_dataset_value_missing'
          : 'location_role_not_represented_in_template',
        severity: hasSlot ? 'blocking' : 'review_required',
        canonicalField:
          role === 'preparation'
            ? 'wedding.preparationLocation'
            : role === 'ceremony'
              ? 'wedding.ceremonyLocation'
              : 'wedding.receptionLocation',
        safeDescription: hasSlot
          ? `Supplied ${role} location is missing from the transformed document`
          : `Supplied ${role} location has no matching template slot`,
      })
    }
  }

  for (const src of input.manifest.sourceSpecificValues) {
    if (!src.canonicalField.includes('Location')) continue
    if (textContainsNormalized(text, src.sourceValue)) {
      staleLocations.push(src.sourceValue.slice(0, 40))
    }
  }

  for (const b of input.transformedBlocks) {
    if (hasPossibleLocationGrammarIssue(b.text)) {
      grammarIssues.push(b.blockId)
      issues.push({
        code: 'possible_location_grammar_issue',
        severity: 'review_required',
        blockId: b.blockId,
        safeDescription: 'Possible location grammar issue (heuristic)',
      })
    }
    if (
      /pod\s+adresem:\s*pod\s+adresem/i.test(b.text) ||
      /przy\s+ul\.\s*ul\./i.test(b.text)
    ) {
      issues.push({
        code: 'duplicated_location_wrapper',
        severity: 'warning',
        blockId: b.blockId,
        safeDescription: 'Duplicated location wrapper detected',
      })
    }
    void sanitizeDuplicatedLocationWrappers
  }

  const status = issues.some((i) => i.severity === 'blocking')
    ? 'fail'
    : issues.some((i) => i.severity === 'review_required')
      ? 'review_required'
      : 'pass'

  return {
    issues,
    summary: {
      status,
      suppliedRoles,
      representedRoles,
      missingRoles,
      staleLocations,
      grammarIssues,
    },
  }
}
