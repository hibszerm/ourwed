/**
 * CG7.2 — grounded event-location field discovery + scoped stale gate.
 *
 * Structural field identity (table label / clause role) is separate from
 * source value content (sentinel vs filled address). No giant synonym router.
 */

import type {
  ContractTransformationDataset,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import {
  locationFromDatasetEntry,
  renderLocationSummary,
} from './locationRendering'
import { normalizeForMatch, textContainsNormalized } from './normalize'
import type { CanonicalTransformField, QualityIssue } from './types'

export type LocationSemanticRole =
  | 'preparation'
  | 'preparation_partner1'
  | 'preparation_partner2'
  | 'ceremony'
  | 'reception'
  | 'unknown'

export type SourceLocationEvidence = {
  blockId: string
  role: LocationSemanticRole
  sourceText: string
  /** True when source is blank/sentinel/form-fill prompt — not a real venue. */
  nonSemanticSurface: boolean
  representation: 'table_cell' | 'prose'
  rowLabelText?: string
  canonicalField: CanonicalTransformField
}

/** Non-semantic location surfaces (blank / form prompts / punctuation). */
export function isNonSemanticLocationSurface(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (/^[\s.\-_–—•·…*]{1,48}$/.test(t)) return true
  if (/^_{3,}$/.test(t) || /^\.{3,}$/.test(t) || /^…+$/.test(t)) return true
  // Short instructional / incomplete form prompts — class, not a single literal.
  if (
    t.length <= 48 &&
    (/uzupełn|wstaw|wpisz|podaj|brak danych|do uzup|uzupe[lł]nij|placeholder|\btbd\b/i.test(
      t,
    ) ||
      /^n\/?a$/i.test(t))
  ) {
    return true
  }
  return false
}

/**
 * Infer location role from structural context (row label / clause text).
 * Reuses the same role stems already used by clause-aware location QA.
 */
export function inferLocationRoleFromContext(text: string): LocationSemanticRole {
  const t = text.trim()
  if (!t) return 'unknown'
  // Stem matches: przygotowań / przygotowania / przygotowanie
  if (/przygotowa/i.test(t)) {
    if (/panny|partner\s*1|partnerki|narzeczonej|bride/i.test(t)) {
      return 'preparation_partner1'
    }
    if (/pana\s+młodego|partner\s*2|narzeczonego|groom/i.test(t)) {
      return 'preparation_partner2'
    }
    return 'preparation'
  }
  if (/ceremoni|zaślubin|kościół|urząd stanu/i.test(t)) return 'ceremony'
  if (
    /przyjęci|powitanie gości|miejsce przyjęcia|wesel|imprezy|bankiet/i.test(t)
  ) {
    return 'reception'
  }
  return 'unknown'
}

export function canonicalFieldForLocationRole(
  role: LocationSemanticRole,
): CanonicalTransformField {
  switch (role) {
    case 'preparation':
    case 'preparation_partner1':
    case 'preparation_partner2':
      return 'wedding.preparationLocation'
    case 'ceremony':
      return 'wedding.ceremonyLocation'
    case 'reception':
      return 'wedding.receptionLocation'
    default:
      return 'wedding.receptionLocation'
  }
}

export function discoverFilledLocationEvidence(
  blocks: TransformDocumentBlock[],
): SourceLocationEvidence[] {
  const out: SourceLocationEvidence[] = []

  for (const b of blocks) {
    const text = (b.text ?? '').trim()
    const fam = b.tableContext?.ownershipFamily
    const label = b.tableContext?.rowLabelText?.trim() ?? ''

    // Table value cells under wedding_location ownership
    if (fam === 'wedding_location' && b.kind === 'tableCell') {
      // Skip pure label cells
      if (label && text === label) continue
      if (b.tableContext?.cellIndex === 0 && text === label) continue

      const roleCtx = label || b.tableContext?.neighboringCellTexts?.join(' ') || text
      const role = inferLocationRoleFromContext(roleCtx)
      out.push({
        blockId: b.blockId,
        role,
        sourceText: text,
        nonSemanticSurface: isNonSemanticLocationSurface(text),
        representation: 'table_cell',
        rowLabelText: label || undefined,
        canonicalField: canonicalFieldForLocationRole(role),
      })
      continue
    }

    // Prose location clauses (not provider)
    if (b.kind === 'paragraph' && fam !== 'provider') {
      const role = inferLocationRoleFromContext(text)
      if (role === 'unknown') continue
      // Must look like a location *field assertion*, not a tangential mention
      // (e.g. "przygotowaniem stołu" is not an event-location slot).
      const assertsLocationSlot =
        /miejsce\s+(przygotowa|ceremoni|wesel|przyjęci)|odbędzie się|odbędą się|pod adresem|lokalizacj|ceremonia\s+odbędzie|przyjęcie\s+(weselne\s+)?odbędzie|przygotowania\s+odbęd/i.test(
          text,
        )
      if (!assertsLocationSlot) continue
      out.push({
        blockId: b.blockId,
        role,
        sourceText: text,
        nonSemanticSurface: isNonSemanticLocationSurface(text),
        representation: 'prose',
        canonicalField: canonicalFieldForLocationRole(role),
      })
    }
  }

  return out
}

function targetForRole(
  dataset: ContractTransformationDataset,
  role: LocationSemanticRole,
): string[] {
  const locs = dataset.locations
  if (role === 'preparation' || role === 'preparation_partner1' || role === 'preparation_partner2') {
    const entries = locs.preparationLocations ?? []
    if (role === 'preparation_partner1') {
      const e = entries.find((x) => x.person === 'bride')
      return e?.fullAddress ? [e.fullAddress] : []
    }
    if (role === 'preparation_partner2') {
      const e = entries.find((x) => x.person === 'groom')
      return e?.fullAddress ? [e.fullAddress] : []
    }
    const targets = [
      locs.preparationDisplayText ?? '',
      ...entries.map((e) => e.fullAddress),
    ]
    const prep = locationFromDatasetEntry(locs.preparation)
    if (prep) targets.push(renderLocationSummary(prep))
    return [...new Set(targets.filter(Boolean))]
  }
  if (role === 'ceremony') {
    const c = locationFromDatasetEntry(locs.ceremony)
    return c
      ? [renderLocationSummary(c), c.fullAddress ?? '', c.displayName ?? ''].filter(Boolean)
      : []
  }
  if (role === 'reception') {
    const r = locationFromDatasetEntry(locs.reception)
    return r
      ? [renderLocationSummary(r), r.fullAddress ?? '', r.displayName ?? ''].filter(Boolean)
      : []
  }
  return []
}

function roleIsAbsentInCrm(
  dataset: ContractTransformationDataset,
  role: LocationSemanticRole,
): boolean {
  if (role === 'ceremony') {
    return !dataset.locations.ceremony
  }
  if (
    role === 'preparation' ||
    role === 'preparation_partner1' ||
    role === 'preparation_partner2'
  ) {
    const entries = dataset.locations.preparationLocations ?? []
    return entries.length === 0 && !dataset.locations.preparation
  }
  if (role === 'reception') {
    return !dataset.locations.reception
  }
  return true
}

/**
 * Scoped location identity gate — only grounded evidence blocks.
 */
export function verifyFilledLocationIdentity(input: {
  evidence: SourceLocationEvidence[]
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
}): QualityIssue[] {
  const issues: QualityIssue[] = []
  if (input.evidence.length === 0) return issues
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b]))

  for (const ev of input.evidence) {
    const block = byId.get(ev.blockId)
    if (!block) {
      issues.push({
        code: 'location_identity_block_missing',
        severity: 'blocking',
        canonicalField: ev.canonicalField,
        blockId: ev.blockId,
        safeDescription: 'Identified location field block missing after transform',
      })
      continue
    }

    const targets = targetForRole(input.dataset, ev.role)
    const absent = roleIsAbsentInCrm(input.dataset, ev.role)

    if (targets.length > 0) {
      const hasCanonical = targets.some((t) => textContainsNormalized(block.text, t))
      if (!hasCanonical) {
        issues.push({
          code: 'location_identity_canonical_missing',
          severity: 'blocking',
          canonicalField: ev.canonicalField,
          blockId: ev.blockId,
          safeDescription:
            'Identified location field does not contain canonical wedding location',
        })
      }

      // Stale filled source (not sentinel) must leave this grounded block
      if (
        !ev.nonSemanticSurface &&
        ev.sourceText.trim().length >= 4 &&
        !targets.some(
          (t) =>
            normalizeForMatch(ev.sourceText).includes(normalizeForMatch(t)) ||
            normalizeForMatch(t).includes(normalizeForMatch(ev.sourceText)),
        ) &&
        block.text.includes(ev.sourceText)
      ) {
        issues.push({
          code: 'stale_location_identity_remaining',
          severity: 'blocking',
          canonicalField: ev.canonicalField,
          blockId: ev.blockId,
          safeDescription:
            'Stale source event-location remains in identified location field',
        })
      }

      // Sentinel must not survive when we have canonical truth
      if (ev.nonSemanticSurface && isNonSemanticLocationSurface(block.text)) {
        issues.push({
          code: 'location_sentinel_unresolved',
          severity: 'blocking',
          canonicalField: ev.canonicalField,
          blockId: ev.blockId,
          safeDescription:
            'Location field still contains a non-semantic sentinel despite canonical CRM location',
        })
      }
    } else if (absent) {
      // CRM missing: do not invent. Sentinel may remain OR be cleared.
      // Filled old venue in grounded field must be neutralized (not left as old wedding).
      if (!ev.nonSemanticSurface && ev.sourceText.trim().length >= 4) {
        if (block.text.includes(ev.sourceText)) {
          issues.push({
            code: 'stale_location_identity_remaining',
            severity: 'blocking',
            canonicalField: ev.canonicalField,
            blockId: ev.blockId,
            safeDescription:
              'Old filled event-location remains in identified field while CRM location is absent — neutralize without inventing',
          })
        }
      }
      // Sentinel + absent CRM → OK (no Mode A block)
    }
  }

  return issues
}

/** Calendar-day equality for wedding.date vs bare table dates. */
export function weddingDatesSemanticallyEqual(a: string, b: string): boolean {
  const parse = (s: string): string | null => {
    const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (!m) return null
    const d = m[1]!.padStart(2, '0')
    const mo = m[2]!.padStart(2, '0')
    let y = m[3]!
    if (y.length === 2) y = `20${y}`
    return `${y}-${mo}-${d}`
  }
  const pa = parse(a)
  const pb = parse(b)
  return Boolean(pa && pb && pa === pb)
}
