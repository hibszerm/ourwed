/** Structural-only inventory for the IDs presented to the rewrite provider. */
export type ProviderRequestIdentityDiagnostics = {
  sourceIdCounts: Array<{
    blockId: string
    sourceOccurrenceCount: number
    structuralTypes: string[]
    editableTargetOccurrenceCount: number
    protectedReferenceOccurrenceCount: number
    otherModelContextReferenceCount: number
  }>
  editableAllowlistIdCounts: Array<{ blockId: string; occurrenceCount: number }>
  duplicateEditableIds: Array<{ blockId: string; occurrenceCount: number }>
  totalUniqueEditableIds: number
  totalEditableTargetEntries: number
}

type StructuralBlock = {
  blockId: string
  kind?: unknown
  modelContext?: unknown
}

function recordContextReferences(value: unknown, counts: Map<string, number>): void {
  if (Array.isArray(value)) {
    for (const item of value) recordContextReferences(item, counts)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (/blockIds$/i.test(key) && Array.isArray(child)) {
      for (const id of child) {
        if (typeof id === 'string') counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      continue
    }
    if (/blockId$/i.test(key) && typeof child === 'string') {
      counts.set(child, (counts.get(child) ?? 0) + 1)
    } else if (child && typeof child === 'object') {
      recordContextReferences(child, counts)
    }
  }
}

/** Counts structural IDs only. It intentionally never copies block text or arbitrary metadata. */
export function buildProviderRequestIdentityDiagnostics(input: {
  sourceBlocks: readonly StructuralBlock[]
  editableBlockIds: readonly string[]
  protectedBlockIds?: ReadonlySet<string>
  otherContext?: unknown
}): ProviderRequestIdentityDiagnostics {
  const sourceCounts = new Map<string, number>()
  const types = new Map<string, Set<string>>()
  const editableCounts = new Map<string, number>()
  const protectedCounts = new Map<string, number>()
  const contextCounts = new Map<string, number>()

  for (const id of input.editableBlockIds) editableCounts.set(id, (editableCounts.get(id) ?? 0) + 1)
  recordContextReferences(input.otherContext, contextCounts)

  for (const block of input.sourceBlocks) {
    sourceCounts.set(block.blockId, (sourceCounts.get(block.blockId) ?? 0) + 1)
    if (typeof block.kind === 'string') {
      const set = types.get(block.blockId) ?? new Set<string>()
      set.add(block.kind)
      types.set(block.blockId, set)
    }
    const modelContext = block.modelContext && typeof block.modelContext === 'object'
      ? block.modelContext as Record<string, unknown>
      : undefined
    if (input.protectedBlockIds?.has(block.blockId) || modelContext?.modelEditable === false) {
      protectedCounts.set(block.blockId, (protectedCounts.get(block.blockId) ?? 0) + 1)
    }
    if (modelContext) recordContextReferences(modelContext, contextCounts)
  }

  const allIds = new Set([...sourceCounts.keys(), ...editableCounts.keys(), ...protectedCounts.keys(), ...contextCounts.keys()])
  const editableAllowlistIdCounts = [...editableCounts].map(([blockId, occurrenceCount]) => ({ blockId, occurrenceCount }))
  return {
    sourceIdCounts: [...allIds].map((blockId) => ({
      blockId,
      sourceOccurrenceCount: sourceCounts.get(blockId) ?? 0,
      structuralTypes: [...(types.get(blockId) ?? [])],
      editableTargetOccurrenceCount: editableCounts.get(blockId) ?? 0,
      protectedReferenceOccurrenceCount: protectedCounts.get(blockId) ?? 0,
      otherModelContextReferenceCount: contextCounts.get(blockId) ?? 0,
    })),
    editableAllowlistIdCounts,
    duplicateEditableIds: editableAllowlistIdCounts.filter((entry) => entry.occurrenceCount > 1),
    totalUniqueEditableIds: editableCounts.size,
    totalEditableTargetEntries: input.editableBlockIds.length,
  }
}
