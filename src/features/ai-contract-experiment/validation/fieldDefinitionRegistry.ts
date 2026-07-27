/**
 * Canonical closed field registry — single source for validation, UI, readiness, render.
 */

import type { ContractFieldKey } from '../types'
import type { ValueShape } from './valueShapeClassifier'

export type FieldCategory =
  | 'identity'
  | 'contact'
  | 'date'
  | 'location'
  | 'money'
  | 'money_words'
  | 'payment_date'

export type FieldValueType =
  | 'person_name'
  | 'address'
  | 'phone'
  | 'date'
  | 'location'
  | 'money'
  | 'money_words'

export type SemanticFamily =
  | 'identity'
  | 'contact_address'
  | 'contact_phone'
  | 'dates'
  | 'locations'
  | 'money_numeric'
  | 'money_words'

export type ReplacementPolicy = 'auto' | 'context_sensitive' | 'manual_by_default'

export type ContractFieldDefinition = {
  key: ContractFieldKey
  category: FieldCategory
  valueType: FieldValueType
  semanticFamily: SemanticFamily
  acceptedValueShapes: ValueShape[]
  logicalRole: string
  targetValueResolver: string
  replacementPolicy: ReplacementPolicy
  allowedContextSignals: RegExp[]
  contradictoryContextSignals: RegExp[]
  pairKey?: ContractFieldKey
  valueFamily?: string
  /** Minimum allowedHits required to assign this role (context-sensitive fields). */
  minPositiveEvidence?: number
}

const DATE_EXECUTION = [/zawart/i, /podpis/i, /sporządz/i, /sporzadz/i, /dnia\s+zawarcia/i]
const DATE_WEDDING = [
  /wydarzen/i,
  /ślub/i,
  /slub/i,
  /uroczyst/i,
  /ceremoni/i,
  /przyjęc/i,
  /przyjec/i,
  /odbywających\s+się\s+w\s+dniu/i,
]
const DATE_DEPOSIT = [/zadatek.*dn/i, /termin.*zadatk/i, /zalicz.*dn/i]
const DATE_PAYMENT = [/płatnoś/i, /platnos/i, /rat[ay]/i, /przelew/i]
const DATE_FINAL = [/zapłaci/i, /zaplaci/i, /najpóźniej\s+w\s+dniu/i, /termin\s+płatności/i]
const DATE_RELATIVE_RULE = [/w\s+terminie\s+\d+\s+dni/i]

const MONEY_TOTAL = [
  /wynagrodzen/i,
  /łączn/i,
  /laczn/i,
  /kwot.*umow/i,
  /ryczałt/i,
  /ryczalt/i,
  /wartoś.*umow/i,
]
const MONEY_DEPOSIT = [/zadatek/i, /zalicz/i, /wpłat.*wstępn/i]
const MONEY_REMAINING = [
  /pozostał/i,
  /pozostal/i,
  /pomniejszon/i,
  /reszt/i,
  /po\s+zadatku/i,
  /tj\.\s*kwot/i,
]

const LOC_PREP = [/przygotow/i, /przygotowani/i]
const LOC_CEREMONY = [/ceremoni/i, /zaślubin/i, /zaslubin/i, /ślub/i, /slub/i]
const LOC_RECEPTION = [/przyjęc/i, /przyjec/i, /wesel/i, /sali\s+bankiet/i, /przyjęcia\s+weselnego/i]

