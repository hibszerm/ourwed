/**
 * Persistent Template Field Configuration — user-reviewed mutability per template.
 *
 * Priority: explicit saved config > product policy > semantic heuristic.
 * AI never overrides an explicit user decision.
 */

import type {
  DocumentSemanticMap,
  SemanticMappingRow,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import { WEDDING_DOMAIN_MAPPINGS } from '@/features/ai-contract-lab/semanticDomainMapping'
import {
  normalizeSemanticRole,
  SEMANTIC_ROLE_LABELS,
  type ContractSemanticRole,
} from '@/features/ai-contract-lab/semanticRoleCatalog'
import {
  classifyFieldMutability,
  DEFAULT_TEMPLATE_VARIABLE_CONFIG,
  isClientVariableRole,
  isLocationVariableRole,
  LEGAL_INVARIANT_ROLES,
  PACKAGE_VARIABLE_ROLES,
  resolveTemplateConfig,
  TEMPLATE_INVARIANT_ROLES,
  USER_CONFIGURABLE_ROLES,
  WEDDING_VARIABLE_ROLES,
  type ContractTemplateVariableConfig,
  type FieldMutability,
} from '@/features/ai-contract-lab/templateFieldPolicy'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateFieldMode = 'variable' | 'fixed' | 'review' | 'ignored'

export type TemplateVariableSource =
  | 'wedding'
  | 'package'
  | 'manual'
  | 'derived'

export type TemplateFieldCategory =
  | 'contract'
  | 'clients'
  | 'wedding'
  | 'locations'
  | 'package'
  | 'payments'
  | 'delivery'
  | 'company'
  | 'legal'
  | 'other'

export type TemplateFieldConfiguredBy =
  | 'default_policy'
  | 'user'
  | 'migration'
  | 'system'

export type TemplateFieldConfiguration = {
  id: string
  templateId: string
  templateVersionId?: string
  semanticRole: string
  canonicalFieldKey?: string
  displayName: string
  category: TemplateFieldCategory
  mode: TemplateFieldMode
  variableSource?: TemplateVariableSource
  requiredWhenVariable: boolean
  detectedAnchorIds: string[]
  sourceExamples: string[]
  confidence?: number
  configuredBy: TemplateFieldConfiguredBy
  configuredAt?: string
  notes?: string
  /** User confirmed risk of fixing a protected client/wedding field. */
  fixedClientRiskConfirmed?: boolean
}

export type SharedLocationPolicyConfig = {
  mode: 'ask_each_time' | 'use_single_location' | 'combine_locations'
  preferredLocationRole?: 'preparation' | 'ceremony' | 'reception'
  combinedFormat?: string
}

export type TemplatePackageConfiguration = {
  selectionMode:
    | 'template_represents_one_package'
    | 'replace_selected_package'
  fields: {
    packageName: TemplateFieldMode
    contractValue: TemplateFieldMode
    contents: TemplateFieldMode
    coverageHours: TemplateFieldMode
    workingTime: TemplateFieldMode
    overtimeRate: TemplateFieldMode
    filmDuration: TemplateFieldMode
    photoCount: TemplateFieldMode
    operatorCount: TemplateFieldMode
    deliveryFormat: TemplateFieldMode
    additionalServices: TemplateFieldMode
  }
}

export type ContractTemplateConfiguration = {
  templateId: string
  templateVersionId?: string
  configurationVersion: number
  status: 'unconfigured' | 'configured' | 'requires_review'
  fields: TemplateFieldConfiguration[]
  sharedLocationPolicy?: SharedLocationPolicyConfig
  paymentMode: 'fixed' | 'variable'
  deliveryTermMode: 'fixed' | 'variable'
  packageConfiguration?: TemplatePackageConfiguration
  createdAt: string
  updatedAt: string
}

export type TemplateConfigurationReadiness = {
  status: 'unconfigured' | 'incomplete' | 'ready' | 'requires_review'
  variableCount: number
  fixedCount: number
  ignoredCount: number
  reviewCount: number
  blockingIssues: string[]
}

export type ConfiguredSemanticRow = {
  semanticRole: string
  canonicalFieldKey?: string
  effectiveMode: TemplateFieldMode
  configuredBy: 'user' | 'section' | 'default_policy' | 'fallback'
  configurationId?: string
}

export type EffectiveFieldModeResult = {
  mode: TemplateFieldMode
  configuredBy: ConfiguredSemanticRow['configuredBy']
  configurationId?: string
  field?: TemplateFieldConfiguration
  reason: string
}

export const DEFAULT_SHARED_LOCATION_FORMAT =
  'Przygotowania: {preparation}; ceremonia: {ceremony}; przyjęcie: {reception}'

export const DEFAULT_PACKAGE_CONFIGURATION: TemplatePackageConfiguration = {
  selectionMode: 'template_represents_one_package',
  fields: {
    packageName: 'fixed',
    contractValue: 'fixed',
    contents: 'fixed',
    coverageHours: 'fixed',
    workingTime: 'fixed',
    overtimeRate: 'fixed',
    filmDuration: 'fixed',
    photoCount: 'fixed',
    operatorCount: 'fixed',
    deliveryFormat: 'fixed',
    additionalServices: 'review',
  },
}

/** Client/wedding fields that warn when set to fixed. */
export const PROTECTED_VARIABLE_ROLES = new Set([
  'wedding_date',
  'bride_name',
  'bride_first_name',
  'bride_last_name',
  'bride_address',
  'bride_phone',
  'bride_email',
  'groom_name',
  'groom_first_name',
  'groom_last_name',
  'groom_address',
  'groom_phone',
  'groom_email',
  'client_name',
  'client_address',
  'client_phone',
  'client_email',
])

export const PROTECTED_FIXED_WARNING =
  'Ta wartość zawiera dane poprzedniego zlecenia. Pozostawienie jej jako stałej może spowodować wygenerowanie umowy z danymi innego klienta.'

const CATEGORY_ORDER: TemplateFieldCategory[] = [
  'contract',
  'clients',
  'wedding',
  'locations',
  'package',
  'payments',
  'delivery',
  'company',
  'legal',
  'other',
]

export const CATEGORY_LABELS: Record<TemplateFieldCategory, string> = {
  contract: 'Dane umowy',
  clients: 'Dane klientów',
  wedding: 'Data i miejsca ślubu',
  locations: 'Data i miejsca ślubu',
  package: 'Pakiet i zakres usługi',
  payments: 'Płatności',
  delivery: 'Termin realizacji',
  company: 'Dane firmy',
  legal: 'Treść prawna',
  other: 'Pozostałe',
}

export const MODE_LABELS: Record<TemplateFieldMode, string> = {
  variable: 'Zmienia się dla każdego zlecenia',
  fixed: 'Zawsze pozostaje bez zmian',
  review: 'Wymaga sprawdzenia',
  ignored: 'Pomiń to pole',
}

// ---------------------------------------------------------------------------
// Identity / catalog helpers
// ---------------------------------------------------------------------------

export const WEDDING_PLANNER_ROLES = new Set([
  'wedding_planner_name',
  'wedding_planner_email',
  'wedding_planner_phone',
])

export const WEDDING_PLANNER_FIXED_REASON =
  'Brak danych wedding plannera w modelu zlecenia — wartość pozostaje bez zmian.'

export function fieldConfigIdentityKey(input: {
  semanticRole: string
  canonicalFieldKey?: string | null
  category?: TemplateFieldCategory
}): string {
  const role = normalizeSemanticRole(input.semanticRole) ?? input.semanticRole
  const key = input.canonicalFieldKey?.trim() || ''
  const cat = input.category ?? categoryForRole(role)
  return `${role}::${key}::${cat}`
}

export function categoryForRole(role: string): TemplateFieldCategory {
  const id = normalizeSemanticRole(role) ?? role
  if (WEDDING_PLANNER_ROLES.has(id)) return 'other'
  if (
    id === 'contract_execution_date' ||
    id === 'contract_date' ||
    id === 'contract_value'
  ) {
    return 'contract'
  }
  if (isClientVariableRole(id)) return 'clients'
  if (id === 'wedding_date') return 'wedding'
  if (isLocationVariableRole(id)) return 'locations'
  if (
    id === 'delivery_deadline' ||
    id === 'delivery_duration' ||
    id === 'preview_deadline'
  ) {
    return 'delivery'
  }
  if (
    USER_CONFIGURABLE_ROLES.has(id) ||
    id.includes('payment') ||
    id.includes('deposit') ||
    id.includes('installment')
  ) {
    return 'payments'
  }
  if (PACKAGE_VARIABLE_ROLES.has(id) || id === 'operator_count') return 'package'
  if (LEGAL_INVARIANT_ROLES.has(id)) return 'legal'
  if (TEMPLATE_INVARIANT_ROLES.has(id)) return 'company'
  return 'other'
}

function displayNameForRole(role: string): string {
  const id = (normalizeSemanticRole(role) ?? role) as ContractSemanticRole
  const label = SEMANTIC_ROLE_LABELS[id]
  if (label) return label
  return role.replace(/_/g, ' ')
}

function defaultCanonicalKey(role: string): string | undefined {
  const id = (normalizeSemanticRole(role) ?? role) as ContractSemanticRole
  return WEDDING_DOMAIN_MAPPINGS[id]?.fieldKey
}

function defaultVariableSource(role: string): TemplateVariableSource {
  const id = normalizeSemanticRole(role) ?? role
  if (WEDDING_PLANNER_ROLES.has(id)) return 'manual'
  if (
    id === 'contract_execution_date' ||
    id === 'contract_date' ||
    id === 'payment_due_date' ||
    id === 'final_payment_due_date'
  ) {
    return 'derived'
  }
  if (PACKAGE_VARIABLE_ROLES.has(id) || id === 'contract_value' || id === 'package_price') {
    return 'package'
  }
  return 'wedding'
}

function defaultModeForRole(role: string): {
  mode: TemplateFieldMode
  reason: string
} {
  const id = normalizeSemanticRole(role) ?? role
  const mutability = classifyFieldMutability(id)

  if (WEDDING_PLANNER_ROLES.has(id)) {
    return { mode: 'fixed', reason: WEDDING_PLANNER_FIXED_REASON }
  }
  if (LEGAL_INVARIANT_ROLES.has(id) || mutability === 'legal_invariant') {
    return { mode: 'fixed', reason: 'Klauzula prawna — domyślnie stała' }
  }
  if (TEMPLATE_INVARIANT_ROLES.has(id) || mutability === 'template_invariant') {
    return { mode: 'fixed', reason: 'Dane właściciela szablonu — domyślnie stałe' }
  }
  if (isClientVariableRole(id) || id === 'wedding_date') {
    return {
      mode: 'variable',
      reason: 'Dane zlecenia — zmieniają się między weselami',
    }
  }
  if (isLocationVariableRole(id)) {
    return {
      mode: 'variable',
      reason: 'Lokalizacja wesela — zmienia się między zleceniami',
    }
  }
  if (id === 'contract_execution_date' || id === 'contract_date') {
    return {
      mode: 'variable',
      reason: 'Data zawarcia umowy — zwykle uzupełniana przy generowaniu',
    }
  }
  if (
    id === 'delivery_deadline' ||
    id === 'delivery_duration' ||
    id === 'preview_deadline'
  ) {
    return {
      mode: 'fixed',
      reason: 'Termin realizacji — domyślnie stały w szablonie pakietu',
    }
  }
  if (
    id === 'deposit_amount' ||
    id === 'installment_amount' ||
    id === 'remaining_amount' ||
    id === 'payment_schedule' ||
    id === 'deposit_due_date'
  ) {
    return {
      mode: 'fixed',
      reason: 'Harmonogram płatności — domyślnie stały w szablonie',
    }
  }
  if (id === 'contract_value' || id === 'package_price') {
    return {
      mode: 'fixed',
      reason: 'Wartość umowy — domyślnie stała; możesz włączyć jako zmienną',
    }
  }
  if (id === 'shared_wedding_location') {
    return {
      mode: 'review',
      reason: 'Wspólne pole lokalizacji — wybierz politykę szablonu',
    }
  }
  if (id === 'additional_service') {
    return {
      mode: 'review',
      reason: 'Usługi dodatkowe — potwierdź, czy zmieniają się między zleceniami',
    }
  }
  if (
    id === 'package_item' ||
    id === 'package_contents' ||
    id === 'operator_count' ||
    id === 'film_duration' ||
    id === 'photo_count' ||
    id === 'delivery_method' ||
    id === 'delivered_material_type' ||
    id === 'album' ||
    id === 'gallery' ||
    id === 'teaser'
  ) {
    return {
      mode: 'fixed',
      reason: 'Atrybut pakietu — w trybie jednego pakietu pozostaje stały',
    }
  }
  if (
    id === 'package_duration' ||
    id === 'coverage_hours' ||
    id === 'working_hours' ||
    id === 'coverage_start_time' ||
    id === 'coverage_end_time' ||
    id === 'coverage_time_range' ||
    id === 'package_overtime_rate' ||
    id === 'overtime_rate' ||
    id === 'extra_hour_price'
  ) {
    return {
      mode: 'fixed',
      reason: 'Zakres pakietu — domyślnie stały; możesz oznaczyć jako zmienny',
    }
  }
  if (id === 'package_name' || id === 'package_type') {
    return {
      mode: 'fixed',
      reason: 'Nazwa / typ pakietu — domyślnie stała w szablonie jednego pakietu',
    }
  }
  if (WEDDING_VARIABLE_ROLES.has(id)) {
    return { mode: 'variable', reason: 'Dane wesela — domyślnie zmienne' }
  }
  if (mutability === 'user_configurable') {
    return { mode: 'fixed', reason: 'Pole konfiguracyjne — domyślnie stałe' }
  }
  return {
    mode: 'review',
    reason: 'Nierozpoznane pole — wymaga decyzji użytkownika',
  }
}

function newFieldId(templateId: string, role: string, index: number): string {
  const safe = role.replace(/[^a-z0-9_]+/gi, '_').slice(0, 48)
  return `tfc:${templateId.slice(0, 8)}:${safe}:${index}`
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Build proposed configuration from semantic map
// ---------------------------------------------------------------------------

export function buildProposedTemplateConfiguration(input: {
  templateId: string
  templateVersionId?: string
  semanticMap: DocumentSemanticMap
  existing?: ContractTemplateConfiguration | null
}): ContractTemplateConfiguration {
  const now = nowIso()
  const byIdentity = new Map<string, TemplateFieldConfiguration>()

  for (const sa of input.semanticMap.semanticAnchors) {
    const role = normalizeSemanticRole(sa.semanticRole) ?? sa.semanticRole
    const category = categoryForRole(role)
    const canonicalFieldKey = defaultCanonicalKey(role)
    const identity = fieldConfigIdentityKey({
      semanticRole: role,
      canonicalFieldKey,
      category,
    })
    const example = sa.valueSpan.sourceText.trim()
    const existingField = byIdentity.get(identity)
    if (existingField) {
      if (!existingField.detectedAnchorIds.includes(sa.anchorId)) {
        existingField.detectedAnchorIds.push(sa.anchorId)
      }
      if (
        example &&
        !existingField.sourceExamples.includes(example) &&
        existingField.sourceExamples.length < 3
      ) {
        existingField.sourceExamples.push(example)
      }
      if (
        sa.confidence != null &&
        (existingField.confidence == null ||
          sa.confidence > existingField.confidence)
      ) {
        existingField.confidence = sa.confidence
      }
      continue
    }

    const suggested = defaultModeForRole(role)
    byIdentity.set(identity, {
      id: newFieldId(input.templateId, role, byIdentity.size),
      templateId: input.templateId,
      templateVersionId: input.templateVersionId,
      semanticRole: role,
      canonicalFieldKey,
      displayName: displayNameForRole(role),
      category,
      mode: suggested.mode,
      variableSource:
        suggested.mode === 'variable' ? defaultVariableSource(role) : undefined,
      requiredWhenVariable:
        suggested.mode === 'variable' &&
        (isClientVariableRole(role) ||
          role === 'wedding_date' ||
          isLocationVariableRole(role)),
      detectedAnchorIds: [sa.anchorId],
      sourceExamples: example ? [example] : [],
      confidence: sa.confidence,
      configuredBy: 'default_policy',
      notes: suggested.reason,
    })
  }

  // Carry forward explicit user decisions from existing config when matching.
  if (input.existing?.fields?.length) {
    for (const prev of input.existing.fields) {
      const identity = fieldConfigIdentityKey(prev)
      const next = byIdentity.get(identity)
      if (!next) continue
      if (prev.configuredBy === 'user' || prev.configuredBy === 'migration') {
        next.mode = prev.mode
        next.variableSource = prev.variableSource
        next.requiredWhenVariable = prev.requiredWhenVariable
        next.canonicalFieldKey =
          prev.canonicalFieldKey ?? next.canonicalFieldKey
        next.configuredBy = prev.configuredBy === 'user' ? 'user' : 'migration'
        next.configuredAt = prev.configuredAt
        next.fixedClientRiskConfirmed = prev.fixedClientRiskConfirmed
        next.notes = prev.notes ?? next.notes
      }
    }
  }

  const fields = [...byIdentity.values()].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    if (ca !== cb) return ca - cb
    return a.displayName.localeCompare(b.displayName, 'pl')
  })

  const reviewCount = fields.filter((f) => f.mode === 'review').length
  const status: ContractTemplateConfiguration['status'] =
    reviewCount > 0 ? 'requires_review' : 'unconfigured'

  return {
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    configurationVersion: (input.existing?.configurationVersion ?? 0) + 1,
    status,
    fields,
    sharedLocationPolicy: input.existing?.sharedLocationPolicy ?? {
      mode: 'ask_each_time',
      combinedFormat: DEFAULT_SHARED_LOCATION_FORMAT,
    },
    paymentMode: input.existing?.paymentMode ?? 'fixed',
    deliveryTermMode: input.existing?.deliveryTermMode ?? 'fixed',
    packageConfiguration:
      input.existing?.packageConfiguration ?? DEFAULT_PACKAGE_CONFIGURATION,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Effective mode resolution
// ---------------------------------------------------------------------------

function packageFieldMode(
  role: string,
  pkg?: TemplatePackageConfiguration,
): TemplateFieldMode | null {
  if (!pkg) return null
  const id = normalizeSemanticRole(role) ?? role
  const f = pkg.fields
  if (id === 'package_name' || id === 'package_type') return f.packageName
  if (id === 'contract_value' || id === 'package_price') return f.contractValue
  if (id === 'package_item' || id === 'package_contents') return f.contents
  if (id === 'package_duration' || id === 'coverage_hours') return f.coverageHours
  if (
    id === 'working_hours' ||
    id === 'coverage_start_time' ||
    id === 'coverage_end_time' ||
    id === 'coverage_time_range'
  ) {
    return f.workingTime
  }
  if (
    id === 'package_overtime_rate' ||
    id === 'overtime_rate' ||
    id === 'extra_hour_price'
  ) {
    return f.overtimeRate
  }
  if (id === 'film_duration') return f.filmDuration
  if (id === 'photo_count') return f.photoCount
  if (id === 'operator_count') return f.operatorCount
  if (id === 'delivery_method' || id === 'delivered_material_type') {
    return f.deliveryFormat
  }
  if (id === 'additional_service') return f.additionalServices
  return null
}

export function getEffectiveFieldMode(input: {
  semanticRole: string
  canonicalFieldKey?: string | null
  templateConfiguration?: ContractTemplateConfiguration | null
  defaultPolicy?: ContractTemplateVariableConfig
}): EffectiveFieldModeResult {
  const role = normalizeSemanticRole(input.semanticRole) ?? input.semanticRole
  const config = input.templateConfiguration

  if (config) {
    const match =
      config.fields.find((f) => {
        if ((normalizeSemanticRole(f.semanticRole) ?? f.semanticRole) !== role) {
          return false
        }
        if (
          input.canonicalFieldKey &&
          f.canonicalFieldKey &&
          f.canonicalFieldKey !== input.canonicalFieldKey
        ) {
          return false
        }
        return true
      }) ??
      config.fields.find(
        (f) =>
          (normalizeSemanticRole(f.semanticRole) ?? f.semanticRole) === role,
      )

    if (match && match.configuredBy === 'user') {
      return {
        mode: match.mode,
        configuredBy: 'user',
        configurationId: match.id,
        field: match,
        reason:
          match.mode === 'fixed'
            ? 'Pozostaje bez zmian — ustawienie szablonu'
            : match.mode === 'variable'
              ? 'Zmienna — ustawienie szablonu'
              : match.mode === 'ignored'
                ? 'Pomiń — ustawienie szablonu'
                : 'Wymaga decyzji — ustawienie szablonu',
      }
    }

    if (match) {
      return {
        mode: match.mode,
        configuredBy:
          match.configuredBy === 'migration' ? 'user' : 'default_policy',
        configurationId: match.id,
        field: match,
        reason: match.notes ?? MODE_LABELS[match.mode],
      }
    }

    // Section-level overrides when no field row exists yet
    if (
      role === 'delivery_deadline' ||
      role === 'delivery_duration' ||
      role === 'preview_deadline'
    ) {
      return {
        mode: config.deliveryTermMode === 'variable' ? 'variable' : 'fixed',
        configuredBy: 'section',
        reason:
          config.deliveryTermMode === 'variable'
            ? 'Zmienna — sekcja terminu realizacji'
            : 'Stała — sekcja terminu realizacji',
      }
    }
    if (
      role === 'deposit_amount' ||
      role === 'installment_amount' ||
      role === 'remaining_amount' ||
      role === 'payment_schedule' ||
      role === 'deposit_due_date'
    ) {
      return {
        mode: config.paymentMode === 'variable' ? 'variable' : 'fixed',
        configuredBy: 'section',
        reason:
          config.paymentMode === 'variable'
            ? 'Zmienna — sekcja płatności'
            : 'Stała — sekcja płatności',
      }
    }
    const pkgMode = packageFieldMode(role, config.packageConfiguration)
    if (pkgMode) {
      return {
        mode: pkgMode,
        configuredBy: 'section',
        reason: `Pakiet — ${MODE_LABELS[pkgMode]}`,
      }
    }
  }

  const policy = resolveTemplateConfig(input.defaultPolicy)
  const suggested = defaultModeForRole(role)
  // Honour role allow/deny lists on legacy ContractTemplateVariableConfig
  if (policy.invariantRoles.includes(role)) {
    return {
      mode: 'fixed',
      configuredBy: 'default_policy',
      reason: 'Stała — polityka produktu',
    }
  }
  if (policy.variableRoles.includes(role)) {
    return {
      mode: 'variable',
      configuredBy: 'default_policy',
      reason: 'Zmienna — polityka produktu',
    }
  }
  return {
    mode: suggested.mode,
    configuredBy: suggested.mode === 'review' ? 'fallback' : 'default_policy',
    reason: suggested.reason,
  }
}

/**
 * Convert saved field configuration into Phase B ContractTemplateVariableConfig.
 * Explicit user modes win over section defaults.
 */
export function toContractTemplateVariableConfig(
  config: ContractTemplateConfiguration | null | undefined,
): ContractTemplateVariableConfig {
  if (!config) return { ...DEFAULT_TEMPLATE_VARIABLE_CONFIG }

  const variableRoles: string[] = []
  const invariantRoles: string[] = []
  const packageFields = {
    ...DEFAULT_TEMPLATE_VARIABLE_CONFIG.packageFields,
    packageName: false,
    contents: false,
    coverageHours: false,
    workingTime: false,
    overtimeRate: false,
    operatorCount: false,
    contractValue: false,
  }

  let paymentMode = config.paymentMode
  let deliveryTermMode = config.deliveryTermMode

  for (const field of config.fields) {
    const role = normalizeSemanticRole(field.semanticRole) ?? field.semanticRole
    if (field.mode === 'variable') {
      variableRoles.push(role)
      if (role === 'package_name') packageFields.packageName = true
      if (role === 'package_item' || role === 'package_contents') {
        packageFields.contents = true
      }
      if (role === 'package_duration' || role === 'coverage_hours') {
        packageFields.coverageHours = true
      }
      if (
        role === 'working_hours' ||
        role === 'coverage_start_time' ||
        role === 'coverage_end_time' ||
        role === 'coverage_time_range'
      ) {
        packageFields.workingTime = true
      }
      if (
        role === 'package_overtime_rate' ||
        role === 'overtime_rate' ||
        role === 'extra_hour_price'
      ) {
        packageFields.overtimeRate = true
      }
      if (role === 'operator_count') packageFields.operatorCount = true
      if (role === 'contract_value' || role === 'package_price') {
        packageFields.contractValue = true
        // Field-level override: contract value can be variable while paymentMode stays fixed
      }
      if (
        role === 'deposit_amount' ||
        role === 'installment_amount' ||
        role === 'remaining_amount' ||
        role === 'payment_schedule' ||
        role === 'deposit_due_date'
      ) {
        paymentMode = 'variable'
      }
      if (
        role === 'delivery_deadline' ||
        role === 'delivery_duration' ||
        role === 'preview_deadline'
      ) {
        deliveryTermMode = 'variable'
      }
    } else if (field.mode === 'fixed' || field.mode === 'ignored') {
      invariantRoles.push(role)
    }
  }

  // Apply package configuration section when present
  const pkg = config.packageConfiguration
  if (pkg) {
    if (pkg.fields.packageName === 'variable') packageFields.packageName = true
    if (pkg.fields.contents === 'variable') packageFields.contents = true
    if (pkg.fields.coverageHours === 'variable') packageFields.coverageHours = true
    if (pkg.fields.workingTime === 'variable') packageFields.workingTime = true
    if (pkg.fields.overtimeRate === 'variable') packageFields.overtimeRate = true
    if (pkg.fields.operatorCount === 'variable') packageFields.operatorCount = true
    if (pkg.fields.contractValue === 'variable') packageFields.contractValue = true
  }

  return resolveTemplateConfig({
    templateMigrationMode: false,
    paymentMode,
    deliveryTermMode,
    variableRoles,
    invariantRoles,
    sharedLocationFormat:
      config.sharedLocationPolicy?.combinedFormat ??
      DEFAULT_SHARED_LOCATION_FORMAT,
    packageFields,
  })
}

export function isRoleEnabledVariable(
  role: string,
  config: ContractTemplateConfiguration | null | undefined,
): boolean {
  return getEffectiveFieldMode({ semanticRole: role, templateConfiguration: config })
    .mode === 'variable'
}

// ---------------------------------------------------------------------------
// Readiness / save validation
// ---------------------------------------------------------------------------

export function computeTemplateConfigurationReadiness(
  config: ContractTemplateConfiguration | null | undefined,
): TemplateConfigurationReadiness {
  if (!config || config.status === 'unconfigured') {
    const fields = config?.fields ?? []
    return {
      status: config ? 'unconfigured' : 'unconfigured',
      variableCount: fields.filter((f) => f.mode === 'variable').length,
      fixedCount: fields.filter((f) => f.mode === 'fixed').length,
      ignoredCount: fields.filter((f) => f.mode === 'ignored').length,
      reviewCount: fields.filter((f) => f.mode === 'review').length,
      blockingIssues: config
        ? ['Konfiguracja szablonu nie została zapisana jako gotowa.']
        : ['Brak konfiguracji pól szablonu.'],
    }
  }

  const variableCount = config.fields.filter((f) => f.mode === 'variable').length
  const fixedCount = config.fields.filter((f) => f.mode === 'fixed').length
  const ignoredCount = config.fields.filter((f) => f.mode === 'ignored').length
  const reviewCount = config.fields.filter((f) => f.mode === 'review').length
  const blockingIssues: string[] = []

  for (const field of config.fields) {
    if (field.mode !== 'variable') continue
    if (!field.variableSource) {
      blockingIssues.push(
        `Pole „${field.displayName}” jest zmienne, ale nie ma źródła danych.`,
      )
    }
    if (
      field.variableSource !== 'manual' &&
      field.variableSource !== 'derived' &&
      !field.canonicalFieldKey
    ) {
      blockingIssues.push(
        `Pole „${field.displayName}” wymaga mapowania na dane zlecenia.`,
      )
    }
    if (
      PROTECTED_VARIABLE_ROLES.has(
        normalizeSemanticRole(field.semanticRole) ?? field.semanticRole,
      ) === false &&
      field.mode === 'variable' &&
      field.requiredWhenVariable &&
      !field.canonicalFieldKey &&
      field.variableSource === 'wedding'
    ) {
      // already covered
    }
  }

  for (const field of config.fields) {
    if (field.mode !== 'fixed') continue
    const role = normalizeSemanticRole(field.semanticRole) ?? field.semanticRole
    if (
      PROTECTED_VARIABLE_ROLES.has(role) &&
      !field.fixedClientRiskConfirmed
    ) {
      blockingIssues.push(
        `Pole „${field.displayName}” ustawione jako stałe wymaga jawnego potwierdzenia ryzyka.`,
      )
    }
  }

  const blockingReview = config.fields.filter(
    (f) =>
      f.mode === 'review' &&
      (isClientVariableRole(f.semanticRole) ||
        f.semanticRole === 'wedding_date' ||
        isLocationVariableRole(f.semanticRole) ||
        f.semanticRole === 'shared_wedding_location' ||
        f.semanticRole === 'additional_service'),
  )
  if (blockingReview.length > 0) {
    blockingIssues.push(
      `${blockingReview.length} pól wymaga sprawdzenia przed generowaniem umów.`,
    )
  }

  if (!config.sharedLocationPolicy && reviewCount > 0) {
    // optional
  }

  if (config.status === 'requires_review' || blockingReview.length > 0) {
    return {
      status: 'requires_review',
      variableCount,
      fixedCount,
      ignoredCount,
      reviewCount,
      blockingIssues:
        blockingIssues.length > 0
          ? blockingIssues
          : ['Konfiguracja wymaga sprawdzenia.'],
    }
  }

  if (blockingIssues.length > 0) {
    return {
      status: 'incomplete',
      variableCount,
      fixedCount,
      ignoredCount,
      reviewCount,
      blockingIssues,
    }
  }

  if (config.status === 'configured') {
    return {
      status: 'ready',
      variableCount,
      fixedCount,
      ignoredCount,
      reviewCount,
      blockingIssues: [],
    }
  }

  return {
    status: 'incomplete',
    variableCount,
    fixedCount,
    ignoredCount,
    reviewCount,
    blockingIssues: ['Zapisz konfigurację, aby oznaczyć szablon jako gotowy.'],
  }
}

export function validateTemplateConfigurationForSave(input: {
  config: ContractTemplateConfiguration
  markReady: boolean
  confirmedFixedProtectedIds?: string[]
}): { ok: boolean; errors: string[]; config: ContractTemplateConfiguration } {
  const errors: string[] = []
  const confirmed = new Set(input.confirmedFixedProtectedIds ?? [])
  const fields = input.config.fields.map((f) => {
    const role = normalizeSemanticRole(f.semanticRole) ?? f.semanticRole
    if (
      f.mode === 'fixed' &&
      PROTECTED_VARIABLE_ROLES.has(role) &&
      (f.fixedClientRiskConfirmed || confirmed.has(f.id))
    ) {
      return {
        ...f,
        fixedClientRiskConfirmed: true,
        configuredBy: 'user' as const,
        configuredAt: f.configuredAt ?? nowIso(),
      }
    }
    return {
      ...f,
      configuredBy:
        f.configuredBy === 'default_policy' && input.markReady
          ? ('user' as const)
          : f.configuredBy,
      configuredAt: f.configuredAt ?? (input.markReady ? nowIso() : f.configuredAt),
    }
  })

  for (const field of fields) {
    if (field.mode === 'variable') {
      if (!field.variableSource) {
        errors.push(`„${field.displayName}”: wybierz źródło danych.`)
      }
      if (
        field.variableSource === 'wedding' ||
        field.variableSource === 'package'
      ) {
        if (!field.canonicalFieldKey) {
          errors.push(`„${field.displayName}”: brak mapowania na dane zlecenia.`)
        }
      }
    }
    const role = normalizeSemanticRole(field.semanticRole) ?? field.semanticRole
    if (
      field.mode === 'fixed' &&
      PROTECTED_VARIABLE_ROLES.has(role) &&
      !field.fixedClientRiskConfirmed
    ) {
      errors.push(
        `„${field.displayName}”: potwierdź ryzyko pozostawienia danych klienta jako stałych.`,
      )
    }
  }

  // Shared physical span: multiple independent variable replacements on same anchors
  const variableByAnchor = new Map<string, TemplateFieldConfiguration[]>()
  for (const field of fields) {
    if (field.mode !== 'variable') continue
    if (!isLocationVariableRole(field.semanticRole)) continue
    for (const anchorId of field.detectedAnchorIds) {
      const list = variableByAnchor.get(anchorId) ?? []
      list.push(field)
      variableByAnchor.set(anchorId, list)
    }
  }
  for (const [anchorId, list] of variableByAnchor) {
    if (list.length < 2) continue
    if (!input.config.sharedLocationPolicy) {
      errors.push(
        `Wspólne pole lokalizacji (${anchorId}) wymaga wyboru polityki lokalizacji.`,
      )
    }
  }

  const blockingReview = fields.filter(
    (f) =>
      f.mode === 'review' &&
      (isClientVariableRole(f.semanticRole) ||
        f.semanticRole === 'wedding_date' ||
        isLocationVariableRole(f.semanticRole) ||
        f.semanticRole === 'shared_wedding_location'),
  )

  let status: ContractTemplateConfiguration['status'] = 'requires_review'
  if (input.markReady) {
    if (blockingReview.length > 0 || errors.length > 0) {
      status = 'requires_review'
      if (blockingReview.length > 0) {
        errors.push(
          'Rozwiąż pola oznaczone „Do sprawdzenia” przed oznaczeniem jako gotowy.',
        )
      }
    } else {
      status = 'configured'
    }
  }

  const config: ContractTemplateConfiguration = {
    ...input.config,
    fields,
    status: errors.length > 0 && input.markReady ? 'requires_review' : status,
    updatedAt: nowIso(),
    configurationVersion: input.config.configurationVersion + 1,
  }

  return {
    ok: errors.length === 0 && (!input.markReady || config.status === 'configured'),
    errors,
    config,
  }
}

export function templateAllowsGeneration(
  config: ContractTemplateConfiguration | null | undefined,
): boolean {
  const readiness = computeTemplateConfigurationReadiness(config)
  return readiness.status === 'ready'
}

// ---------------------------------------------------------------------------
// Version migration
// ---------------------------------------------------------------------------

export type FieldMigrationMatch =
  | { kind: 'unchanged'; previous: TemplateFieldConfiguration; next: TemplateFieldConfiguration }
  | { kind: 'migrated'; previous: TemplateFieldConfiguration; next: TemplateFieldConfiguration }
  | { kind: 'ambiguous'; previous: TemplateFieldConfiguration; candidates: TemplateFieldConfiguration[] }
  | { kind: 'removed'; previous: TemplateFieldConfiguration }
  | { kind: 'added'; next: TemplateFieldConfiguration }

export function migrateTemplateConfiguration(input: {
  previous: ContractTemplateConfiguration
  nextProposed: ContractTemplateConfiguration
}): {
  configuration: ContractTemplateConfiguration
  matches: FieldMigrationMatch[]
  status: 'unchanged' | 'automatically_migrated' | 'requires_review'
} {
  const matches: FieldMigrationMatch[] = []
  const usedNext = new Set<string>()
  const resultFields: TemplateFieldConfiguration[] = []

  for (const prev of input.previous.fields) {
    const prevKey = fieldConfigIdentityKey(prev)
    const exact = input.nextProposed.fields.filter(
      (n) => fieldConfigIdentityKey(n) === prevKey,
    )
    if (exact.length === 1) {
      const n = exact[0]!
      usedNext.add(n.id)
      const merged: TemplateFieldConfiguration = {
        ...n,
        mode: prev.mode,
        variableSource: prev.variableSource ?? n.variableSource,
        requiredWhenVariable: prev.requiredWhenVariable,
        canonicalFieldKey: prev.canonicalFieldKey ?? n.canonicalFieldKey,
        configuredBy: prev.configuredBy === 'user' ? 'user' : 'migration',
        configuredAt: prev.configuredAt,
        fixedClientRiskConfirmed: prev.fixedClientRiskConfirmed,
        notes: prev.notes ?? n.notes,
      }
      resultFields.push(merged)
      matches.push({
        kind: prev.mode === n.mode ? 'unchanged' : 'migrated',
        previous: prev,
        next: merged,
      })
      continue
    }
    if (exact.length > 1) {
      matches.push({ kind: 'ambiguous', previous: prev, candidates: exact })
      for (const c of exact) {
        usedNext.add(c.id)
        resultFields.push({
          ...c,
          mode: 'review',
          configuredBy: 'migration',
          notes: 'Wymaga decyzji — niejednoznaczne dopasowanie po nowej wersji szablonu',
        })
      }
      continue
    }

    // Soft match by role only
    const byRole = input.nextProposed.fields.filter(
      (n) =>
        (normalizeSemanticRole(n.semanticRole) ?? n.semanticRole) ===
          (normalizeSemanticRole(prev.semanticRole) ?? prev.semanticRole) &&
        !usedNext.has(n.id),
    )
    if (byRole.length === 1) {
      const n = byRole[0]!
      usedNext.add(n.id)
      const merged: TemplateFieldConfiguration = {
        ...n,
        mode: prev.mode,
        variableSource: prev.variableSource ?? n.variableSource,
        requiredWhenVariable: prev.requiredWhenVariable,
        canonicalFieldKey: prev.canonicalFieldKey ?? n.canonicalFieldKey,
        configuredBy: 'migration',
        configuredAt: prev.configuredAt,
        fixedClientRiskConfirmed: prev.fixedClientRiskConfirmed,
        notes: prev.notes ?? n.notes,
      }
      resultFields.push(merged)
      matches.push({ kind: 'migrated', previous: prev, next: merged })
      continue
    }
    if (byRole.length > 1) {
      matches.push({ kind: 'ambiguous', previous: prev, candidates: byRole })
      for (const c of byRole) {
        usedNext.add(c.id)
        resultFields.push({
          ...c,
          mode: 'review',
          configuredBy: 'migration',
          notes: 'Wymaga decyzji — wiele dopasowań roli w nowej wersji',
        })
      }
      continue
    }

    matches.push({ kind: 'removed', previous: prev })
  }

  for (const n of input.nextProposed.fields) {
    if (usedNext.has(n.id)) continue
    const role = normalizeSemanticRole(n.semanticRole) ?? n.semanticRole
    const added: TemplateFieldConfiguration = {
      ...n,
      mode:
        isClientVariableRole(role) || role === 'wedding_date'
          ? 'review'
          : n.mode,
      configuredBy: 'migration',
      notes:
        isClientVariableRole(role) || role === 'wedding_date'
          ? 'Wymaga decyzji — brak konfiguracji nowego pola klienta'
          : n.notes,
    }
    resultFields.push(added)
    matches.push({ kind: 'added', next: added })
  }

  const hasAmbiguous = matches.some((m) => m.kind === 'ambiguous')
  const hasAddedClient = matches.some(
    (m) =>
      m.kind === 'added' &&
      (isClientVariableRole(m.next.semanticRole) ||
        m.next.mode === 'review'),
  )
  const hasReview = resultFields.some((f) => f.mode === 'review')

  let status: 'unchanged' | 'automatically_migrated' | 'requires_review' =
    'unchanged'
  if (hasAmbiguous || hasAddedClient || hasReview) status = 'requires_review'
  else if (matches.some((m) => m.kind === 'migrated' || m.kind === 'added')) {
    status = 'automatically_migrated'
  }

  return {
    configuration: {
      ...input.nextProposed,
      fields: resultFields,
      paymentMode: input.previous.paymentMode,
      deliveryTermMode: input.previous.deliveryTermMode,
      sharedLocationPolicy: input.previous.sharedLocationPolicy,
      packageConfiguration: input.previous.packageConfiguration,
      status: status === 'requires_review' ? 'requires_review' : 'configured',
      configurationVersion: input.previous.configurationVersion + 1,
      updatedAt: nowIso(),
      createdAt: input.previous.createdAt,
    },
    matches,
    status,
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function groupFieldsByCategory(
  fields: TemplateFieldConfiguration[],
): Array<{ category: TemplateFieldCategory; label: string; fields: TemplateFieldConfiguration[] }> {
  const map = new Map<TemplateFieldCategory, TemplateFieldConfiguration[]>()
  for (const f of fields) {
    const list = map.get(f.category) ?? []
    list.push(f)
    map.set(f.category, list)
  }
  // Merge wedding + locations under one display section
  const wedding = [
    ...(map.get('wedding') ?? []),
    ...(map.get('locations') ?? []),
  ]
  const seen = new Set<TemplateFieldCategory>()
  const out: Array<{
    category: TemplateFieldCategory
    label: string
    fields: TemplateFieldConfiguration[]
  }> = []
  for (const cat of CATEGORY_ORDER) {
    if (cat === 'locations') continue
    if (seen.has(cat)) continue
    seen.add(cat)
    const list =
      cat === 'wedding' ? wedding : (map.get(cat) ?? [])
    if (list.length === 0) continue
    out.push({ category: cat, label: CATEGORY_LABELS[cat], fields: list })
  }
  return out
}

export function annotateMappingRowWithConfiguration(
  row: SemanticMappingRow,
  config: ContractTemplateConfiguration | null | undefined,
): SemanticMappingRow & { effectiveMode?: TemplateFieldMode; configuredBy?: string } {
  const effective = getEffectiveFieldMode({
    semanticRole: row.semanticRole,
    canonicalFieldKey: row.mappedFieldKey,
    templateConfiguration: config,
  })
  return {
    ...row,
    effectiveMode: effective.mode,
    configuredBy: effective.configuredBy,
    reason: row.reason ?? effective.reason,
  }
}

export function mutabilityFromFieldMode(mode: TemplateFieldMode): FieldMutability {
  if (mode === 'variable') return 'wedding_variable'
  if (mode === 'ignored' || mode === 'fixed') return 'template_invariant'
  return 'user_configurable'
}
