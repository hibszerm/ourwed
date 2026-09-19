import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { v6CollectionStore } from '../collections/store'
import {
  getConcept,
  V6_INSPECT_MAX_CONCEPTS,
  type ConceptKey,
} from '../registry'
import {
  WeddingReadContext,
  type WeddingReadContextOverrides,
} from './WeddingReadContext'
import { inspectConcept } from './inspectAdapters'
import type { ConceptInspectValue } from './types'

export type ResourceDetailObservation = {
  kind: 'resource_detail'
  collectionHandle: string
  resource: 'WEDDING'
  weddingDisplayName: string | null
  values: Array<
    ConceptInspectValue & {
      concept: ConceptKey
      label: string
    }
  >
}

export type InspectResourceConceptsResult =
  | { ok: true; observation: ResourceDetailObservation }
  | {
      ok: false
      code:
        | 'COLLECTION_NOT_FOUND'
        | 'COLLECTION_EMPTY'
        | 'COLLECTION_AMBIGUOUS'
        | 'TOO_MANY_CONCEPTS'
        | 'UNSUPPORTED_CONCEPT'
        | 'WEDDING_NOT_FOUND'
        | 'SERVICE_ERROR'
      detail: string
    }

export async function inspectResourceConcepts(input: {
  collectionHandle: string
  concepts: ConceptKey[]
  /** Test seam; production callers omit this. */
  contextOptions?: WeddingReadContextOverrides
}): Promise<InspectResourceConceptsResult> {
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
  if (input.concepts.length > V6_INSPECT_MAX_CONCEPTS) {
    return {
      ok: false,
      code: 'TOO_MANY_CONCEPTS',
      detail: `concept_count:${input.concepts.length}`,
    }
  }
  const unsupported = input.concepts.find(
    (key) =>
      !(getConcept(key).operations as readonly string[]).includes('inspect'),
  )
  if (unsupported) {
    return {
      ok: false,
      code: 'UNSUPPORTED_CONCEPT',
      detail: `not_inspectable:${unsupported}`,
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
    const inspected = await Promise.all(
      input.concepts.map(async (concept) => ({
        concept,
        label: getConcept(concept).polishLabel,
        ...(await inspectConcept(context, concept)),
      })),
    )
    return {
      ok: true,
      observation: {
        kind: 'resource_detail',
        collectionHandle: input.collectionHandle,
        resource: 'WEDDING',
        weddingDisplayName: getWeddingDisplayName(wedding),
        values: inspected,
      },
    }
  } catch {
    return {
      ok: false,
      code: 'SERVICE_ERROR',
      detail: 'resource_inspect_failed',
    }
  }
}
