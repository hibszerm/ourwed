/**
 * Template field mutability policy — source of truth for what AI Contract Lab
 * may adapt between weddings vs what must stay as the template owner's data.
 *
 * Normal generation runs with templateMigrationMode = false.
 */

import { normalizeSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'

export type FieldMutability =
  | 'wedding_variable'
  | 'package_variable'
  | 'template_invariant'
  | 'legal_invariant'
  | 'user_configurable'

export type PaymentMode = 'fixed' | 'variable'
export type DeliveryTermMode = 'fixed' | 'variable'

export type ContractTemplateVariableConfig = {
  /** Isolated future mode — never on during normal wedding generation. */
  templateMigrationMode?: boolean
  paymentMode: PaymentMode
  deliveryTermMode: DeliveryTermMode
  variableRoles: string[]
  invariantRoles: string[]
  sharedLocationFormat?: string
  packageFields?: {
    packageName?: boolean
    contents?: boolean
    coverageHours?: boolean
    workingTime?: boolean
    overtimeRate?: boolean
    operatorCount?: boolean
    contractValue?: boolean
  }
}

/** Roles that may change between wedding bookings. */
export const WEDDING_VARIABLE_ROLES = new Set([
  'contract_execution_date',
  'contract_date',
  'wedding_date',
  'bride_name',
  'bride_first_name',
  'bride_last_name',
  'bride_address',
  'bride_phone',
  'bride_email',
  'bride_pesel',
  'groom_name',
  'groom_first_name',
  'groom_last_name',
  'groom_address',
  'groom_phone',
  'groom_email',
  'groom_pesel',
  'client_name',
  'client_address',
  'client_phone',
  'client_email',
  'preparation_location',
  'bride_preparation_location',
  'groom_preparation_location',
  'ceremony_location',
  'reception_location',
  'wedding_location',
  'shared_wedding_location',
  'church',
  'civil_office',
  // Final payment date tied to the wedding event (not installment schedule topology).
  'payment_due_date',
  'final_payment_due_date',
])

/** Package attributes that may vary when package selection changes. */
export const PACKAGE_VARIABLE_ROLES = new Set([
  'package_name',
  'package_type',
  'package_item',
  'package_contents',
  'package_duration',
  'coverage_hours',
  'working_hours',
  'coverage_start_time',
  'coverage_end_time',
  'coverage_time_range',
  'package_overtime_rate',
  'extra_hour_price',
  'overtime_rate',
  'delivery_method',
  'delivered_material_type',
  'film_duration',
  'photo_count',
  'album',
  'gallery',
  'teaser',
  'additional_service',
])

/**
 * Payment / delivery roles — only replaceable when template config enables them.
 */
export const USER_CONFIGURABLE_ROLES = new Set([
  'contract_value',
  'package_price',
  'deposit_amount',
  'installment_amount',
  'remaining_amount',
  'payment_schedule',
  'deposit_due_date',
  'delivery_deadline',
  'delivery_duration',
  'preview_deadline',
])

/** Template-owner company / contractor identity — never adapted in normal mode. */
export const TEMPLATE_INVARIANT_ROLES = new Set([
  'company_name',
  'company_legal_name',
  'company_address',
  'company_tax_id',
  'company_nip',
  'company_registration_number',
  'company_regon',
  'company_krs',
  'company_bank_account',
  'bank_account',
  'company_email',
  'company_phone',
  'company_website',
  'company_website_url',
  'contractor_name',
  'contractor_person_name',
  'contractor_person_address',
  'contractor_person_email',
  'contractor_person_phone',
  'contractor_person_pesel',
  'legal_entity_type',
  'owner_name',
  'partner_name',
  'representative_name',
  'company_representative',
  'contractor_definition',
  'photographer_name',
  'videographer_name',
  'operator_count',
  // Not in the core wedding model — stay template-invariant by default.
  'wedding_planner_name',
  'wedding_planner_email',
  'wedding_planner_phone',
])

/** Permanent legal wording — detect for understanding, never patch. */
export const LEGAL_INVARIANT_ROLES = new Set([
  'defined_term',
  'legal_reference',
  'permanent_legal_clause',
  'copyright_clause',
  'cancellation_clause',
  'fixed_penalty_clause',
  'court_clause',
  'privacy_clause',
  'deposit_refund_multiplier',
  'deposit_forfeiture_clause',
  'amount_reference_without_literal_value',
  'legal_clause_reference',
])

export const CLIENT_VARIABLE_ROLES = new Set([
  'bride_name',
  'bride_first_name',
  'bride_last_name',
  'bride_address',
  'bride_phone',
  'bride_email',
  'bride_pesel',
  'groom_name',
  'groom_first_name',
  'groom_last_name',
  'groom_address',
  'groom_phone',
  'groom_email',
  'groom_pesel',
  'client_name',
  'client_address',
  'client_phone',
  'client_email',
])

export const LOCATION_VARIABLE_ROLES = new Set([
  'preparation_location',
  'bride_preparation_location',
  'groom_preparation_location',
  'ceremony_location',
  'reception_location',
  'wedding_location',
  'shared_wedding_location',
  'church',
  'civil_office',
])

export const DEFAULT_TEMPLATE_VARIABLE_CONFIG: ContractTemplateVariableConfig = {
  templateMigrationMode: false,
  paymentMode: 'fixed',
  deliveryTermMode: 'fixed',
  variableRoles: [],
  invariantRoles: [],
  packageFields: {
    packageName: true,
    contents: true,
    coverageHours: true,
    workingTime: true,
    overtimeRate: true,
    operatorCount: false,
    contractValue: false,
  },
}

export function resolveTemplateConfig(
  override?: Partial<ContractTemplateVariableConfig> | null,
): ContractTemplateVariableConfig {
  return {
    ...DEFAULT_TEMPLATE_VARIABLE_CONFIG,
    ...override,
    packageFields: {
      ...DEFAULT_TEMPLATE_VARIABLE_CONFIG.packageFields,
      ...override?.packageFields,
    },
    variableRoles: override?.variableRoles ?? [],
    invariantRoles: override?.invariantRoles ?? [],
  }
}

function normalizeRole(role: string): string {
  return normalizeSemanticRole(role) ?? role
}

export function classifyFieldMutability(
  role: string,
  config: ContractTemplateVariableConfig = DEFAULT_TEMPLATE_VARIABLE_CONFIG,
): FieldMutability {
  const id = normalizeRole(role)
  if (config.invariantRoles.includes(id) || config.invariantRoles.includes(role)) {
    return 'template_invariant'
  }
  if (config.variableRoles.includes(id) || config.variableRoles.includes(role)) {
    if (PACKAGE_VARIABLE_ROLES.has(id)) return 'package_variable'
    if (USER_CONFIGURABLE_ROLES.has(id)) return 'user_configurable'
    return 'wedding_variable'
  }
  if (LEGAL_INVARIANT_ROLES.has(id)) return 'legal_invariant'
  if (TEMPLATE_INVARIANT_ROLES.has(id)) return 'template_invariant'
  if (WEDDING_VARIABLE_ROLES.has(id)) return 'wedding_variable'
  if (PACKAGE_VARIABLE_ROLES.has(id)) return 'package_variable'
  if (USER_CONFIGURABLE_ROLES.has(id)) return 'user_configurable'
  // Unknown roles default to invariant — never invent wedding variables.
  return 'template_invariant'
}

/**
 * Whether Phase B may create a replacement for this role under the given config.
 */
export function isRoleReplaceable(
  role: string,
  config: ContractTemplateVariableConfig = DEFAULT_TEMPLATE_VARIABLE_CONFIG,
): boolean {
  const id = normalizeRole(role)
  const mutability = classifyFieldMutability(id, config)

  if (mutability === 'template_invariant' || mutability === 'legal_invariant') {
    return false
  }
  if (mutability === 'wedding_variable') return true

  if (mutability === 'package_variable') {
    const pf = config.packageFields
    if (id === 'package_name') return pf?.packageName !== false
    if (id === 'package_item' || id === 'package_contents') {
      return pf?.contents !== false
    }
    if (id === 'package_duration' || id === 'coverage_hours') {
      return pf?.coverageHours !== false
    }
    if (
      id === 'working_hours' ||
      id === 'coverage_start_time' ||
      id === 'coverage_end_time' ||
      id === 'coverage_time_range'
    ) {
      return pf?.workingTime !== false
    }
    if (id === 'package_overtime_rate' || id === 'extra_hour_price' || id === 'overtime_rate') {
      return pf?.overtimeRate !== false
    }
    if (id === 'operator_count') return pf?.operatorCount === true
    return true
  }

  if (mutability === 'user_configurable') {
    if (
      id === 'contract_value' ||
      id === 'package_price' ||
      id === 'deposit_amount' ||
      id === 'installment_amount' ||
      id === 'remaining_amount' ||
      id === 'payment_schedule' ||
      id === 'deposit_due_date'
    ) {
      if (config.paymentMode === 'variable') return true
      // contract_value may also be enabled via packageFields.contractValue
      if (
        (id === 'contract_value' || id === 'package_price') &&
        config.packageFields?.contractValue === true
      ) {
        return true
      }
      return false
    }
    if (
      id === 'delivery_deadline' ||
      id === 'delivery_duration' ||
      id === 'preview_deadline'
    ) {
      return config.deliveryTermMode === 'variable'
    }
  }

  return false
}

export function isClientVariableRole(role: string): boolean {
  const id = normalizeRole(role)
  return CLIENT_VARIABLE_ROLES.has(id)
}

export function isLocationVariableRole(role: string): boolean {
  const id = normalizeRole(role)
  return LOCATION_VARIABLE_ROLES.has(id)
}

export function isTemplateInvariantRole(role: string): boolean {
  const mutability = classifyFieldMutability(role)
  return mutability === 'template_invariant' || mutability === 'legal_invariant'
}

export const TEMPLATE_INVARIANT_REASON =
  'Template-owner invariant data'

export const LEGAL_INVARIANT_REASON = 'Permanent legal clause — template invariant'
