/**
 * Authoritative logical-field model for contract generation.
 *
 * Review: one row per registryKey.
 * Renderer: every distinct physical binding for that key.
 *
 * Does not change locate/replace algorithms — only groups and normalizes
 * the binding set so review and generation consume the same model.
 */

import type { CompletenessField } from './buildContractCompleteness'
import { isSlotPhysicallyBound, type TemplateSlot, type TemplateSlotMap } from './types'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type PhysicalContractBinding = {
  bindingId: string
  paragraphIndex: number
  startOffset: number
  endOffset: number
  leftAnchor: string | null
  rightAnchor: string | null
  originalSpan: string | null
  source: 'persisted'
  slot: TemplateSlot
}

export type LogicalContractField = {
  id: string
  registryKey: string
  displayName: string
  physicalBindings: PhysicalContractBinding[]
}

function spanOffsets(slot: TemplateSlot): {
  start: number
  end: number
} | null {
  const start = slot.startOffset ?? slot.allowedRange?.start
  const end = slot.endOffset ?? slot.allowedRange?.end
  if (slot.paragraphIndex == null || start == null || end == null) return null
  return { start, end }
}

/** Stable unique binding id — includes end so start-only collisions cannot share an id. */
export function physicalBindingId(slot: TemplateSlot): string {
  const key = slot.registryKey ?? 'unknown'
  const para = slot.paragraphIndex ?? 'x'
  const offsets = spanOffsets(slot)
  if (!offsets) return slot.id || `slot-${key}-${para}`
  return `slot-${key}-${para}-${offsets.start}-${offsets.end}`
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function scoreBinding(slot: TemplateSlot): number {
  let n = 0
  if (isSlotPhysicallyBound(slot)) n += 100
  if (slot.enabled !== false) n += 20
  if (typeof slot.confidence === 'number') n += slot.confidence * 10
  const offsets = spanOffsets(slot)
  if (offsets) n += Math.max(0, offsets.end - offsets.start)
  const orig = slot.originalText ?? ''
  // Prefer token-tight spans (no leading/trailing whitespace ownership).
  if (orig && orig === orig.trim()) n += 50
  else if (orig && orig !== orig.trim()) n -= 40
  // Prefer full date tokens over truncated fragments like " 19".
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(orig.trim())) n += 40
  if (slot.sampleContext) n += 5
  return n
}

/**
 * Normalize persisted bindings:
 * - unique bindingId (key-para-start-end)
 * - drop exact duplicate spans (same key@para:start:end)
 * - for same key@para@start with end drift, keep the stronger binding only
 * - for overlapping same-key spans in one paragraph, keep the stronger only
 */
