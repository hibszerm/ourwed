/**
 * V6-DR1 — Resolve wedding place detail from an exact one-member collection.
 * Uses loadOperationalWeddingDay (same SoT as V4 wedding.places.get).
 * Never accepts model-supplied wedding UUIDs.
 */

import { loadOperationalWeddingDay } from '../../v4/capabilities/loadOperationalWeddingDay'
import { v6CollectionStore } from '../collections/store'
import type { V6Observation } from '../observations/adapt'
import {
  weddingPlaceDetailField,
  weddingPlaceDetailRole,
  weddingPlaceDetailTitle,
  type V6WeddingPlaceDetailSelector,
} from './weddingPlaceDetail'

export type InspectWeddingPlaceResult =
  | { ok: true; observation: V6Observation }
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

export async function inspectWeddingPlaceDetail(input: {
  collectionHandle: string
  selector: V6WeddingPlaceDetailSelector
  /** Test seam — inject load result without CRM. */
  loadDay?: typeof loadOperationalWeddingDay
}): Promise<InspectWeddingPlaceResult> {
  const col = v6CollectionStore.get(input.collectionHandle)
  if (!col) {
    return {
      ok: false,
      code: 'COLLECTION_NOT_FOUND',
      detail: `unknown_handle:${input.collectionHandle}`,
    }
  }
  const ids = col.snapshotMemberIds.filter((id) => typeof id === 'string' && id.trim())
  if (ids.length === 0 || col.totalCount === 0) {
    return {
      ok: false,
      code: 'COLLECTION_EMPTY',
      detail: 'zero_member_collection',
    }
  }
  if (ids.length !== 1 || col.totalCount !== 1) {
    return {
      ok: false,
      code: 'COLLECTION_AMBIGUOUS',
      detail: `member_count:${ids.length}`,
    }
  }

  const weddingId = ids[0]!
  const load = input.loadDay ?? loadOperationalWeddingDay
  const day = await load(weddingId)
  if (day.status === 'not_found') {
    return { ok: false, code: 'WEDDING_NOT_FOUND', detail: 'wedding_not_found' }
  }
  if (day.status === 'error') {
    return { ok: false, code: 'SERVICE_ERROR', detail: day.safeCode }
  }

  const role = weddingPlaceDetailRole(input.selector)
  const field = weddingPlaceDetailField(input.selector)
  const slot = day.slots.find((s) => s.role === role)
  const raw = field === 'address' ? slot?.address ?? null : slot?.name ?? null
  const value =
    typeof raw === 'string' && raw.trim() ? raw.trim() : null

  return {
    ok: true,
    observation: {
      kind: 'wedding_place_detail',
      selector: input.selector,
      titleLabel: weddingPlaceDetailTitle(input.selector),
      weddingDisplayName: day.displayName || null,
      value,
      filled: value != null,
    },
  }
}
