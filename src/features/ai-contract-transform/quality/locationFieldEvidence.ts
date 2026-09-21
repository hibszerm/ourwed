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
 *
 * Unknown vocabulary is NOT solved by growing this list — form-line clusters
 * under a locations section use structural positional assignment instead.
 */
export function inferLocationRoleFromContext(text: string): LocationSemanticRole {
  const t = text.trim()
  if (!t) return 'unknown'
  if (/przygotowa/i.test(t)) {
    if (/panny|partner\s*1|partnerki|narzeczonej|bride/i.test(t)) {
      return 'preparation_partner1'
    }
    if (/pana\s+młodego|partner\s*2|narzeczonego|groom/i.test(t)) {
      return 'preparation_partner2'
    }
    return 'preparation'
  }
  const hasCeremony = /ceremoni|zaślubin|kościół|urząd stanu|uroczystoś/i.test(t)
  const hasReception =
    /przyjęci|powitanie gości|miejsce przyjęcia|wesel|imprezy|bankiet/i.test(t)
  // Combined ceremony+reception fields are not a single fillable role.
  if (hasCeremony && hasReception) return 'unknown'
  if (hasCeremony) return 'ceremony'
  if (hasReception) return 'reception'
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

/** Structural locations-section heading (not a field-label synonym dictionary). */
export function isLocationsSectionHeading(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 48) return false
  return /^(lokalizacj|miejsca|miejsce\s+uroczyst)/i.test(t)
}

/** Form-like "label: value" location field (grammar-free structured surface). */
export function parseLocationFormLine(
  text: string,
): { label: string; value: string } | null {
  const m = text.trim().match(/^([^:\n]{2,80}):\s*(.*)$/)
  if (!m) return null
  const label = m[1]!.trim()
  const value = (m[2] ?? '').trim()
  if (!/miejsce|sala\b|adres\b|lokalizacj/i.test(label)) return null
  return { label, value }
}

function isLocationFormOrSlotAssertion(text: string): boolean {
  if (parseLocationFormLine(text)) return true
  const t = text.trim()
  if (inferLocationRoleFromContext(t) === 'unknown') return false

  // A role mention alone is not location evidence. Admit prose only when the
  // same sentence structurally assigns the event to a place. Role semantics
  // remain centralized in inferLocationRoleFromContext.
  const assignment =
    t.match(
      /\b(?:odbędzie|odbędą)\s+się\s+(?:pod\s+adresem\s+|w\s+|we\s+|na\s+)([^.!?]+)/i,
    ) ??
    t.match(
      /\b(?:będzie|będą)\s+(?:miał|miała|miało|miały)\s+miejsce\s+(?:pod\s+adresem\s+|w\s+|we\s+|na\s+)([^.!?]+)/i,
    ) ??
    t.match(
      /\bzostanie\s+zorganizowan[aye]\s+(?:pod\s+adresem\s+|w\s+|we\s+|na\s+)([^.!?]+)/i,
    )

  const target = assignment?.[1]?.trim() ?? ''
  if (!target) return false
  // Temporal/scope complements are not venue assignments.
  return !/^(?:dniu|terminie|godzinie|czasie|ramach|trakcie)\b/i.test(target)
}

/**
 * Assign roles to form-line location fields in a section.
 * Known lexical roles win; remaining unknowns are filled structurally in order
 * preparation → ceremony → reception (no per-phrase synonym list).
 */
