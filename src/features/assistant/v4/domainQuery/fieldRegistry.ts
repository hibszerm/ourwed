/**
 * G0 — Semantic Field Registry.
 * Closed domain concepts → authoritative OurWed resolvers.
 * No question-shaped fields. No DB table/column names.
 */

export type SemanticEntityId = 'wedding' | 'place'

export type SemanticValueType =
  | 'local_date'
  | 'money'
  | 'text'
  | 'enum'

export type FilterOperator =
  | 'eq'
  | 'contains'
  | 'in_range'
  | 'in'

export type AggregateOperator = 'count' | 'sum' | 'min' | 'max' | 'avg'

/** Closed G0 semantic field ids. */
export const SEMANTIC_FIELD_IDS = [
  'wedding.date',
  'wedding.contract_value',
  'wedding.paid_amount',
  'wedding.remaining_amount',
  'place.name',
  'place.role',
] as const

export type SemanticFieldId = (typeof SEMANTIC_FIELD_IDS)[number]

export type PlaceRoleValue =
  | 'preparations'
  | 'ceremony'
  | 'reception'
  | 'any'

/**
 * Primary DomainQuery collection this field owns when used as measure / date
 * dimension / similar. Distinct from `entity` (e.g. place.name has entity=place
 * but must NOT imply DomainQuery.source=place).
 *
 * null = relation/filter field only; does not set primary collection source.
 * Aligns with DomainQuerySource values currently in the G0/G7 slice.
 */
export type FieldCollectionSource = 'wedding'

export type SemanticFieldDefinition = {
  id: SemanticFieldId
  entity: SemanticEntityId
  /**
   * Primary collection ownership for DomainQuery.source resolution.
   * Never confuse with `entity` (relation entities stay null here).
   */
  collectionSource: FieldCollectionSource | null
  valueType: SemanticValueType
  filterOperators: readonly FilterOperator[]
  aggregateOperators: readonly AggregateOperator[]
  sortable: boolean
  groupable: boolean
  /** True when this field may bind a DomainQuery dateBinding.dimension. */
  isDateDimension: boolean
  /**
   * Authoritative SoT mapping (application code, not model-facing).
   * Documented for humans / validators — execution uses trusted adapters.
   */
  sot: string
}

const MONEY_AGGS = ['sum', 'min', 'max', 'avg'] as const satisfies readonly AggregateOperator[]

export const SEMANTIC_FIELD_REGISTRY: Record<
  SemanticFieldId,
  SemanticFieldDefinition
> = {
  'wedding.date': {
    id: 'wedding.date',
    entity: 'wedding',
    collectionSource: 'wedding',
    valueType: 'local_date',
    filterOperators: ['eq', 'in_range'],
    aggregateOperators: ['count'],
    sortable: true,
    groupable: true,
    isDateDimension: true,
    sot: 'wedding.date → toLocalCalendarDateKey',
  },
  'wedding.contract_value': {
    id: 'wedding.contract_value',
    entity: 'wedding',
    collectionSource: 'wedding',
    valueType: 'money',
    filterOperators: ['eq'],
    aggregateOperators: MONEY_AGGS,
    sortable: true,
    groupable: false,
    isDateDimension: false,
    sot: 'getContractValue(wedding)',
  },
  'wedding.paid_amount': {
    id: 'wedding.paid_amount',
    entity: 'wedding',
    collectionSource: 'wedding',
    valueType: 'money',
    filterOperators: ['eq'],
    aggregateOperators: MONEY_AGGS,
    sortable: true,
    groupable: false,
    isDateDimension: false,
    sot: 'getTotalPaid(wedding.payments)',
  },
  'wedding.remaining_amount': {
    id: 'wedding.remaining_amount',
    entity: 'wedding',
    collectionSource: 'wedding',
    valueType: 'money',
    filterOperators: ['eq'],
    aggregateOperators: MONEY_AGGS,
    sortable: true,
    groupable: false,
    isDateDimension: false,
    sot: 'getRemainingToPay(getContractValue(w), payments)',
  },
  'place.name': {
    id: 'place.name',
    entity: 'place',
    collectionSource: null,
    valueType: 'text',
    filterOperators: ['eq', 'contains'],
    aggregateOperators: ['count'],
    sortable: false,
    groupable: true,
    isDateDimension: false,
    sot: 'list-light place hydrate + locationMatch normalize',
  },
  'place.role': {
    id: 'place.role',
    entity: 'place',
    collectionSource: null,
    valueType: 'enum',
    filterOperators: ['eq', 'in'],
    aggregateOperators: ['count'],
    sortable: false,
    groupable: true,
    isDateDimension: false,
    sot: 'place role family: preparations|ceremony|reception|any',
  },
}

export function getSemanticField(
  id: string,
): SemanticFieldDefinition | null {
  if ((SEMANTIC_FIELD_IDS as readonly string[]).includes(id)) {
    return SEMANTIC_FIELD_REGISTRY[id as SemanticFieldId]
  }
  return null
}

export function isSemanticFieldId(id: unknown): id is SemanticFieldId {
  return typeof id === 'string' && (SEMANTIC_FIELD_IDS as readonly string[]).includes(id)
}

/** Registry ownership → primary DomainQuery collection (null = relation-only). */
export function getFieldCollectionSource(
  fieldId: string,
): FieldCollectionSource | null {
  const def = getSemanticField(fieldId)
  return def?.collectionSource ?? null
}