export const CONTRACT_FIELD_DEFINITIONS: ContractFieldDefinition[] = [
  {
    key: 'couple_full_names',
    category: 'identity',
    valueType: 'person_name',
    semanticFamily: 'identity',
    acceptedValueShapes: ['person_name'],
    logicalRole: 'client_identity',
    targetValueResolver: 'clients.fullNames',
    replacementPolicy: 'auto',
    allowedContextSignals: [/zamawiaj/i, /klient/i, /narzecz/i, /państwo\s+młod/i, /pan\s+młod/i, /panna\s+młod/i],
    contradictoryContextSignals: [/wykonawc/i, /usługodawc/i, /fotograf/i, /filmowiec/i, /NIP/i, /REGON/i],
  },
  {
    key: 'client_address',
    category: 'contact',
    valueType: 'address',
    semanticFamily: 'contact_address',
    acceptedValueShapes: ['address'],
    logicalRole: 'client_address',
    targetValueResolver: 'clients[0].address',
    replacementPolicy: 'auto',
    allowedContextSignals: [/adres/i, /zam\./i, /zamieszkał/i, /zamieszkal/i, /mieszka/i, /ul\./i],
    contradictoryContextSignals: [/wykonawc/i, /usługodawc/i, /siedzib/i, /NIP/i],
  },
  {
    key: 'client_phone',
    category: 'contact',
    valueType: 'phone',
    semanticFamily: 'contact_phone',
    acceptedValueShapes: ['phone'],
    logicalRole: 'client_phone',
    targetValueResolver: 'clients[0].phone',
    replacementPolicy: 'auto',
    allowedContextSignals: [/tel/i, /telefon/i, /kom\./i, /nr\s+tel/i],
    contradictoryContextSignals: [/wykonawc/i, /usługodawc/i, /NIP/i],
  },
  {
    key: 'contract_execution_date',
    category: 'date',
    valueType: 'date',
    semanticFamily: 'dates',
    acceptedValueShapes: ['date'],
    logicalRole: 'contract_execution_date',
    targetValueResolver: 'currentDate',
    replacementPolicy: 'auto',
    allowedContextSignals: DATE_EXECUTION,
    contradictoryContextSignals: DATE_WEDDING,
  },
  {
    key: 'wedding_date',
    category: 'date',
    valueType: 'date',
    semanticFamily: 'dates',
    acceptedValueShapes: ['date'],
    logicalRole: 'wedding_event_date',
    minPositiveEvidence: 1,
    targetValueResolver: 'weddingDate',
    replacementPolicy: 'auto',
    allowedContextSignals: DATE_WEDDING,
    contradictoryContextSignals: [...DATE_EXECUTION, ...DATE_FINAL, ...DATE_DEPOSIT],
  },
  {
    key: 'deposit_due_date',
    category: 'payment_date',
    valueType: 'date',
    semanticFamily: 'dates',
    acceptedValueShapes: ['date'],
    logicalRole: 'deposit_due_date',
    minPositiveEvidence: 1,
    targetValueResolver: 'finances.payments.deposit.dueDate',
    replacementPolicy: 'context_sensitive',
    allowedContextSignals: DATE_DEPOSIT,
    contradictoryContextSignals: [...DATE_WEDDING, ...DATE_RELATIVE_RULE],
  },
  {
    key: 'payment_due_date',
    category: 'payment_date',
    valueType: 'date',
    semanticFamily: 'dates',
    acceptedValueShapes: ['date'],
    logicalRole: 'intermediate_payment_date',
    minPositiveEvidence: 1,
    targetValueResolver: 'finances.payments[0].dueDate',
    replacementPolicy: 'context_sensitive',
    allowedContextSignals: DATE_PAYMENT,
    contradictoryContextSignals: DATE_WEDDING,
  },
  {
    key: 'final_payment_due_date',
    category: 'payment_date',
    valueType: 'date',
    semanticFamily: 'dates',
    acceptedValueShapes: ['date'],
    logicalRole: 'final_payment_date',
    minPositiveEvidence: 1,
    targetValueResolver: 'finances.payments.final.dueDate',
    replacementPolicy: 'context_sensitive',
    allowedContextSignals: DATE_FINAL,
    contradictoryContextSignals: [...DATE_WEDDING, ...DATE_RELATIVE_RULE],
  },
  {
    key: 'preparation_location',
    category: 'location',
    valueType: 'location',
    semanticFamily: 'locations',
    acceptedValueShapes: ['location', 'address', 'unknown'],
    logicalRole: 'preparation_venue',
    minPositiveEvidence: 1,
    targetValueResolver: 'locations.preparation',
    replacementPolicy: 'context_sensitive',
    allowedContextSignals: LOC_PREP,
    contradictoryContextSignals: [/wykonawc/i, /NIP/i],
  },
  {
    key: 'ceremony_location',
    category: 'location',
    valueType: 'location',
    semanticFamily: 'locations',
    acceptedValueShapes: ['location', 'address', 'unknown'],
    logicalRole: 'ceremony_venue',
    minPositiveEvidence: 1,
    targetValueResolver: 'locations.ceremony',
    replacementPolicy: 'context_sensitive',
    allowedContextSignals: LOC_CEREMONY,
    contradictoryContextSignals: [/wykonawc/i, /NIP/i],
  },
  {
    key: 'reception_location',
    category: 'location',
    valueType: 'location',
    semanticFamily: 'locations',
    acceptedValueShapes: ['location', 'address', 'unknown'],
    logicalRole: 'reception_venue',
    minPositiveEvidence: 1,
    targetValueResolver: 'locations.reception',
    replacementPolicy: 'context_sensitive',
    allowedContextSignals: LOC_RECEPTION,
    contradictoryContextSignals: [/wykonawc/i, /NIP/i],
  },
  {
    key: 'contract_value_formatted',
    category: 'money',
    valueType: 'money',
    semanticFamily: 'money_numeric',
    acceptedValueShapes: ['money_numeric'],
    logicalRole: 'total_contract_value_numeric',
    targetValueResolver: 'finances.contractValueFormatted',
    replacementPolicy: 'auto',
    allowedContextSignals: MONEY_TOTAL,
    contradictoryContextSignals: MONEY_DEPOSIT,
    pairKey: 'contract_value_words',
    valueFamily: 'contract_total',
  },
  {
    key: 'contract_value_words',
    category: 'money_words',
    valueType: 'money_words',
    semanticFamily: 'money_words',
    acceptedValueShapes: ['money_words'],
    logicalRole: 'total_contract_value_words',
    targetValueResolver: 'finances.contractValueWords',
    replacementPolicy: 'auto',
    allowedContextSignals: [...MONEY_TOTAL, /słownie/i, /slownie/i],
    contradictoryContextSignals: MONEY_DEPOSIT,
    pairKey: 'contract_value_formatted',
    valueFamily: 'contract_total',
  },
  {
    key: 'agreed_deposit_formatted',
    category: 'money',
    valueType: 'money',
    semanticFamily: 'money_numeric',
    acceptedValueShapes: ['money_numeric'],
    logicalRole: 'deposit_numeric',
    targetValueResolver: 'finances.depositAmountFormatted',
    replacementPolicy: 'auto',
    allowedContextSignals: MONEY_DEPOSIT,
    contradictoryContextSignals: MONEY_TOTAL,
    pairKey: 'agreed_deposit_words',
    valueFamily: 'deposit',
  },
  {
    key: 'agreed_deposit_words',
    category: 'money_words',
    valueType: 'money_words',
    semanticFamily: 'money_words',
    acceptedValueShapes: ['money_words'],
    logicalRole: 'deposit_words',
    targetValueResolver: 'finances.depositAmountWords',
    replacementPolicy: 'auto',
    allowedContextSignals: [...MONEY_DEPOSIT, /słownie/i, /slownie/i],
    contradictoryContextSignals: MONEY_TOTAL,
    pairKey: 'agreed_deposit_formatted',
    valueFamily: 'deposit',
  },
  {
    key: 'remaining_after_deposit_formatted',
    category: 'money',
    valueType: 'money',
    semanticFamily: 'money_numeric',
    acceptedValueShapes: ['money_numeric'],
    logicalRole: 'remaining_numeric',
    targetValueResolver: 'finances.remainingAmountFormatted',
    replacementPolicy: 'auto',
    allowedContextSignals: MONEY_REMAINING,
    contradictoryContextSignals: MONEY_DEPOSIT,
    pairKey: 'remaining_after_deposit_words',
    valueFamily: 'remaining',
  },
  {
    key: 'remaining_after_deposit_words',
    category: 'money_words',
    valueType: 'money_words',
    semanticFamily: 'money_words',
    acceptedValueShapes: ['money_words'],
    logicalRole: 'remaining_words',
    targetValueResolver: 'finances.remainingAmountWords',
    replacementPolicy: 'auto',
    allowedContextSignals: [...MONEY_REMAINING, /słownie/i, /slownie/i],
    contradictoryContextSignals: MONEY_DEPOSIT,
    pairKey: 'remaining_after_deposit_formatted',
    valueFamily: 'remaining',
  },
]

const BY_KEY = new Map(CONTRACT_FIELD_DEFINITIONS.map((d) => [d.key, d]))

export function getFieldDefinition(key: ContractFieldKey): ContractFieldDefinition {
  const def = BY_KEY.get(key)
  if (!def) throw new Error(`Unknown field key: ${key}`)
  return def
}

export function allFieldDefinitionKeys(): ContractFieldKey[] {
  return CONTRACT_FIELD_DEFINITIONS.map((d) => d.key)
}

export function fieldsInValueFamily(family: string): ContractFieldDefinition[] {
  return CONTRACT_FIELD_DEFINITIONS.filter((d) => d.valueFamily === family)
}
