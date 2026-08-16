/**
 * Canonicalize client-party physical bindings before overlap validation.
 *
 * One physical character range → one persisted replacement binding.
 * Semantic aliases may be recorded on the retained slot; they must not create
 * additional renderer operations.
 */

import {
  isClientPartyAddressKey,
  isClientPartyIdentityKey,
  isClientPartyPhoneKey,
} from './clientPartyReadiness'
import { isSlotPhysicallyBound, type TemplateSlot } from './types'
import { devInfoArgs } from '@/lib/debug/devConsole'

export type SpanConflictRelationship =
  | 'identical'
  | 'contains'
  | 'contained_by'
  | 'partial_overlap'

export type ClientPartyBindingDiscard = {
  binding: TemplateSlot
  reason: string
}

export type ClientPartyBindingNormalizationResult = {
  slots: TemplateSlot[]
  retained: TemplateSlot[]
  discarded: ClientPartyBindingDiscard[]
  remainingConflicts: Array<{
    conflictId: string
    relationship: SpanConflictRelationship
    paragraphIndex: number
    startOffset: number
    endOffset: number
    registryKeys: string[]
    bindingA: TemplateSlot
    bindingB: TemplateSlot
  }>
}

type Span = { start: number; end: number; paragraphIndex: number }

function spanOf(slot: TemplateSlot): Span | null {
  if (slot.paragraphIndex == null) return null
  const start = slot.startOffset ?? slot.allowedRange?.start
  const end = slot.endOffset ?? slot.allowedRange?.end
  if (start == null || end == null) return null
  return { paragraphIndex: slot.paragraphIndex, start, end }
}

export function classifySpanRelationship(
  a: Span,
  b: Span,
): SpanConflictRelationship | null {
  if (a.paragraphIndex !== b.paragraphIndex) return null
  if (a.start === b.start && a.end === b.end) return 'identical'
  if (a.start <= b.start && a.end >= b.end) return 'contains'
  if (b.start <= a.start && b.end >= a.end) return 'contained_by'
  if (a.start < b.end && b.start < a.end) return 'partial_overlap'
  return null
}

function scoreSlot(slot: TemplateSlot): number {
  let n = 0
  if (isSlotPhysicallyBound(slot)) n += 100
  if (slot.enabled !== false) n += 20
  if (typeof slot.confidence === 'number') n += slot.confidence * 10
  if (slot.operation === 'composite') n += 40
  if (slot.registryKey === 'couple_full_names') n += 30
  if (slot.registryKey === 'client_address' || slot.registryKey === 'client_phone') {
    n += 25
  }
  if (slot.registryKey?.startsWith('bride_')) n += 10
  if (slot.registryKey?.startsWith('partner1_')) n += 8
  if (slot.detectionReason?.includes('candidate')) n += 5
  const id = slot.id ?? ''
  // Stable tie-break: prefer lexicographically smaller id.
  n += Math.max(0, 5 - id.length * 0.001)
  return n
}

function isClientPartyPhysical(slot: TemplateSlot): boolean {
  const key = slot.registryKey
  if (!key || !isSlotPhysicallyBound(slot)) return false
  return (
    isClientPartyIdentityKey(key) ||
    isClientPartyAddressKey(key) ||
    isClientPartyPhoneKey(key)
  )
}

function mergeAliases(primary: TemplateSlot, discardedKey: string): TemplateSlot {
  const aliases = [...new Set([...(primary.aliases ?? []), discardedKey])]
  const componentKeys =
    primary.registryKey === 'couple_full_names'
      ? [
          ...new Set([
            ...(primary.componentKeys ?? [
              'partner1_full_name',
              'partner2_full_name',
            ]),
            discardedKey,
          ]),
        ]
      : primary.componentKeys
  return {
    ...primary,
    aliases,
    componentKeys,
  }
}

function logBindingSnapshot(
  label: string,
  bindings: TemplateSlot[],
  extra?: Record<string, unknown>,
) {
  devInfoArgs(label, {
    ...extra,
    bindings: bindings.map((b) => {
      const span = spanOf(b)
      return {
        id: b.id,
        logicalKey: b.registryKey,
        paragraphIndex: b.paragraphIndex,
        start: span?.start ?? null,
        end: span?.end ?? null,
        text: b.originalText ?? null,
        candidateSource: b.detectionReason ?? b.evidenceType ?? null,
        confidence: b.confidence ?? null,
      }
    }),
  })
}

