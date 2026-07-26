/**
 * Authoritative package-contract generation model.
 * Review and renderer must consume the same instance / binding IDs.
 */

import {
  applyPackageContractAllowlistToSlotMap,
  isPackageContractAllowedDynamicKey,
  PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS,
} from './packageContractAllowlist'
import {
  groupSlotsIntoLogicalFields,
  normalizeSlotMap,
  physicalBindingId,
  type LogicalContractField,
} from './logicalContractFields'
import { isSlotPhysicallyBound, type TemplateSlot, type TemplateSlotMap } from './types'

export type PackageContractGenerationSource = {
  mode: 'persisted_only'
  runtimeSyncInvoked: false
  packageContractMode: true
  templateId: string
  templateVersionId: string
  packageId: string | null
}

export type PackageContractGenerationModel = {
  templateId: string
  templateVersionId: string
  packageId: string | null
  packageContractMode: true
  generationSource: PackageContractGenerationSource
  slotMap: TemplateSlotMap
  logicalFields: LogicalContractField[]
  physicalBindings: TemplateSlot[]
  sharedSpanConflicts: Array<{
    paragraphIndex: number
    startOffset: number
    endOffset: number
    registryKeys: string[]
  }>
}

export function isPackageImmutableRegistryKey(key: string | null | undefined): boolean {
  if (!key) return false
  if (isPackageContractAllowedDynamicKey(key)) return false
  return (
    (PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS as readonly string[]).includes(key) ||
    key === 'teaser' ||
    key === 'coverage_duration' ||
    key === 'film_duration'
  )
}

/** Filter any review / override / issue list down to allowlisted keys only. */
export function filterToPackageContractAllowlist<T extends { registryKey: string }>(
  items: T[],
): T[] {
  return items.filter((item) => isPackageContractAllowedDynamicKey(item.registryKey))
}

export function filterOverrideKeysToPackageAllowlist(
  overrides: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (isPackageContractAllowedDynamicKey(key)) out[key] = value
  }
  return out
}

/**
 * Detect physical spans claimed by more than one registry key.
 * Exact equal spans and overlapping ranges both conflict — a character may
 * belong to only one logical field in package-contract mode.
 */
export function findSharedPhysicalSpanConflicts(
  slots: TemplateSlot[],
): PackageContractGenerationModel['sharedSpanConflicts'] {
  type Span = {
    paragraphIndex: number
    startOffset: number
    endOffset: number
    registryKey: string
  }
  const spans: Span[] = []
  for (const slot of slots) {
    if (!slot.registryKey || !isSlotPhysicallyBound(slot)) continue
    if (slot.paragraphIndex == null) continue
    const start = slot.startOffset ?? slot.allowedRange?.start
    const end = slot.endOffset ?? slot.allowedRange?.end
    if (start == null || end == null) continue
    spans.push({
      paragraphIndex: slot.paragraphIndex,
      startOffset: start,
      endOffset: end,
      registryKey: slot.registryKey,
    })
  }

  // Cluster overlapping multi-key spans per paragraph (connected components).
  const byPara = new Map<number, Span[]>()
  for (const span of spans) {
    const list = byPara.get(span.paragraphIndex) ?? []
    list.push(span)
    byPara.set(span.paragraphIndex, list)
  }

  const conflicts: PackageContractGenerationModel['sharedSpanConflicts'] = []
  for (const [paragraphIndex, paraSpans] of byPara) {
    const parent = paraSpans.map((_, i) => i)
    const find = (i: number): number => {
      if (parent[i] !== i) parent[i] = find(parent[i]!)
      return parent[i]!
    }
    const unite = (i: number, j: number) => {
      const a = find(i)
      const b = find(j)
      if (a !== b) parent[a] = b
    }
    for (let i = 0; i < paraSpans.length; i++) {
      for (let j = i + 1; j < paraSpans.length; j++) {
        const a = paraSpans[i]!
        const b = paraSpans[j]!
        if (a.registryKey === b.registryKey) continue
        if (!(a.startOffset < b.endOffset && b.startOffset < a.endOffset)) {
          continue
        }
        unite(i, j)
      }
    }
    const groups = new Map<number, Span[]>()
    for (let i = 0; i < paraSpans.length; i++) {
      const root = find(i)
      const list = groups.get(root) ?? []
      list.push(paraSpans[i]!)
      groups.set(root, list)
    }
    for (const group of groups.values()) {
      const keys = [...new Set(group.map((s) => s.registryKey))].sort()
      if (keys.length < 2) continue
      conflicts.push({
        paragraphIndex,
        startOffset: Math.min(...group.map((s) => s.startOffset)),
        endOffset: Math.max(...group.map((s) => s.endOffset)),
        registryKeys: keys,
      })
    }
  }
  return conflicts
}

export function buildPackageContractGenerationModel(input: {
  templateId: string
  templateVersionId: string
  packageId?: string | null
  slotMap: TemplateSlotMap
}): PackageContractGenerationModel {
  const normalized = normalizeSlotMap(input.slotMap)
  const filtered = applyPackageContractAllowlistToSlotMap(normalized)
  const physicalBindings = filtered.slotMap.slots
    .filter((s) => s.enabled !== false && isSlotPhysicallyBound(s) && s.registryKey)
    .map((s) => ({ ...s, id: physicalBindingId(s) }))
  const logicalFields = groupSlotsIntoLogicalFields(physicalBindings)
  const sharedSpanConflicts = findSharedPhysicalSpanConflicts(physicalBindings)

  const generationSource: PackageContractGenerationSource = {
    mode: 'persisted_only',
    runtimeSyncInvoked: false,
    packageContractMode: true,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    packageId: input.packageId ?? null,
  }

  console.info('[package-contract-generation-source]', generationSource)
  console.info('[package-contract-generation-model]', {
    templateVersionId: input.templateVersionId,
    logicalFieldCount: logicalFields.length,
    physicalBindingCount: physicalBindings.length,
    sharedSpanConflictCount: sharedSpanConflicts.length,
    registryKeys: logicalFields.map((f) => f.registryKey),
    bindings: physicalBindings.map((s) => ({
      bindingId: s.id,
      registryKey: s.registryKey,
      paragraphIndex: s.paragraphIndex,
      startOffset: s.startOffset ?? s.allowedRange?.start ?? null,
      endOffset: s.endOffset ?? s.allowedRange?.end ?? null,
      originalSpan: s.originalText ?? null,
      leftAnchor: s.leftAnchor ?? null,
      rightAnchor: s.rightAnchor ?? null,
    })),
    sharedSpanConflicts,
  })

  return {
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    packageId: input.packageId ?? null,
    packageContractMode: true,
    generationSource,
    slotMap: { ...filtered.slotMap, slots: physicalBindings },
    logicalFields,
    physicalBindings,
    sharedSpanConflicts,
  }
}

/**
 * Dev/test assertion: package generation must never invoke runtime sync.
 */
export function assertPackageContractPersistedOnly(input: {
  packageContractMode: boolean
  runtimeSyncInvoked: boolean
}): void {
  if (!input.packageContractMode) return
  if (input.runtimeSyncInvoked) {
    throw new Error(
      'Package-contract generation invoked syncPhysicalBindingsFromSource — persisted_only required.',
    )
  }
  console.info('[package-contract-generation-source]', {
    mode: 'persisted_only',
    runtimeSyncInvoked: false,
  })
}
