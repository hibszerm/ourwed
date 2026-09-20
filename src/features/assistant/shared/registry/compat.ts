import type { WeddingPlaceDetailSelector } from '../detail/weddingPlaceDetail'
import {
  V6_BUSINESS_CONCEPTS,
  getConcept,
  isConceptKey,
  type ConceptKey,
} from './concepts'
import type { ConceptOperation } from './types'

export const DR1_SELECTOR_TO_CONCEPT: Record<
  WeddingPlaceDetailSelector,
  ConceptKey
> = {
  ceremony_place: 'PLACE.CEREMONY_PLACE',
  ceremony_address: 'PLACE.CEREMONY_ADDRESS',
  reception_place: 'PLACE.RECEPTION_PLACE',
  reception_address: 'PLACE.RECEPTION_ADDRESS',
  bride_preparation_place: 'PLACE.BRIDE_PREP_PLACE',
  bride_preparation_address: 'PLACE.BRIDE_PREP_ADDRESS',
  groom_preparation_place: 'PLACE.GROOM_PREP_PLACE',
  groom_preparation_address: 'PLACE.GROOM_PREP_ADDRESS',
}

export const CONCEPT_TO_DR1_SELECTOR: Partial<
  Record<ConceptKey, WeddingPlaceDetailSelector>
> = Object.fromEntries(
  Object.entries(DR1_SELECTOR_TO_CONCEPT).map(([selector, concept]) => [
    concept,
    selector,
  ]),
) as Partial<Record<ConceptKey, WeddingPlaceDetailSelector>>

export const MONEY_MEASURE_TO_CONCEPT = {
  contract_value: 'FIN.CONTRACT_VALUE',
  paid_amount: 'FIN.TOTAL_PAID',
  remaining_amount: 'FIN.REMAINING_TO_PAY',
} as const satisfies Record<string, ConceptKey>

export type V6MoneyMeasure = keyof typeof MONEY_MEASURE_TO_CONCEPT

export const CONCEPT_TO_MONEY_MEASURE = Object.fromEntries(
  Object.entries(MONEY_MEASURE_TO_CONCEPT).map(([measure, concept]) => [
    concept,
    measure,
  ]),
) as {
  [K in V6MoneyMeasure as (typeof MONEY_MEASURE_TO_CONCEPT)[K]]: K
}

function supportsOperation(
  key: ConceptKey,
  operation: ConceptOperation,
): boolean {
  return (getConcept(key).operations as readonly ConceptOperation[]).includes(
    operation,
  )
}

function resolveCompatibleConcept(
  value: string,
  operation: ConceptOperation,
): ConceptKey | null {
  if (isConceptKey(value) && supportsOperation(value, operation)) {
    return value
  }

  const byAdapter = V6_BUSINESS_CONCEPTS.find(
    (concept) =>
      concept.adapterId === value &&
      (concept.operations as readonly ConceptOperation[]).includes(operation),
  )
  return byAdapter?.key ?? null
}

export function resolveSortConcept(field: string): ConceptKey | null {
  const moneyConcept = MONEY_MEASURE_TO_CONCEPT[field as V6MoneyMeasure] ?? null
  if (moneyConcept && supportsOperation(moneyConcept, 'sort')) {
    return moneyConcept
  }
  return resolveCompatibleConcept(field, 'sort')
}

export function resolveAggregateConcept(
  measure: string | null,
): ConceptKey | null {
  if (measure == null) return null

  const moneyConcept =
    MONEY_MEASURE_TO_CONCEPT[measure as V6MoneyMeasure] ?? null
  if (moneyConcept && supportsOperation(moneyConcept, 'aggregate_sum')) {
    return moneyConcept
  }

  const sumConcept = resolveCompatibleConcept(measure, 'aggregate_sum')
  if (sumConcept) return sumConcept
  return resolveCompatibleConcept(measure, 'aggregate_count')
}
