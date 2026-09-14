/**
 * V6-F1 — ConversationCollection + ephemeral session store.
 * ONE conversational SoT for V6. Isolated from V3/V5.
 */

import type {
  CollectionSemanticDefinition,
  V6CollectionSource,
  V6Sort,
} from '../semantics/types'

export type CollectionHandle = string

export type CollectionLineageEntry = {
  parentHandle: CollectionHandle | null
  opSummary: string
  atTurn: string
}

export type ConversationCollection = {
  handle: CollectionHandle
  source: V6CollectionSource
  semanticDefinition: CollectionSemanticDefinition
  ordering: V6Sort | null
  totalCount: number
  parentHandle: CollectionHandle | null
  lineage: CollectionLineageEntry[]
  createdAtTurn: string
  revision: number
  fetchedAt: string
  /** Application-owned referential identity of what the user saw. */
  snapshotMemberIds: string[]
  /** Safe preview for model context (no internal-only fields beyond display). */
  preview: Array<{
    displayName: string
    date: string | null
    ordinal: number
  }>
}

export type V6CollectionStoreApi = {
  create: (
    input: Omit<
      ConversationCollection,
      'handle' | 'revision' | 'lineage'
    > & { lineage?: CollectionLineageEntry[] },
  ) => ConversationCollection
  get: (handle: CollectionHandle) => ConversationCollection | null
  setActive: (handle: CollectionHandle | null) => void
  getActive: () => ConversationCollection | null
  listRecent: (limit?: number) => ConversationCollection[]
  clear: () => void
}

type StoreState = {
  byHandle: Map<CollectionHandle, ConversationCollection>
  order: CollectionHandle[]
  active: CollectionHandle | null
  seq: number
}

function createEmptyState(): StoreState {
  return {
    byHandle: new Map(),
    order: [],
    active: null,
    seq: 0,
  }
}

let state: StoreState = createEmptyState()

/**
 * Ephemeral frontend session store.
 * API shaped so a later server-side store can keep SemanticAction contracts.
 */
export function createV6CollectionStore(
  initial?: StoreState,
): V6CollectionStoreApi {
  const s = initial ?? state
  return {
    create(input) {
      s.seq += 1
      const handle = `col_${s.seq}`
      const col: ConversationCollection = {
        ...input,
        handle,
        revision: 1,
        lineage: input.lineage ?? [],
      }
      s.byHandle.set(handle, col)
      s.order.push(handle)
      s.active = handle
      return col
    },
    get(handle) {
      return s.byHandle.get(handle) ?? null
    },
    setActive(handle) {
      if (handle == null) {
        s.active = null
        return
      }
      if (!s.byHandle.has(handle)) return
      s.active = handle
    },
    getActive() {
      if (!s.active) return null
      return s.byHandle.get(s.active) ?? null
    },
    listRecent(limit = 5) {
      const handles = s.order.slice(-Math.max(1, limit))
      return handles
        .map((h) => s.byHandle.get(h))
        .filter((c): c is ConversationCollection => Boolean(c))
        .reverse()
    },
    clear() {
      s.byHandle.clear()
      s.order = []
      s.active = null
      s.seq = 0
    },
  }
}

/** Process-wide V6 session store (Assistant open lifetime). */
export const v6CollectionStore: V6CollectionStoreApi = createV6CollectionStore(state)

export function destroyV6CollectionSession(): void {
  v6CollectionStore.clear()
}

/** Hard invariant for refine/exclude/slice children. */
export function assertSnapshotSubset(
  childIds: readonly string[],
  parentIds: readonly string[],
): boolean {
  const parent = new Set(parentIds)
  return childIds.every((id) => parent.has(id))
}
