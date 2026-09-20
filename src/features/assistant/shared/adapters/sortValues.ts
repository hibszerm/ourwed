import { getConcept, type ConceptKey } from '../registry'
import {
  WeddingReadContext,
  type WeddingReadContextOverrides,
} from './WeddingReadContext'
import { inspectConcept } from './inspectAdapters'
import type { ConceptScalarValue } from './types'

export async function getConceptSortValue(
  weddingId: string,
  concept: ConceptKey,
  options?: WeddingReadContextOverrides,
): Promise<ConceptScalarValue> {
  if (
    !(getConcept(concept).operations as readonly string[]).includes('sort')
  ) {
    throw new Error(`Concept is not sortable: ${concept}`)
  }
  const inspected = await inspectConcept(
    new WeddingReadContext(weddingId, options),
    concept,
  )
  const value = inspected.value
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  return null
}

export const getSortableConceptValue = getConceptSortValue
export const getSortValue = getConceptSortValue
