import type {
  DocumentTextAnchor,
  LabReplacementRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  buildPatchPreview,
  type PatchPreview,
} from '@/features/ai-contract-lab/patchPreview'
import type { PatchConflict } from '@/features/ai-contract-lab/phaseCStructuralTypes'

export type PhysicalPatchPlanResult = {
  rows: LabReplacementRow[]
  conflicts: PatchConflict[]
  suppressedReplacementIds: string[]
  previews: Record<string, PatchPreview>
}

function targetValue(row: LabReplacementRow): string {
  return (row.manualValue ?? row.proposedValue).trim()
}

function normalizedTarget(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\u00a0|\u202f|\u2007/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .toLocaleLowerCase('pl-PL')
}

function anchorFor(
  anchors: DocumentTextAnchor[],
  anchorId: string,
): DocumentTextAnchor | undefined {
  return anchors.find((anchor) => anchor.anchorId === anchorId)
}

function sourceRange(
  row: LabReplacementRow,
  anchor: DocumentTextAnchor,
): { start: number; end: number; source: string } | null {
  if (
    row.spanStart == null ||
    row.spanEnd == null ||
    row.spanStart < 0 ||
    row.spanEnd <= row.spanStart ||
    row.spanEnd > anchor.text.length
  ) {
    return null
  }
  return {
    start: row.spanStart,
    end: row.spanEnd,
    source: anchor.text.slice(row.spanStart, row.spanEnd),
  }
}

function normalizeRowRange(
  row: LabReplacementRow,
  anchor: DocumentTextAnchor,
): LabReplacementRow | null {
  const range = sourceRange(row, anchor)
  if (range?.source === row.originalText) return row
  const first = anchor.text.indexOf(row.originalText)
  if (first < 0 || anchor.text.indexOf(row.originalText, first + 1) >= 0) {
    return null
  }
  return {
    ...row,
    spanStart: first,
    spanEnd: first + row.originalText.length,
    spanStatus: row.spanStatus === 'resolved_manual' ? 'resolved_manual' : 'exact',
    resolverDiagnostics: [
      ...(row.resolverDiagnostics ?? []),
      {
        exactSourceText: range?.source ?? '',
        start: row.spanStart ?? -1,
        end: row.spanEnd ?? -1,
        reason: 'corrected_to_unique_actual_source_span',
      },
    ],
  }
}

function physicalKey(
  row: LabReplacementRow,
  anchor: DocumentTextAnchor,
): string {
  return `${anchor.container}:${row.anchorId}:${row.spanStart}:${row.spanEnd}`
}

function isTokenBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : ''
  const after = end < text.length ? text[end] : ''
  return !/[\p{L}\p{N}]/u.test(before ?? '') && !/[\p{L}\p{N}]/u.test(after ?? '')
}

function runAwareExactness(
  anchor: DocumentTextAnchor,
  start: number,
  end: number,
): number {
  const segments = anchor.runSegments ?? []
  if (segments.length === 0) return 0
  const startsOnRun = segments.some((segment) => segment.start === start)
  const endsOnRun = segments.some((segment) => segment.end === end)
  const oneRun = segments.some(
    (segment) => segment.start <= start && segment.end >= end,
  )
  return Number(startsOnRun) + Number(endsOnRun) + Number(oneRun)
}

function whitespacePreservation(source: string): number {
  if (/^\s|\s$/u.test(source)) return 0
  if (/\u00a0|\u202f|\u2007/u.test(source)) return 2
  return 1
}

function candidateScore(
  row: LabReplacementRow,
  anchor: DocumentTextAnchor,
): [number, number, number, number, number] {
  const start = row.spanStart ?? 0
  const end = row.spanEnd ?? start
  return [
    runAwareExactness(anchor, start, end),
    Number(isTokenBoundary(anchor.text, start, end)),
    whitespacePreservation(anchor.text.slice(start, end)),
    -(end - start),
    Math.round(row.confidence * 1_000),
  ]
}

function compareScore(
  a: LabReplacementRow,
  b: LabReplacementRow,
  anchor: DocumentTextAnchor,
): number {
  const scoreA = candidateScore(a, anchor)
  const scoreB = candidateScore(b, anchor)
  for (let index = 0; index < scoreA.length; index += 1) {
    const delta = scoreA[index]! - scoreB[index]!
    if (delta !== 0) return delta
  }
  return 0
}

function conflictFromRows(
  code: PatchConflict['code'],
  rows: LabReplacementRow[],
  anchor: DocumentTextAnchor,
  start: number,
  end: number,
): PatchConflict {
  return {
    code,
    physicalKey: `${anchor.container}:${anchor.anchorId}:${start}:${end}`,
    anchorId: anchor.anchorId,
    sourceValue: anchor.text.slice(start, end),
    start,
    end,
    semanticRoles: [...new Set(rows.map((row) => row.semanticRole))],
    proposedValues: [...new Set(rows.map((row) => targetValue(row)))],
    replacementIds: rows.map((row) => row.replacementId),
  }
}

function withMergedDiagnostics(
  winner: LabReplacementRow,
  merged: LabReplacementRow[],
): LabReplacementRow {
  return {
    ...winner,
    originalText: winner.originalText,
    semanticBindings: [
      ...new Set([
        ...(winner.semanticBindings ?? [winner.semanticRole]),
        ...merged.flatMap((row) => row.semanticBindings ?? [row.semanticRole]),
      ]),
    ],
    mergedReplacementIds: [
      ...new Set([
        ...(winner.mergedReplacementIds ?? []),
        ...merged
          .filter((row) => row.replacementId !== winner.replacementId)
          .map((row) => row.replacementId),
      ]),
    ],
  }
}