/**
 * Collapse safe client-party aliases into one physical owner per span.
 * Genuine partial overlaps are left for findSharedPhysicalSpanConflicts.
 */
export function normalizeClientPartyPhysicalBindings(
  slots: TemplateSlot[],
): ClientPartyBindingNormalizationResult {
  const clientBindings = slots.filter(isClientPartyPhysical)
  logBindingSnapshot('[client-party-bindings-before-normalization]', clientBindings)

  const discarded: ClientPartyBindingDiscard[] = []
  const dropIds = new Set<string>()
  let working = [...slots]

  const physicalClient = () =>
    working.filter(
      (s) => isClientPartyPhysical(s) && !dropIds.has(s.id) && s.enabled !== false,
    )

  // RULE D — exact duplicates (same key + same span)
  {
    const byExact = new Map<string, TemplateSlot>()
    for (const slot of physicalClient()) {
      const span = spanOf(slot)
      if (!span || !slot.registryKey) continue
      const key = `${slot.registryKey}@${span.paragraphIndex}:${span.start}:${span.end}`
      const prev = byExact.get(key)
      if (!prev) {
        byExact.set(key, slot)
        continue
      }
      const keep = scoreSlot(slot) >= scoreSlot(prev) ? slot : prev
      const lose = keep.id === slot.id ? prev : slot
      dropIds.add(lose.id)
      discarded.push({ binding: lose, reason: 'exact_duplicate_binding' })
      byExact.set(key, keep)
    }
    working = working.filter((s) => !dropIds.has(s.id))
  }

  // RULE A — composite identity owns contained individual identity spans
  {
    const identities = physicalClient().filter((s) =>
      isClientPartyIdentityKey(s.registryKey),
    )
    const composites = identities.filter(
      (s) =>
        s.registryKey === 'couple_full_names' || s.operation === 'composite',
    )
    for (const composite of composites) {
      const cSpan = spanOf(composite)
      if (!cSpan) continue
      for (const other of identities) {
        if (other.id === composite.id) continue
        if (dropIds.has(other.id)) continue
        if (other.registryKey === 'couple_full_names') continue
        const oSpan = spanOf(other)
        if (!oSpan) continue
        const rel = classifySpanRelationship(cSpan, oSpan)
        if (rel === 'contains' || rel === 'identical') {
          dropIds.add(other.id)
          discarded.push({
            binding: other,
            reason: 'covered_by_canonical_composite_identity',
          })
          working = working.map((s) =>
            s.id === composite.id
              ? mergeAliases(s, other.registryKey!)
              : s,
          )
        }
      }
    }
    working = working.filter((s) => !dropIds.has(s.id))
  }

  // RULE B/C — identical shared address / phone spans → one physical owner
  const collapseIdenticalCapability = (
    predicate: (key: string) => boolean,
    reason: string,
  ) => {
    const group = physicalClient().filter(
      (s) => s.registryKey && predicate(s.registryKey),
    )
    const bySpan = new Map<string, TemplateSlot[]>()
    for (const slot of group) {
      const span = spanOf(slot)
      if (!span) continue
      const key = `${span.paragraphIndex}:${span.start}:${span.end}`
      const list = bySpan.get(key) ?? []
      list.push(slot)
      bySpan.set(key, list)
    }
    for (const list of bySpan.values()) {
      if (list.length < 2) continue
      const ranked = [...list].sort((a, b) => scoreSlot(b) - scoreSlot(a))
      const winner = ranked[0]!
      for (const loser of ranked.slice(1)) {
        dropIds.add(loser.id)
        discarded.push({ binding: loser, reason })
        working = working.map((s) =>
          s.id === winner.id ? mergeAliases(s, loser.registryKey!) : s,
        )
      }
    }
    working = working.filter((s) => !dropIds.has(s.id))
  }

  collapseIdenticalCapability(
    (k) => isClientPartyAddressKey(k),
    'shared_address_identical_span_alias',
  )
  collapseIdenticalCapability(
    (k) => isClientPartyPhoneKey(k),
    'shared_phone_identical_span_alias',
  )

  const retained = physicalClient()
  const remainingConflicts: ClientPartyBindingNormalizationResult['remainingConflicts'] =
    []

  for (let i = 0; i < retained.length; i++) {
    for (let j = i + 1; j < retained.length; j++) {
      const a = retained[i]!
      const b = retained[j]!
      const aSpan = spanOf(a)
      const bSpan = spanOf(b)
      if (!aSpan || !bSpan) continue
      const rel = classifySpanRelationship(aSpan, bSpan)
      if (!rel) continue
      // Identity contained in composite should already be gone; anything left
      // that overlaps across different keys is unresolved.
      if (a.registryKey === b.registryKey && rel === 'identical') continue
      remainingConflicts.push({
        conflictId: `${a.id}__${b.id}`,
        relationship: rel,
        paragraphIndex: aSpan.paragraphIndex,
        startOffset: Math.min(aSpan.start, bSpan.start),
        endOffset: Math.max(aSpan.end, bSpan.end),
        registryKeys: [a.registryKey!, b.registryKey!].sort(),
        bindingA: a,
        bindingB: b,
      })
    }
  }

  devInfoArgs('[client-party-bindings-after-normalization]', {
    retained: retained.map((b) => {
      const span = spanOf(b)
      return {
        id: b.id,
        logicalKey: b.registryKey,
        paragraphIndex: b.paragraphIndex,
        start: span?.start ?? null,
        end: span?.end ?? null,
        text: b.originalText ?? null,
        aliases: b.aliases ?? [],
      }
    }),
    discarded: discarded.map((d) => ({
      binding: {
        id: d.binding.id,
        logicalKey: d.binding.registryKey,
        paragraphIndex: d.binding.paragraphIndex,
        start: spanOf(d.binding)?.start ?? null,
        end: spanOf(d.binding)?.end ?? null,
        text: d.binding.originalText ?? null,
      },
      reason: d.reason,
    })),
    remainingConflicts: remainingConflicts.map((c) => ({
      conflictId: c.conflictId,
      relationship: c.relationship,
      registryKeys: c.registryKeys,
      paragraphIndex: c.paragraphIndex,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
    })),
  })

  return {
    slots: working,
    retained,
    discarded,
    remainingConflicts,
  }
}

