import type { ConceptKey } from './concepts'

export type ConceptResource = 'WEDDING' | 'SESSION'
export type ConceptReturnType =
  | 'string'
  | 'number'
  | 'money'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'list'
export type ConceptPrivacy = 'META' | 'BIZ' | 'FIN' | 'PII' | 'SENS'
export type ConceptOperation =
  | 'inspect'
  | 'filter'
  | 'sort'
  | 'aggregate_sum'
  | 'aggregate_count'
  | 'list_related'
export type ConceptMissingPolicy =
  'null' | 'false' | 'zero' | 'empty_list' | 'unsupported'
export type ConceptFilterShape =
  'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'
export type ConceptCostClass = 'cheap' | 'batch' | 'expensive'

export type AdapterId =
  | 'wedding.date'
  | 'wedding.display_name'
  | 'wedding.status'
  | 'wedding.primary_location'
  | 'wedding.ceremony_time_scalar'
  | 'contact.bride_name'
  | 'contact.groom_name'
  | 'contact.bride_phone'
  | 'contact.groom_phone'
  | 'contact.bride_email'
  | 'contact.groom_email'
  | 'contact.bride_address'
  | 'contact.groom_address'
  | 'contact.extra_contacts'
  | 'place.ceremony_place'
  | 'place.ceremony_address'
  | 'place.reception_place'
  | 'place.reception_address'
  | 'place.bride_prep_place'
  | 'place.bride_prep_address'
  | 'place.groom_prep_place'
  | 'place.groom_prep_address'
  | 'ops.ceremony_time'
  | 'ops.bride_prep_time'
  | 'ops.groom_prep_time'
  | 'ops.reception_time'
  | 'ops.day_plan_stops'
  | 'pkg.name'
  | 'pkg.coverage_hours'
  | 'pkg.items'
  | 'pkg.extras'
  | 'pkg.extras_total'
  | 'fin.contract_value'
  | 'fin.agreed_deposit'
  | 'fin.total_paid'
  | 'fin.remaining_to_pay'
  | 'fin.remaining_after_deposit'
  | 'fin.deposit_paid_amount'
  | 'fin.deposit_paid'
  | 'fin.deposit_status'
  | 'fin.final_payment_due_date'
  | 'fin.payment_schedule'
  | 'fin.currency'
  | 'contract.status'
  | 'contract.generated_at'
  | 'contract.signed_at'
  | 'contract.signed'
  | 'contract.readiness'
  | 'task.open_count'
  | 'task.has_open'
  | 'task.overdue_count'
  | 'task.has_overdue'
  | 'task.next_due_date'
  | 'task.open_list'
  | 'delivery.due_date'
  | 'delivery.state'
  | 'q.contract_status'
  | 'q.prewedding_status'
  | 'q.contract_completed'
  | 'q.prewedding_completed'
  | 'session.has_any'
  | 'session.count'
  | 'session.list'
  | 'session.date'
  | 'session.display_name'
  | 'session.type'
  | 'session.start_time'
  | 'session.end_time'
  | 'session.location_summary'
  | 'session.total_price'
  | 'session.deposit_amount'
  | 'session.total_paid'
  | 'session.remaining_to_pay'
  | 'session.has_linked_wedding'
  | 'session.linked_wedding'
  | 'travel.fee_status'
  | 'travel.effective_fee'
  | 'travel.resolved'
  | 'logistics.route_complete'
  | 'logistics.totals_complete'
  | 'logistics.total_distance_km'
  | 'logistics.total_drive_duration_min'
  | 'logistics.has_studio_start'
  | 'logistics.return_leg_included'
  | 'logistics.longest_leg'
  | 'logistics.route_legs'
  | 'logistics.route_stops'
  | 'workflow.stage'
  | 'workflow.stage_label'

export type RelationKey =
  | 'TASKS_OPEN'
  | 'PAYMENTS'
  | 'SESSIONS'
  | 'EXTRAS'
  | 'PACKAGE_ITEMS'
  | 'EXTRA_CONTACTS'
  | 'DAY_PLAN_STOPS'
  | 'LINKED_WEDDING'
  | 'ROUTE_LEGS'
  | 'ROUTE_STOPS'

/**
 * TKey breaks the declaration-time cycle while concepts.ts derives ConceptKey.
 * Consumers use the default and therefore receive the closed ConceptKey union.
 */
export type BusinessConceptDefinition<TKey extends string = ConceptKey> = {
  key: TKey
  resource: ConceptResource
  semanticDescription: string
  returnType: ConceptReturnType
  enumValues?: readonly string[]
  privacy: ConceptPrivacy
  operations: readonly ConceptOperation[]
  adapterId: AdapterId
  missingPolicy: ConceptMissingPolicy
  filterShape?: ConceptFilterShape | readonly ConceptFilterShape[]
  sortKey?: boolean
  relationKey?: RelationKey
  plannerVisible: boolean
  valueReaches: readonly ('executor' | 'observation' | 'renderer')[]
  costClass: ConceptCostClass
  polishLabel: string
}
