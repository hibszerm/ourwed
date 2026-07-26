/**
 * Phase B only — semantic role → wedding / studio business fields.
 * Adding DJ / florist / venue domains requires new mappings here,
 * never new Phase A semantic roles for the same document meaning.
 */

import type { ContractSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'
import { SEMANTIC_TEMPORAL_RULES } from '@/features/ai-contract-lab/semanticTemporalRules'
import type { TemporalRule } from '@/features/ai-contract-lab/semanticTemporalRules'

export type DomainMappingKind =
  | 'canonical'
  | 'derived'
  | 'generation'
  | 'package_content'

export type SemanticDomainMapping = {
  kind: DomainMappingKind
  /** Snapshot / canonical field key in this product. */
  fieldKey: string
  /** Human / debug path for UI (not a semantic role). */
  displayMapping: string
  /** Optional alternate business targets for other products. */
  alternateTargets?: string[]
  groupId?: 'PackageContentCollection'
  temporal?: TemporalRule
}

/**
 * Wedding CRM domain map.
 * Semantic `contract_value` → finances.contractValue / package.contract_value
 * — the semantic layer never names these fields.
 */
export const WEDDING_DOMAIN_MAPPINGS: Partial<
  Record<ContractSemanticRole, SemanticDomainMapping>
> = {
  wedding_date: {
    kind: 'canonical',
    fieldKey: 'wedding.date',
    displayMapping: 'wedding.date',
  },
  contract_date: {
    kind: 'generation',
    fieldKey: 'contract.execution_date',
    displayMapping: 'derived(context.contractExecutionDate)',
  },
  contract_execution_date: {
    kind: 'generation',
    fieldKey: 'contract.execution_date',
    displayMapping: 'derived(context.contractExecutionDate)',
  },
  preparation_location: {
    kind: 'canonical',
    fieldKey: 'location.bride_preparation',
    displayMapping: 'wedding.locations.preparation.contractDisplay',
    alternateTargets: ['location.bride_preparation.contract_display'],
  },
  ceremony_location: {
    kind: 'canonical',
    fieldKey: 'location.ceremony',
    displayMapping: 'wedding.locations.ceremony.contractDisplay',
    alternateTargets: ['location.ceremony.contract_display'],
  },
  reception_location: {
    kind: 'canonical',
    fieldKey: 'location.reception',
    displayMapping: 'wedding.locations.reception.contractDisplay',
    alternateTargets: ['location.reception.contract_display'],
  },
  church: {
    kind: 'canonical',
    fieldKey: 'location.ceremony',
    displayMapping: 'wedding.locations.ceremony.contractDisplay',
    alternateTargets: ['location.ceremony.contract_display'],
  },
  civil_office: {
    kind: 'canonical',
    fieldKey: 'location.ceremony',
    displayMapping: 'wedding.locations.ceremony.contractDisplay',
    alternateTargets: ['location.ceremony.contract_display'],
  },
  package_name: {
    kind: 'canonical',
    fieldKey: 'package.name',
    displayMapping: 'package.name',
  },
  contract_value: {
    kind: 'canonical',
    fieldKey: 'package.contract_value',
    displayMapping: 'finances.contractValue',
    alternateTargets: ['package.price', 'finances.contractValue'],
  },
  deposit_amount: {
    kind: 'canonical',
    fieldKey: 'payments.agreed_deposit',
    displayMapping: 'finances.deposit.amount',
  },
  remaining_amount: {
    kind: 'canonical',
    fieldKey: 'payments.remaining',
    displayMapping: 'finances.remaining',
  },
  bank_account: {
    kind: 'canonical',
    fieldKey: 'company.bank_account',
    displayMapping: 'business.bankAccount',
  },
  company_name: {
    kind: 'canonical',
    fieldKey: 'company.legal_name',
    displayMapping: 'business.name',
  },
  company_tax_id: {
    kind: 'canonical',
    fieldKey: 'company.nip',
    displayMapping: 'business.nip',
  },
  company_registration_number: {
    kind: 'canonical',
    fieldKey: 'company.regon',
    displayMapping: 'business.regon',
  },
  company_address: {
    kind: 'canonical',
    fieldKey: 'company.address',
    displayMapping: 'business.address',
  },
  company_phone: {
    kind: 'canonical',
    fieldKey: 'company.phone',
    displayMapping: 'business.primaryPhone',
    alternateTargets: ['vendor.phone', 'studio.phone'],
  },
  company_email: {
    kind: 'canonical',
    fieldKey: 'company.email',
    displayMapping: 'business.email',
  },
  bride_name: {
    kind: 'canonical',
    fieldKey: 'bride.full_name',
    displayMapping: 'couple.bride.fullName',
  },
  bride_first_name: {
    kind: 'canonical',
    // CRM: couple.partner1FirstName (client 1 / Panna Młoda)
    fieldKey: 'bride.first_name',
    displayMapping: 'wedding.client1.firstName',
  },
  bride_last_name: {
    kind: 'canonical',
    fieldKey: 'bride.last_name',
    displayMapping: 'wedding.client1.lastName',
  },
  groom_name: {
    kind: 'canonical',
    fieldKey: 'groom.full_name',
    displayMapping: 'couple.groom.fullName',
  },
  groom_first_name: {
    kind: 'canonical',
    // CRM: couple.partner2FirstName (client 2 / Pan Młody)
    fieldKey: 'groom.first_name',
    displayMapping: 'wedding.client2.firstName',
  },
  groom_last_name: {
    kind: 'canonical',
    fieldKey: 'groom.last_name',
    displayMapping: 'wedding.client2.lastName',
  },
  client_name: {
    kind: 'canonical',
    fieldKey: 'bride.full_name',
    displayMapping: 'couple.bride.fullName',
  },
  bride_phone: {
    kind: 'canonical',
    fieldKey: 'bride.phone',
    displayMapping: 'couple.bride.phone',
  },
  groom_phone: {
    kind: 'canonical',
    fieldKey: 'groom.phone',
    displayMapping: 'couple.groom.phone',
  },
  client_phone: {
    kind: 'canonical',
    fieldKey: 'bride.phone',
    displayMapping: 'couple.bride.phone',
  },
  bride_email: {
    kind: 'canonical',
    fieldKey: 'bride.email',
    displayMapping: 'couple.bride.email',
  },
  groom_email: {
    kind: 'canonical',
    fieldKey: 'groom.email',
    displayMapping: 'couple.groom.email',
  },
  client_email: {
    kind: 'canonical',
    fieldKey: 'bride.email',
    displayMapping: 'couple.bride.email',
  },
  bride_address: {
    kind: 'canonical',
    fieldKey: 'bride.address',
    displayMapping: 'couple.bride.address',
  },
  groom_address: {
    kind: 'canonical',
    fieldKey: 'groom.address',
    displayMapping: 'couple.groom.address',
  },
  package_duration: {
    kind: 'canonical',
    fieldKey: 'package.coverage_hours',
    displayMapping: 'package.coverageHours',
  },
  coverage_end_time: {
    kind: 'canonical',
    fieldKey: 'package.coverage_end_time',
    displayMapping: 'package.coverageEndTime',
  },
  package_overtime_rate: {
    kind: 'canonical',
    fieldKey: 'package.overtime_rate',
    displayMapping: 'package.overtimeRate',
  },
  package_item: {
    kind: 'package_content',
    fieldKey: 'package.contents',
    displayMapping: 'package.contents',
    groupId: 'PackageContentCollection',
  },
  payment_due_date: {
    kind: 'derived',
    fieldKey: 'derived.final_payment_due_on_wedding_date',
    displayMapping: 'derived(wedding.date)',
    temporal: SEMANTIC_TEMPORAL_RULES.payment_due_date,
  },
  delivery_deadline: {
    kind: 'derived',
    fieldKey: 'derived.delivery_deadline',
    displayMapping: 'relative(wedding.date + deliveryMonths)',
    temporal: SEMANTIC_TEMPORAL_RULES.delivery_deadline,
  },
  preview_deadline: {
    kind: 'derived',
    fieldKey: 'derived.preview_deadline',
    displayMapping: 'relative(wedding.date + previewDays)',
    temporal: SEMANTIC_TEMPORAL_RULES.preview_deadline,
  },
  deposit_due_date: {
    kind: 'derived',
    fieldKey: 'derived.deposit_due_from_contract_date',
    displayMapping: 'relative(contract.executionDate + 7d)',
    temporal: SEMANTIC_TEMPORAL_RULES.deposit_due_date,
  },
}

export function resolveDomainMapping(
  role: ContractSemanticRole,
): SemanticDomainMapping | undefined {
  return WEDDING_DOMAIN_MAPPINGS[role]
}
