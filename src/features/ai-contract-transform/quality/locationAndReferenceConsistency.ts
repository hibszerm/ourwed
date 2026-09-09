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
import { hasDuplicatedPostalCity } from '@/lib/utils/formatPolishPostalAddress'

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

  const prepEntries = input.dataset.locations.preparationLocations ?? []
  if (prepEntries.length >= 2) {
    for (const entry of prepEntries) {
      if (!textContainsNormalized(text, entry.fullAddress)) {
        missingRoles.push(`preparation:${entry.person}`)
        issues.push({
          code: 'expected_dataset_value_missing',
          severity: 'blocking',
          canonicalField: 'wedding.preparationLocation',
          safeDescription: `${entry.label} address is missing from the transformed document`,
        })
      } else {
        representedRoles.push(`preparation:${entry.person}`)
      }
    }
  }

  // A5: absent optional roles must not inherit another role's venue (role-fact invention).
  issues.push(
    ...detectInventedVenuesForAbsentRoles({
      dataset: input.dataset,
      transformedBlocks: input.transformedBlocks,
    }),
  )

  if (
    input.dataset.clients.address &&
    hasDuplicatedPostalCity(input.dataset.clients.address)
  ) {
    issues.push({
      code: 'duplicated_location_wrapper',
      severity: 'blocking',
      canonicalField: 'customer.address',
      safeDescription:
        'Customer address contains duplicated postal code / city',
    })
  }
  if (hasDuplicatedPostalCity(text)) {
    issues.push({
      code: 'duplicated_location_wrapper',
      severity: 'review_required',
      canonicalField: 'customer.address',
      safeDescription:
        'Transformed document may contain duplicated postal code / city',
    })
  }

  for (const src of input.manifest.sourceSpecificValues) {
    if (!src.canonicalField.includes('Location')) continue
    if (textContainsNormalized(text, src.sourceValue)) {
      staleLocations.push(src.sourceValue.slice(0, 40))
      // A5: remaining template venue is a client-data integrity defect
      issues.push({
        code: 'stale_source_value_remaining',
        severity: 'blocking',
        canonicalField: src.canonicalField,
        safeDescription: `Template example location still present for ${src.canonicalField}`,
      })
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

const ROLE_CLAUSE_PATTERNS = {
  ceremony: /ceremoni|zaślubin|zaślubin|kościół|urząd stanu/i,
  preparation: /przygotowan/i,
  reception: /przyjęci|powitanie gości|miejsce przyjęcia|weseln/i,
} as const

function locationVenueCandidates(loc: {
  displayName?: string
  fullAddress?: string
  city?: string
} | null | undefined): string[] {
  if (!loc) return []
  const value = locationFromDatasetEntry(loc)
  const rendered = value ? renderLocationSummary(value) : ''
  return [rendered, loc.displayName, loc.fullAddress, loc.city].filter(
    (v): v is string => Boolean(v && v.trim().length >= 3),
  )
}

/**
 * True when a clause asserts `venue` specifically for the given wedding day role.
 * Clause-aware (split on ; / newlines) so multi-role paragraphs are handled
 * without treating a neighboring reception sentence as a ceremony assertion.
 */
export function clauseAssertsRoleVenue(
  text: string,
  role: keyof typeof ROLE_CLAUSE_PATTERNS,
  venue: string,
): boolean {
  if (!venue.trim()) return false
  const roleRe = ROLE_CLAUSE_PATTERNS[role]
  const clauses = text
    .split(/[;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean)
  for (const clause of clauses) {
    if (!roleRe.test(clause)) continue
    if (textContainsNormalized(clause, venue)) return true
  }
  return false
}

/**
 * Detects Full-AI inventing a venue for an absent optional role by copying
 * another supplied role's venue (typically reception → ceremony/prep).
 */
export function detectInventedVenuesForAbsentRoles(input: {
  dataset: ContractTransformationDataset
  transformedBlocks: TransformedBlock[]
}): QualityIssue[] {
  const issues: QualityIssue[] = []
  const text = input.transformedBlocks.map((b) => b.text).join('\n')
  const locs = input.dataset.locations

  const ceremonyAbsent =
    !locs.ceremony &&
    (locs.absentLocationRoles?.includes('ceremony') ?? true)
  const preparationAbsent =
    !locs.preparation &&
    !(locs.preparationLocations && locs.preparationLocations.length > 0) &&
    (locs.absentLocationRoles?.includes('preparation') ?? true)

  const donorVenues: Array<{ role: string; venue: string }> = []
  for (const v of locationVenueCandidates(locs.reception)) {
    donorVenues.push({ role: 'reception', venue: v })
  }
  if (!ceremonyAbsent) {
    for (const v of locationVenueCandidates(locs.ceremony)) {
      donorVenues.push({ role: 'ceremony', venue: v })
    }
  }
  if (!preparationAbsent) {
    for (const v of locationVenueCandidates(locs.preparation)) {
      donorVenues.push({ role: 'preparation', venue: v })
    }
    for (const e of locs.preparationLocations ?? []) {
      if (e.fullAddress?.trim()) {
        donorVenues.push({ role: `preparation:${e.person}`, venue: e.fullAddress })
      }
    }
  }

  const checkAbsent = (
    absentRole: 'ceremony' | 'preparation',
    canonicalField: 'wedding.ceremonyLocation' | 'wedding.preparationLocation',
  ) => {
    for (const donor of donorVenues) {
      if (donor.role === absentRole || donor.role.startsWith(`${absentRole}:`))
        continue
      // Only flag when the donor venue is asserted inside the ABSENT role's clause.
      if (!clauseAssertsRoleVenue(text, absentRole, donor.venue)) continue
      // If the absent role is ceremony and donor is reception, classic invention.
      issues.push({
        code: 'invented_location_for_absent_role',
        severity: 'blocking',
        canonicalField,
        safeDescription: `Document asserts ${absentRole} venue using ${donor.role} data, but ${absentRole} is absent in CRM`,
      })
      return
    }
  }

  if (ceremonyAbsent) checkAbsent('ceremony', 'wedding.ceremonyLocation')
  if (preparationAbsent) checkAbsent('preparation', 'wedding.preparationLocation')

  return issues
}