export function normalizePhysicalBindings(slots: TemplateSlot[]): TemplateSlot[] {
  const byExactSpan = new Map<string, TemplateSlot>()
  const byStart = new Map<string, TemplateSlot>()
  const passthrough: TemplateSlot[] = []

  for (const raw of slots) {
    if (raw.detectionStatus === 'duplicate_alias' && raw.enabled === false) {
      continue
    }
    if (!raw.registryKey || !isSlotPhysicallyBound(raw)) {
      passthrough.push(raw)
      continue
    }
    const offsets = spanOffsets(raw)
    if (!offsets) {
      passthrough.push(raw)
      continue
    }
    const withId: TemplateSlot = {
      ...raw,
      id: physicalBindingId(raw),
      startOffset: offsets.start,
      endOffset: offsets.end,
      allowedRange: { start: offsets.start, end: offsets.end },
    }
    const exact = `${raw.registryKey}@${raw.paragraphIndex}:${offsets.start}:${offsets.end}`
    const startKey = `${raw.registryKey}@${raw.paragraphIndex}:${offsets.start}`

    const prevExact = byExactSpan.get(exact)
    if (prevExact) {
      if (scoreBinding(withId) > scoreBinding(prevExact)) {
        byExactSpan.set(exact, withId)
      }
      continue
    }

    const prevStart = byStart.get(startKey)
    if (prevStart) {
      // End-offset drift for the same occurrence — keep one, not two review rows / React keys.
      if (scoreBinding(withId) > scoreBinding(prevStart)) {
        const prevOff = spanOffsets(prevStart)!
        byExactSpan.delete(
          `${prevStart.registryKey}@${prevStart.paragraphIndex}:${prevOff.start}:${prevOff.end}`,
        )
        byExactSpan.set(exact, withId)
        byStart.set(startKey, withId)
      }
      continue
    }

    byExactSpan.set(exact, withId)
    byStart.set(startKey, withId)
  }

  // Collapse overlapping same-key spans (e.g. " 19" vs "19.06.2025",
  // or location with/without surrounding spaces). Different starts survive
  // the startKey map above and would both reach the renderer.
  const survivors = [...byExactSpan.values()]
  const dropped = new Set<string>()
  for (let i = 0; i < survivors.length; i++) {
    const a = survivors[i]!
    if (dropped.has(a.id)) continue
    const aOff = spanOffsets(a)!
    for (let j = i + 1; j < survivors.length; j++) {
      const b = survivors[j]!
      if (dropped.has(b.id)) continue
      if (a.registryKey !== b.registryKey) continue
      if (a.paragraphIndex !== b.paragraphIndex) continue
      const bOff = spanOffsets(b)!
      if (!rangesOverlap(aOff, bOff)) continue
      const keepA = scoreBinding(a) >= scoreBinding(b)
      const loser = keepA ? b : a
      dropped.add(loser.id)
      devInfoArgs('[physical-binding-normalize]', {
        event: 'collapse_overlapping_same_key',
        registryKey: a.registryKey,
        paragraphIndex: a.paragraphIndex,
        keptId: keepA ? a.id : b.id,
        droppedId: loser.id,
        keptSpan: keepA
          ? { start: aOff.start, end: aOff.end, original: a.originalText }
          : { start: bOff.start, end: bOff.end, original: b.originalText },
        droppedSpan: {
          start: spanOffsets(loser)!.start,
          end: spanOffsets(loser)!.end,
          original: loser.originalText,
        },
      })
      if (!keepA) break
    }
  }

  return [
    ...survivors.filter((s) => !dropped.has(s.id)),
    ...passthrough,
  ]
}

export function normalizeSlotMap(slotMap: TemplateSlotMap): TemplateSlotMap {
  return {
    ...slotMap,
    slots: normalizePhysicalBindings(slotMap.slots),
  }
}

export function groupSlotsIntoLogicalFields(
  slots: TemplateSlot[],
): LogicalContractField[] {
  const byKey = new Map<string, TemplateSlot[]>()
  for (const slot of slots) {
    if (!slot.registryKey || !slot.enabled) continue
    if (!isSlotPhysicallyBound(slot)) continue
    const list = byKey.get(slot.registryKey) ?? []
    list.push(slot)
    byKey.set(slot.registryKey, list)
  }

  const fields: LogicalContractField[] = []
  for (const [registryKey, group] of byKey) {
    const physicalBindings: PhysicalContractBinding[] = group
      .map((slot) => {
        const offsets = spanOffsets(slot)
        if (!offsets || slot.paragraphIndex == null) return null
        return {
          bindingId: physicalBindingId(slot),
          paragraphIndex: slot.paragraphIndex,
          startOffset: offsets.start,
          endOffset: offsets.end,
          leftAnchor: slot.leftAnchor ?? null,
          rightAnchor: slot.rightAnchor ?? null,
          originalSpan: slot.originalText ?? null,
          source: 'persisted' as const,
          slot: { ...slot, id: physicalBindingId(slot) },
        }
      })
      .filter((b): b is PhysicalContractBinding => Boolean(b))
      .sort(
        (a, b) =>
          a.paragraphIndex - b.paragraphIndex ||
          a.startOffset - b.startOffset,
      )

    if (physicalBindings.length === 0) continue
    const displayName =
      group.find((s) => s.label.trim())?.label.trim() || registryKey
    fields.push({
      id: `logical-${registryKey}`,
      registryKey,
      displayName,
      physicalBindings,
    })
  }

  return fields.sort((a, b) => a.registryKey.localeCompare(b.registryKey))
}