function assignRolesToFormCluster(
  items: Array<{ blockId: string; label: string; value: string; text: string }>,
): Array<{
  blockId: string
  role: LocationSemanticRole
  sourceText: string
  text: string
}> {
  const used = new Set<LocationSemanticRole>()
  const out: Array<{
    blockId: string
    role: LocationSemanticRole
    sourceText: string
    text: string
  }> = []
  const pending: typeof items = []

  for (const item of items) {
    const role = inferLocationRoleFromContext(item.label)
    // Generic "preparation" (no partner marker) is deferred so two prep fields
    // can be assigned partner1/partner2 structurally.
    if (role === 'preparation' || role === 'unknown') {
      pending.push(item)
    } else {
      used.add(role)
      out.push({
        blockId: item.blockId,
        role,
        sourceText: item.text,
        text: item.text,
      })
    }
  }

  const order: LocationSemanticRole[] = [
    'preparation',
    'ceremony',
    'reception',
  ]
  // When two+ pending items look like preparation (label has przygotowa) and no
  // partner roles used yet, assign partner1 then partner2 structurally.
  const prepPending = pending.filter((item) =>
    /przygotowa/i.test(item.label),
  )
  if (
    prepPending.length >= 2 &&
    !used.has('preparation_partner1') &&
    !used.has('preparation_partner2')
  ) {
    for (let i = 0; i < prepPending.length; i++) {
      const item = prepPending[i]!
      const role: LocationSemanticRole =
        i === 0
          ? 'preparation_partner1'
          : i === 1
            ? 'preparation_partner2'
            : 'preparation'
      used.add(role)
      out.push({
        blockId: item.blockId,
        role,
        sourceText: item.text,
        text: item.text,
      })
      const pIdx = pending.indexOf(item)
      if (pIdx >= 0) pending.splice(pIdx, 1)
    }
  }
  for (const item of pending) {
    const next = order.find((r) => !used.has(r)) ?? 'unknown'
    if (next !== 'unknown') used.add(next)
    out.push({
      blockId: item.blockId,
      role: next,
      sourceText: item.text,
      text: item.text,
    })
  }
  return out
}

function isPromptLikeLocationValue(value: string): boolean {
  return (
    isNonSemanticLocationSurface(value) ||
    /wskazan[yae]|do uzup|uzupełn|podadzą|podaje klient|zgodnie z danymi|przekazanymi|do ustalenia|do uzgodnienia|najpóźniej\s+\d+\s+dni/i.test(
      value,
    )
  )
}

