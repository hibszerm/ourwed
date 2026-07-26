/**
 * Shared wedding-location policy.
 *
 * When one physical source span represents preparations + ceremony + reception,
 * never emit three conflicting patches. Merge equal values; otherwise REVIEW.
 */

import type {
  DocumentTextAnchor,
  LabReplacementRow,
  SemanticMappingRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { isLocationVariableRole } from '@/features/ai-contract-lab/templateFieldPolicy'
import { normalizeSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'

function roleOf(role: string): string {
  return normalizeSemanticRole(role) ?? role
}

export type SharedLocationDecision =
  | 'use_shared'
  | 'use_combined'
  | 'edit_template'
  | null

export type SharedLocationReviewItem = {
  code: 'shared_location_requires_combined_value' | 'shared_location_requires_decision'
  anchorId: string
  sourceValue: string
  start: number
  end: number
  semanticRoles: string[]
  canonicalValues: Record<string, string | null>
  combinedPreview: string
  message: string
}

function targetValue(row: LabReplacementRow | SemanticMappingRow): string {
  if ('proposedValue' in row) {
    return (row.manualValue ?? row.proposedValue).trim()
  }
  return (row.canonicalValue ?? row.derivedValue ?? '').trim()
}

function normalized(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\u00a0|\u202f|\u2007/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .toLocaleLowerCase('pl-PL')
}

/**
 * Detect mapping rows that share the same physical span for location roles.
 */
export function detectSharedLocationGroups(input: {
  rows: LabReplacementRow[]
  anchors: DocumentTextAnchor[]
}): Array<{
  key: string
  anchorId: string
  start: number
  end: number
  sourceValue: string
  rows: LabReplacementRow[]
}> {
  const byKey = new Map<string, LabReplacementRow[]>()
  for (const row of input.rows) {
    const role = roleOf(row.semanticRole)
    if (!isLocationVariableRole(role)) continue
    if (row.spanStart == null || row.spanEnd == null) continue
    if (row.decision === 'rejected' || row.decision === 'unchanged') continue
    const key = `${row.anchorId}:${row.spanStart}:${row.spanEnd}`
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const groups: Array<{
    key: string
    anchorId: string
    start: number
    end: number
    sourceValue: string
    rows: LabReplacementRow[]
  }> = []

  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue
    const roles = new Set(rows.map((r) => roleOf(r.semanticRole)))
    if (roles.size < 2) continue
    const first = rows[0]!
    const anchor = input.anchors.find((a) => a.anchorId === first.anchorId)
    const sourceValue =
      anchor?.text.slice(first.spanStart!, first.spanEnd!) ?? first.originalText
    groups.push({
      key,
      anchorId: first.anchorId,
      start: first.spanStart!,
      end: first.spanEnd!,
      sourceValue,
      rows,
    })
  }
  return groups
}

export function buildCombinedLocationPreview(values: {
  preparation?: string | null
  ceremony?: string | null
  reception?: string | null
  format?: string | null
}): string {
  const format = values.format?.trim()
  if (format) {
    return format
      .replace(/\{preparation\}/gi, values.preparation?.trim() || '—')
      .replace(/\{ceremony\}/gi, values.ceremony?.trim() || '—')
      .replace(/\{reception\}/gi, values.reception?.trim() || '—')
  }
  const parts: string[] = []
  if (values.preparation?.trim()) {
    parts.push(`Przygotowania: ${values.preparation.trim()}`)
  }
  if (values.ceremony?.trim()) {
    parts.push(`ceremonia: ${values.ceremony.trim()}`)
  }
  if (values.reception?.trim()) {
    parts.push(`przyjęcie: ${values.reception.trim()}`)
  }
  return parts.join('; ')
}

/**
 * Reconcile shared location patches:
 * - identical canonical targets → one physical replacement
 * - differing targets → no physical patches + REVIEW item
 */
export function reconcileSharedLocationPatches(input: {
  rows: LabReplacementRow[]
  anchors: DocumentTextAnchor[]
  decision?: SharedLocationDecision
  sharedValue?: string | null
  policy?: {
    mode?: 'ask_each_time' | 'use_single_location' | 'combine_locations'
    preferredLocationRole?: 'preparation' | 'ceremony' | 'reception'
    combinedFormat?: string
  } | null
}): {
  rows: LabReplacementRow[]
  reviewItems: SharedLocationReviewItem[]
  suppressedReplacementIds: string[]
} {
  const groups = detectSharedLocationGroups(input)
  if (groups.length === 0) {
    return { rows: input.rows, reviewItems: [], suppressedReplacementIds: [] }
  }

  const suppressed = new Set<string>()
  const reviewItems: SharedLocationReviewItem[] = []
  const winners = new Map<string, LabReplacementRow>()

  for (const group of groups) {
    const values = new Set(
      group.rows.map((row) => normalized(targetValue(row))).filter(Boolean),
    )
    const byRole: Record<string, string | null> = {}
    for (const row of group.rows) {
      byRole[roleOf(row.semanticRole)] = targetValue(row) || null
    }
    const preparation =
      byRole.preparation_location ??
      byRole.bride_preparation_location ??
      byRole.groom_preparation_location
    const ceremony =
      byRole.ceremony_location ?? byRole.church ?? byRole.civil_office
    const reception = byRole.reception_location
    const combinedPreview = buildCombinedLocationPreview({
      preparation,
      ceremony,
      reception,
      format: input.policy?.combinedFormat,
    })

    if (values.size <= 1) {
      const winner = {
        ...group.rows[0]!,
        semanticRole: 'shared_wedding_location',
        semanticBindings: [
          ...new Set(group.rows.flatMap((r) => r.semanticBindings ?? [r.semanticRole])),
        ],
        mergedReplacementIds: group.rows
          .slice(1)
          .map((r) => r.replacementId),
        proposedValue: targetValue(group.rows[0]!),
      }
      winners.set(group.key, winner)
      group.rows.slice(1).forEach((r) => suppressed.add(r.replacementId))
      continue
    }

    // Differing canonical locations — honour saved template policy
    let decision = input.decision
    let sharedValue = input.sharedValue
    if (!decision && input.policy?.mode === 'combine_locations') {
      decision = 'use_combined'
    }
    if (!decision && input.policy?.mode === 'use_single_location') {
      decision = 'use_shared'
      const preferred = input.policy.preferredLocationRole
      sharedValue =
        preferred === 'preparation'
          ? preparation
          : preferred === 'reception'
            ? reception
            : ceremony
      sharedValue =
        sharedValue ?? ceremony ?? preparation ?? reception ?? null
    }

    if (decision === 'use_shared' && sharedValue?.trim()) {
      const winner = {
        ...group.rows[0]!,
        semanticRole: 'shared_wedding_location',
        semanticBindings: [
          ...new Set(group.rows.flatMap((r) => r.semanticBindings ?? [r.semanticRole])),
        ],
        mergedReplacementIds: group.rows
          .slice(1)
          .map((r) => r.replacementId),
        proposedValue: sharedValue.trim(),
        decision: 'approved' as const,
      }
      winners.set(group.key, winner)
      group.rows.slice(1).forEach((r) => suppressed.add(r.replacementId))
      continue
    }

    if (decision === 'use_combined' && combinedPreview) {
      const winner = {
        ...group.rows[0]!,
        semanticRole: 'shared_wedding_location',
        semanticBindings: [
          ...new Set(group.rows.flatMap((r) => r.semanticBindings ?? [r.semanticRole])),
        ],
        mergedReplacementIds: group.rows
          .slice(1)
          .map((r) => r.replacementId),
        proposedValue: combinedPreview,
        originalText: group.sourceValue,
        decision: 'approved' as const,
        requiresUserReview: false,
        reason: 'shared_location_requires_combined_value',
      }
      winners.set(group.key, winner)
      group.rows.slice(1).forEach((r) => suppressed.add(r.replacementId))
      continue
    }

    // ask_each_time — REVIEW, never three patches
    group.rows.forEach((r) => suppressed.add(r.replacementId))
    reviewItems.push({
      code: 'shared_location_requires_decision',
      anchorId: group.anchorId,
      sourceValue: group.sourceValue,
      start: group.start,
      end: group.end,
      semanticRoles: [...new Set(group.rows.map((r) => r.semanticRole))],
      canonicalValues: byRole,
      combinedPreview,
      message:
        'Szablon ma jedno wspólne pole lokalizacji, ale zlecenie zawiera trzy różne miejsca.',
    })
  }

  const nextRows = input.rows
    .filter((row) => !suppressed.has(row.replacementId))
    .map((row) => {
      for (const [key, winner] of winners) {
        if (
          `${row.anchorId}:${row.spanStart}:${row.spanEnd}` === key &&
          row.replacementId === winner.replacementId
        ) {
          return winner
        }
      }
      return row
    })

  // Ensure winners that replaced suppressed peers are present
  for (const winner of winners.values()) {
    if (!nextRows.some((r) => r.replacementId === winner.replacementId)) {
      nextRows.push(winner)
    }
  }

  return {
    rows: nextRows,
    reviewItems,
    suppressedReplacementIds: [...suppressed],
  }
}