function overlaps(a: LabReplacementRow, b: LabReplacementRow): boolean {
  return (
    a.anchorId === b.anchorId &&
    a.spanStart != null &&
    a.spanEnd != null &&
    b.spanStart != null &&
    b.spanEnd != null &&
    a.spanStart < b.spanEnd &&
    b.spanStart < a.spanEnd
  )
}

function actualPreview(
  row: LabReplacementRow,
  anchor: DocumentTextAnchor,
): PatchPreview | null {
  const range = sourceRange(row, anchor)
  if (!range) return null
  const before = anchor.text.slice(Math.max(0, range.start - 48), range.start)
  const after = anchor.text.slice(range.end, Math.min(anchor.text.length, range.end + 48))
  return buildPatchPreview({
    exactSourceText: range.source,
    replacementText: targetValue(row),
    prefixContext: before,
    suffixContext: after,
    anchorText: anchor.text,
  })
}

export function buildPhysicalPatchPlan(input: {
  rows: LabReplacementRow[]
  anchors: DocumentTextAnchor[]
}): PhysicalPatchPlanResult {
  const candidates = input.rows.flatMap((row) => {
    if (
      row.decision !== 'approved' ||
      row.spanStatus === 'ambiguous' ||
      row.spanStatus === 'not_found' ||
      row.spanStart == null ||
      row.spanEnd == null
    ) {
      return []
    }
    const anchor = anchorFor(input.anchors, row.anchorId)
    if (!anchor) return []
    const normalized = normalizeRowRange(row, anchor)
    return normalized ? [normalized] : []
  })
  const byExactRange = new Map<string, LabReplacementRow[]>()
  const conflicts: PatchConflict[] = []
  const suppressed = new Set<string>()

  for (const row of candidates) {
    const anchor = anchorFor(input.anchors, row.anchorId)
    if (!anchor || !sourceRange(row, anchor)) continue
    const key = physicalKey(row, anchor)
    const group = byExactRange.get(key) ?? []
    group.push(row)
    byExactRange.set(key, group)
  }

  const exactWinners: LabReplacementRow[] = []
  for (const rows of byExactRange.values()) {
    const anchor = anchorFor(input.anchors, rows[0]!.anchorId)!
    const start = rows[0]!.spanStart!
    const end = rows[0]!.spanEnd!
    const values = new Set(rows.map((row) => normalizedTarget(targetValue(row))))
    if (values.size > 1) {
      conflicts.push(
        conflictFromRows(
          'shared_source_span_conflict',
          rows,
          anchor,
          start,
          end,
        ),
      )
      rows.forEach((row) => suppressed.add(row.replacementId))
      continue
    }

    const ranked = [...rows].sort(
      (a, b) =>
        compareScore(b, a, anchor) ||
        a.replacementId.localeCompare(b.replacementId),
    )
    const winner = withMergedDiagnostics(ranked[0]!, ranked)
    exactWinners.push(winner)
    ranked.slice(1).forEach((row) => suppressed.add(row.replacementId))
  }

  const active = new Set(exactWinners.map((row) => row.replacementId))
  for (let leftIndex = 0; leftIndex < exactWinners.length; leftIndex += 1) {
    const left = exactWinners[leftIndex]!
    if (!active.has(left.replacementId)) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < exactWinners.length;
      rightIndex += 1
    ) {
      const right = exactWinners[rightIndex]!
      if (!active.has(right.replacementId) || !overlaps(left, right)) continue
      const anchor = anchorFor(input.anchors, left.anchorId)!
      const sameMeaning =
        left.semanticRole === right.semanticRole &&
        normalizedTarget(targetValue(left)) ===
          normalizedTarget(targetValue(right))

      if (sameMeaning) {
        const ranking = compareScore(left, right, anchor)
        if (ranking !== 0) {
          const winner = ranking > 0 ? left : right
          const loser = ranking > 0 ? right : left
          active.delete(loser.replacementId)
          suppressed.add(loser.replacementId)
          winner.resolverDiagnostics = [
            ...(winner.resolverDiagnostics ?? []),
            {
              exactSourceText: anchor.text.slice(
                loser.spanStart!,
                loser.spanEnd!,
              ),
              start: loser.spanStart!,
              end: loser.spanEnd!,
              reason: 'lower_ranked_overlapping_candidate',
            },
          ]
          continue
        }
      }

      const start = Math.min(left.spanStart!, right.spanStart!)
      const end = Math.max(left.spanEnd!, right.spanEnd!)
      conflicts.push(
        conflictFromRows(
          'duplicate_physical_patch',
          [left, right],
          anchor,
          start,
          end,
        ),
      )
      active.delete(left.replacementId)
      active.delete(right.replacementId)
      suppressed.add(left.replacementId)
      suppressed.add(right.replacementId)
      break
    }
  }

  const rows = exactWinners
    .filter((row) => active.has(row.replacementId))
    .sort(
      (a, b) =>
        a.anchorId.localeCompare(b.anchorId) ||
        (b.spanStart ?? 0) - (a.spanStart ?? 0),
    )
  const previews: Record<string, PatchPreview> = {}
  for (const row of rows) {
    const anchor = anchorFor(input.anchors, row.anchorId)
    if (!anchor) continue
    const preview = actualPreview(row, anchor)
    if (preview) previews[row.replacementId] = preview
  }

  return {
    rows,
    conflicts,
    suppressedReplacementIds: [...suppressed],
    previews,
  }
}

