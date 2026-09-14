/**
 * V6-F1 — Restore activates an existing handle (no rematerialize).
 */

import { v6CollectionStore, type ConversationCollection } from '../collections/store'
import type { RestoreAction } from '../semantics/types'
import { toolFail, type V6ToolResult } from './errors'

export type RestoreCollectionSuccess = {
  handle: string
  totalCount: number
  preview: ConversationCollection['preview']
  restored: true
}

export function restoreCollection(
  action: RestoreAction,
): V6ToolResult<RestoreCollectionSuccess> {
  if (action.type !== 'Restore') {
    return toolFail('VALIDATION_ERROR', 'expected_restore_action')
  }
  if (!action.collection?.trim()) {
    return toolFail('VALIDATION_ERROR', 'collection_handle_missing')
  }
  const col = v6CollectionStore.get(action.collection)
  if (!col) {
    return toolFail('REFERENCE_RESOLUTION_ERROR', 'unknown_collection_handle')
  }
  v6CollectionStore.setActive(col.handle)
  return {
    ok: true,
    data: {
      handle: col.handle,
      totalCount: col.totalCount,
      preview: col.preview,
      restored: true,
    },
  }
}