/** Completeness / review: one field per registryKey. */
export function collapseCompletenessFieldsByRegistryKey(
  fields: CompletenessField[],
): CompletenessField[] {
  const byKey = new Map<string, CompletenessField>()
  for (const field of fields) {
    const prev = byKey.get(field.registryKey)
    if (!prev) {
      byKey.set(field.registryKey, {
        ...field,
        slotId: `logical-${field.registryKey}`,
      })
      continue
    }
    const prevHasValue = Boolean(prev.value.trim())
    const nextHasValue = Boolean(field.value.trim())
    const chosen =
      prevHasValue && !nextHasValue
        ? prev
        : !prevHasValue && nextHasValue
          ? field
          : !prev.missing && field.missing
            ? prev
            : prev.missing && !field.missing
              ? field
              : prev
    byKey.set(field.registryKey, {
      ...chosen,
      slotId: `logical-${field.registryKey}`,
      missing: !(chosen.value.trim() || prev.value.trim() || field.value.trim())
        ? prev.missing || field.missing
        : false,
      value: chosen.value.trim() || prev.value || field.value,
    })
  }
  return [...byKey.values()]
}

/**
 * Before apply: one replacement per physical span.
 * Multiple registryKeys on the same para:start:end (shared location) must not
 * re-locate the same originalText after the first write.
 * Distinct spans for the same registryKey are all kept.
 */
export function slotsForSinglePassApply(slots: TemplateSlot[]): TemplateSlot[] {
  const bySpan = new Map<string, TemplateSlot[]>()
  const unbound: TemplateSlot[] = []

  for (const slot of slots) {
    if (!slot.enabled || !slot.registryKey) {
      unbound.push(slot)
      continue
    }
    if (!isSlotPhysicallyBound(slot)) {
      unbound.push(slot)
      continue
    }
    const offsets = spanOffsets(slot)
    if (slot.paragraphIndex == null || !offsets) {
      unbound.push(slot)
      continue
    }
    const spanKey = `${slot.paragraphIndex}:${offsets.start}:${offsets.end}`
    const list = bySpan.get(spanKey) ?? []
    list.push({ ...slot, id: physicalBindingId(slot) })
    bySpan.set(spanKey, list)
  }

  const selected: TemplateSlot[] = []
  for (const group of bySpan.values()) {
    if (group.length === 1) {
      selected.push(group[0]!)
      continue
    }
    // Shared physical span claimed by multiple keys — apply once.
    const preference = [
      'reception_location',
      'ceremony_location',
      'preparation_location',
    ]
    const preferred =
      preference
        .map((key) => group.find((s) => s.registryKey === key))
        .find(Boolean) ?? group[0]!
    selected.push(preferred)
    devInfoArgs('[logical-field-apply]', {
      event: 'collapse_shared_physical_span',
      keptRegistryKey: preferred.registryKey,
      droppedRegistryKeys: group
        .map((s) => s.registryKey)
        .filter((k) => k && k !== preferred.registryKey),
      paragraphIndex: preferred.paragraphIndex,
      startOffset: preferred.startOffset,
      endOffset: preferred.endOffset,
    })
  }

  return [...selected, ...unbound]
}

export function logLogicalFieldModel(
  phase: string,
  slots: TemplateSlot[],
): void {
  const logical = groupSlotsIntoLogicalFields(slots)
  devInfoArgs('[logical-contract-fields]', {
    phase,
    logicalFieldCount: logical.length,
    physicalBindingCount: logical.reduce(
      (n, f) => n + f.physicalBindings.length,
      0,
    ),
    fields: logical.map((f) => ({
      registryKey: f.registryKey,
      bindingCount: f.physicalBindings.length,
      bindings: f.physicalBindings.map((b) => ({
        bindingId: b.bindingId,
        paragraphIndex: b.paragraphIndex,
        startOffset: b.startOffset,
        endOffset: b.endOffset,
        leftAnchor: b.leftAnchor,
        rightAnchor: b.rightAnchor,
        originalSpan: b.originalSpan,
        source: b.source,
      })),
    })),
  })
}