/** Describe unresolved overlaps for DEV diagnostics. */
export function describeSharedPhysicalSpanConflicts(input: {
  documentName?: string | null
  paragraphs?: Array<{ index: number; text: string }>
  slots: TemplateSlot[]
  conflicts: Array<{
    paragraphIndex: number
    startOffset: number
    endOffset: number
    registryKeys: string[]
  }>
}): void {
  if (input.conflicts.length === 0) return

  const physical = input.slots.filter(
    (s) => s.registryKey && isSlotPhysicallyBound(s),
  )
  const detailed = []
  for (const conflict of input.conflicts) {
    const involved = physical.filter((s) => {
      const span = spanOf(s)
      if (!span) return false
      if (span.paragraphIndex !== conflict.paragraphIndex) return false
      return span.start < conflict.endOffset && conflict.startOffset < span.end
    })
    for (let i = 0; i < involved.length; i++) {
      for (let j = i + 1; j < involved.length; j++) {
        const a = involved[i]!
        const b = involved[j]!
        if (a.registryKey === b.registryKey) continue
        const aSpan = spanOf(a)!
        const bSpan = spanOf(b)!
        const relationship =
          classifySpanRelationship(aSpan, bSpan) ?? 'partial_overlap'
        detailed.push({
          conflictId: `${a.id}__${b.id}`,
          relationship,
          bindingA: {
            id: a.id,
            logicalKey: a.registryKey,
            source: a.detectionReason ?? a.evidenceType ?? null,
            paragraphIndex: a.paragraphIndex,
            start: aSpan.start,
            end: aSpan.end,
            text: a.originalText ?? null,
            candidateType: a.evidenceType ?? null,
            confidence: a.confidence ?? null,
          },
          bindingB: {
            id: b.id,
            logicalKey: b.registryKey,
            source: b.detectionReason ?? b.evidenceType ?? null,
            paragraphIndex: b.paragraphIndex,
            start: bSpan.start,
            end: bSpan.end,
            text: b.originalText ?? null,
            candidateType: b.evidenceType ?? null,
            confidence: b.confidence ?? null,
          },
        })
      }
    }
  }

  const paraIndex = input.conflicts[0]?.paragraphIndex
  const sourceParagraphText =
    paraIndex == null
      ? null
      : (input.paragraphs?.find((p) => p.index === paraIndex)?.text ?? null)

  devInfoArgs('[package-contract-shared-span-conflict]', {
    documentName: input.documentName ?? null,
    paragraphIndex: paraIndex ?? null,
    sourceParagraphText,
    conflicts: detailed,
  })
}