export function discoverFilledLocationEvidence(
  blocks: TransformDocumentBlock[],
): SourceLocationEvidence[] {
  const out: SourceLocationEvidence[] = []
  const seen = new Set<string>()

  const push = (ev: SourceLocationEvidence) => {
    // Allow multiple semantic slots in one block (dual prep, etc.).
    const key = `${ev.blockId}::${ev.role}::${ev.sourceText.slice(0, 48)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(ev)
  }

  for (const b of blocks) {
    const text = (b.text ?? '').trim()
    const fam = b.tableContext?.ownershipFamily
    const label = b.tableContext?.rowLabelText?.trim() ?? ''

    if (fam === 'wedding_location' && b.kind === 'tableCell') {
      if (label && text === label) continue
      if (b.tableContext?.cellIndex === 0 && text === label) continue

      const roleCtx =
        label || b.tableContext?.neighboringCellTexts?.join(' ') || text
      const role = inferLocationRoleFromContext(roleCtx)
      push({
        blockId: b.blockId,
        role,
        sourceText: text,
        nonSemanticSurface: isNonSemanticLocationSurface(text),
        representation: 'table_cell',
        rowLabelText: label || undefined,
        canonicalField: canonicalFieldForLocationRole(role),
      })
    }
  }

  // Structural form-line clusters under a locations section heading.
  for (let i = 0; i < blocks.length; i++) {
    const heading = blocks[i]!
    if (heading.kind !== 'paragraph') continue
    if (!isLocationsSectionHeading(heading.text)) continue
    const cluster: Array<{
      blockId: string
      label: string
      value: string
      text: string
    }> = []
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j]!
      if (b.kind !== 'paragraph') break
      if (isLocationsSectionHeading(b.text)) break
      const trimmed = b.text.trim()
      if (
        /^[A-ZĄĆĘŁŃÓŚŹŻ][A-ZĄĆĘŁŃÓŚŹŻ\s]{2,40}$/.test(trimmed) &&
        trimmed.length < 40
      ) {
        break
      }
      const parsed = parseLocationFormLine(b.text)
      if (!parsed) {
        if (cluster.length > 0) break
        continue
      }
      cluster.push({
        blockId: b.blockId,
        label: parsed.label,
        value: parsed.value,
        text: trimmed,
      })
    }
    for (const item of assignRolesToFormCluster(cluster)) {
      const valuePart = parseLocationFormLine(item.text)?.value ?? item.text
      push({
        blockId: item.blockId,
        role: item.role,
        sourceText: item.text,
        nonSemanticSurface: isPromptLikeLocationValue(valuePart),
        representation: 'prose',
        canonicalField: canonicalFieldForLocationRole(item.role),
      })
    }
  }

  // Intra-paragraph multi-slot form segments (CG7.5 dual-prep prose).
  // Example: "Miejsce przygotowań A: … . Miejsce przygotowań B: … ."
  for (const b of blocks) {
    if (b.kind !== 'paragraph' || b.tableContext?.ownershipFamily === 'provider') {
      continue
    }
    const text = (b.text ?? '').trim()
    if (!text.includes(':')) continue
    const slots = extractIntraParagraphLocationSlots(text)
    if (slots.length < 2) continue
    for (const slot of slots) {
      if (slot.role === 'unknown') continue
      push({
        blockId: b.blockId,
        role: slot.role,
        sourceText: slot.sourceText,
        nonSemanticSurface: isPromptLikeLocationValue(slot.value),
        representation: 'prose',
        canonicalField: canonicalFieldForLocationRole(slot.role),
      })
    }
  }

  // Standalone form lines / tight prose slots (not already captured)
  for (const b of blocks) {
    if (b.kind !== 'paragraph' || b.tableContext?.ownershipFamily === 'provider') {
      continue
    }
    const text = (b.text ?? '').trim()
    if (!isLocationFormOrSlotAssertion(text)) continue
    // Prefer multi-slot extraction when a single form line isn't the whole block
    const slots = extractIntraParagraphLocationSlots(text)
    if (slots.length >= 2) continue
    const form = parseLocationFormLine(text)
    const role = inferLocationRoleFromContext(form?.label ?? text)
    if (role === 'unknown') continue
    const valuePart = form?.value ?? text
    push({
      blockId: b.blockId,
      role,
      sourceText: text,
      nonSemanticSurface: isPromptLikeLocationValue(valuePart),
      representation: 'prose',
      canonicalField: canonicalFieldForLocationRole(role),
    })
  }

  return out
}

/**
 * Split a prose paragraph into label:value location slots without a synonym list.
 * Role comes from existing inferLocationRoleFromContext on each label.
 * Values may contain "ul." / abbreviations — boundaries are next location labels.
 */
export function extractIntraParagraphLocationSlots(text: string): Array<{
  label: string
  value: string
  sourceText: string
  role: LocationSemanticRole
}> {
  const out: Array<{
    label: string
    value: string
    sourceText: string
    role: LocationSemanticRole
  }> = []
  // Split on ". " / start before a location-ish label ending with ":"
  const parts = text.split(/(?<=\.)\s+(?=(?:\d+\.\s*)?(?:Miejsce|Przygotowania|Ceremonia|Przyjęcie)\b)/i)
  for (const part of parts) {
    const m = part.trim().match(/^(?:\d+\.\s*)?([^:\n]{3,90}?):\s*(.+)$/s)
    if (!m) continue
    const label = m[1]!.trim()
    let value = m[2]!.trim().replace(/\.\s*$/, '').trim()
    if (
      !/miejsce|sala\b|adres\b|lokalizacj|przygotowa|ceremoni|wesel|przyjęci|uroczyst/i.test(
        label,
      )
    ) {
      continue
    }
    if (!value) continue
    const role = inferLocationRoleFromContext(label)
    out.push({
      label,
      value,
      sourceText: `${label}: ${value}`,
      role,
    })
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
  if (role === 'reception') {
    return !dataset.locations.reception
  }
  const entries = dataset.locations.preparationLocations ?? []
  if (role === 'preparation_partner1') {
    return !entries.some((e) => e.person === 'bride' && e.fullAddress) &&
      !dataset.locations.preparation
  }
  if (role === 'preparation_partner2') {
    return !entries.some((e) => e.person === 'groom' && e.fullAddress) &&
      !dataset.locations.preparation
  }
  if (role === 'preparation') {
    return entries.length === 0 && !dataset.locations.preparation
  }
  return true
}

/** Replace label:value slots in-place for multi-slot location paragraphs. */
export function applyIntraParagraphLocationTargets(
  text: string,
  replacements: Array<{ label: string; target: string }>,
): string {
  let next = text
  for (const rep of replacements) {
    const label = rep.label.trim()
    if (!label || !rep.target) continue
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Value runs until ". Miejsce|Przygotowania|..." or end — allows "ul." inside.
    const re = new RegExp(
      `(${escaped}):\\s*(.+?)(?=\\.\\s+(?:\\d+\\.\\s*)?(?:Miejsce|Przygotowania|Ceremonia|Przyjęcie)\\b|$)`,
      'is',
    )
    if (!re.test(next)) continue
    next = next.replace(re, (_full, lab: string, oldVal: string) => {
      const trailing = /\.\s*$/.test(oldVal) ? '.' : ''
      return `${lab}: ${rep.target}${trailing}`
    })
  }
  return next
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

    // Multi-slot prose: validate the matching label:value segment when present.
    const slots = extractIntraParagraphLocationSlots(block.text)
    const matchingSlot =
      slots.length >= 2
        ? slots.find((s) => s.role === ev.role) ??
          slots.find((s) =>
            normalizeForMatch(s.label).includes(
              normalizeForMatch(ev.sourceText.split(':')[0] ?? ''),
            ),
          )
        : null
    const surfaceText = matchingSlot
      ? `${matchingSlot.label}: ${matchingSlot.value}`
      : block.text

    if (targets.length > 0) {
      const hasCanonical = targets.some((t) =>
        textContainsNormalized(surfaceText, t),
      )
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

      // Cross-role swap: partner1/partner2 addresses must not land in the wrong slot
      if (
        matchingSlot &&
        (ev.role === 'preparation_partner1' ||
          ev.role === 'preparation_partner2')
      ) {
        const otherRole =
          ev.role === 'preparation_partner1'
            ? 'preparation_partner2'
            : 'preparation_partner1'
        const otherTargets = targetForRole(input.dataset, otherRole)
        const ownHit = targets.some((t) =>
          textContainsNormalized(matchingSlot.value, t),
        )
        const otherHit = otherTargets.some((t) =>
          textContainsNormalized(matchingSlot.value, t),
        )
        if (otherHit && !ownHit) {
          issues.push({
            code: 'location_role_swap',
            severity: 'blocking',
            canonicalField: ev.canonicalField,
            blockId: ev.blockId,
            safeDescription:
              'Preparation partner address appears in the wrong dual-prep slot',
          })
        }
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
        (matchingSlot
          ? matchingSlot.value.includes(
              ev.sourceText.split(':').slice(1).join(':').trim(),
            ) || surfaceText.includes(ev.sourceText)
          : block.text.includes(ev.sourceText))
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
      if (ev.nonSemanticSurface) {
        const val = matchingSlot ? matchingSlot.value : block.text
        if (
          isNonSemanticLocationSurface(val) ||
          isPromptLikeLocationValue(val)
        ) {
          issues.push({
            code: 'location_sentinel_unresolved',
            severity: 'blocking',
            canonicalField: ev.canonicalField,
            blockId: ev.blockId,
            safeDescription:
              'Location field still contains a non-semantic sentinel despite canonical CRM location',
          })
        }
      }
    } else if (absent) {
      // CRM missing: do not invent. Sentinel may remain OR be cleared.
      // Filled old venue in grounded field must be neutralized (not left as old wedding).
      if (!ev.nonSemanticSurface && ev.sourceText.trim().length >= 4) {
        if (
          matchingSlot
            ? matchingSlot.value.includes(
                ev.sourceText.split(':').slice(1).join(':').trim(),
              ) || surfaceText.includes(ev.sourceText)
            : block.text.includes(ev.sourceText)
        ) {
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

/** Calendar-day equality for wedding.date vs bare table dates / Polish long form. */
export function weddingDatesSemanticallyEqual(a: string, b: string): boolean {
  const MONTH: Record<string, string> = {
    stycznia: '01',
    lutego: '02',
    marca: '03',
    kwietnia: '04',
    maja: '05',
    czerwca: '06',
    lipca: '07',
    sierpnia: '08',
    września: '09',
    października: '10',
    listopada: '11',
    grudnia: '12',
  }
  const parse = (s: string): string | null => {
    const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (m) {
      const d = m[1]!.padStart(2, '0')
      const mo = m[2]!.padStart(2, '0')
      let y = m[3]!
      if (y.length === 2) y = `20${y}`
      return `${y}-${mo}-${d}`
    }
    const long = s.match(
      /(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+(\d{4})/i,
    )
    if (!long) return null
    const month = MONTH[long[2]!.toLowerCase()]
    if (!month) return null
    return `${long[3]}-${month}-${long[1]!.padStart(2, '0')}`
  }
  const pa = parse(a)
  const pb = parse(b)
  return Boolean(pa && pb && pa === pb)
}
