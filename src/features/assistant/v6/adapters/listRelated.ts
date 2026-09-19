import { v6CollectionStore } from '../collections/store'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import {
  V6_LIST_RELATED_HARD_CAP,
  type RelationKey,
} from '../registry'
import {
  WeddingReadContext,
  type WeddingReadContextOverrides,
} from './WeddingReadContext'
import { listRelation } from './relationAdapters'
import type { RelatedListResult } from './types'

export type ListRelatedResult =
  | {
      ok: true
      result: RelatedListResult
      weddingDisplayName: string | null
    }
  | {
      ok: false
      code:
        | 'COLLECTION_NOT_FOUND'
        | 'COLLECTION_EMPTY'
        | 'COLLECTION_AMBIGUOUS'
        | 'WEDDING_NOT_FOUND'
        | 'SERVICE_ERROR'
      detail: string
    }

export async function listRelated(input: {
  collectionHandle: string
  relationKey: RelationKey
  limit?: number
  /** Test seam; production callers omit this. */
  contextOptions?: WeddingReadContextOverrides
}): Promise<ListRelatedResult> {
  const collection = v6CollectionStore.get(input.collectionHandle)
  if (!collection) {
    return {
      ok: false,
      code: 'COLLECTION_NOT_FOUND',
      detail: `unknown_handle:${input.collectionHandle}`,
    }
  }
  const ids = collection.snapshotMemberIds.filter(
    (id) => typeof id === 'string' && id.trim(),
  )
  if (ids.length === 0 || collection.totalCount === 0) {
    return {
      ok: false,
      code: 'COLLECTION_EMPTY',
      detail: 'zero_member_collection',
    }
  }
  if (ids.length !== 1 || collection.totalCount !== 1) {
    return {
      ok: false,
      code: 'COLLECTION_AMBIGUOUS',
      detail: `member_count:${ids.length}`,
    }
  }

  try {
    const context = new WeddingReadContext(ids[0]!, input.contextOptions)
    const wedding = await context.getWedding()
    if (!wedding) {
      return {
        ok: false,
        code: 'WEDDING_NOT_FOUND',
        detail: 'wedding_not_found',
      }
    }
    return {
      ok: true,
      weddingDisplayName: getWeddingDisplayName(wedding),
      result: await listRelation(
        context,
        input.relationKey,
        input.limit ?? V6_LIST_RELATED_HARD_CAP,
      ),
    }
  } catch {
    return {
      ok: false,
      code: 'SERVICE_ERROR',
      detail: 'related_list_failed',
    }
  }
}
