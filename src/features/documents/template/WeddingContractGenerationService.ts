import {
  buildCombinedLocationPreview,
} from '@/features/ai-contract-lab/sharedLocationPolicy'
import {
  normalizeSemanticRole,
} from '@/features/ai-contract-lab/semanticRoleCatalog'
import type {
  ContractTemplateConfiguration,
  SharedLocationPolicyConfig,
  TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import type { DocumentTemplateSummary } from '@/types/documents'
import type { Wedding } from '@/types/wedding'
import type {
  CompletenessField,
  ContractCompletenessReport,
} from './buildContractCompleteness'
import { collapseCompletenessFieldsByRegistryKey } from './logicalContractFields'
import {
  filterOverrideKeysToPackageAllowlist,
  filterToPackageContractAllowlist,
} from './packageContractGenerationModel'
import { isPackageContractAllowedDynamicKey } from './packageContractAllowlist'
import { isIncompleteContractFieldValue } from './contractFieldValidation'
import {
  classifyTemplatesForGeneration,
  splitRecommended,
  type TemplatePickerClassification,
  type TemplatePickerDiagnosis,
} from './contractTemplatePicker'
import { isSystemAutoResolvedContractKey } from './contractExecutionContext'
import {
  createGenerationCorrelationId,
  GenerationPipelineError,
  logGenerationStage,
  wrapGenerationFailure,
} from './generationPipelineError'
import type { GenerationAttemptResult } from './generationAttemptResult'
import {
  actionablePayloadToReviewPatch,
  TransformNeedsReviewSignal,
} from './generationAttemptResult'
import type { TemplateSlot } from './types'
import { isSlotPhysicallyBound } from './types'
import {
  isMaterialPackageRegistryKey,
  isPlaceholderOnlyValue,
} from './placeholderValue'
import {
  detectPreGenerationReviewIssues,
  expandCoverageOverrides,
  isValidCoverageDuration,
  isValidCoverageEndTime,
  isValidTeaserDuration,
} from './preGenerationReviewIssues'
import { resolvePartyBlock } from './partyBlockResolver'
import {
  inferPaymentDueRule,
  paymentDueRuleNeedsManualInput,
} from './paymentDueRule'

export {
  createGenerationCorrelationId,
  GenerationPipelineError,
  userFacingGenerationErrorMessage,
} from './generationPipelineError'

export type ManualOverrideScope = 'local_only' | 'update_wedding'
export type SharedLocationDecision = 'use_single' | 'combine'

export interface GenerationTemplateSelection {
  classification: TemplatePickerClassification
  recommended: TemplatePickerDiagnosis[]
  alternatives: TemplatePickerDiagnosis[]
  preselectedTemplateId: string | null
}

export interface ConfiguredContractCompletenessReport
  extends ContractCompletenessReport {
  configuration: ContractTemplateConfiguration
  fields: CompletenessField[]
  missing: CompletenessField[]
  ignoredRegistryKeys: string[]
  fixedRegistryKeys: string[]
  /** Explicit package-contract generation (wedding route). */
  packageContractMode?: boolean
  packageId?: string | null
  packageTemplateVersionId?: string | null
}

export interface GenerationPreflightResult {
  ok: boolean
  errors: string[]
  effectiveOverrides: Record<string, string>
  omittedKeys: string[]
}

export type GenerationReviewContextualQuestion = {
  id: 'shared_location' | 'party_address' | 'payment_due'
  label: string
  answered: boolean
}

export type GenerationReviewBlockingInput =
  | {
      kind: 'missing_field'
      registryKey: string
      label: string
      message: string
    }
  | {
      kind: 'contextual_question'
      questionId: 'shared_location' | 'party_address' | 'payment_due'
      message: string
    }
  | {
      kind: 'semantic_collision'
      issueId: string
      message: string
    }

/**
 * Single source of truth for the photographer-facing generation review step.
 * UI and Generate validation MUST use only this object — never internal
 * semantic/mapping diagnostics.
 */
export interface GenerationReviewState {
  resolvedValues: CompletenessField[]
  editableMissingFields: CompletenessField[]
  contextualQuestions: GenerationReviewContextualQuestion[]
  blockingUserInputs: GenerationReviewBlockingInput[]
  generationAllowed: boolean
  effectiveOverrides: Record<string, string>
  omittedKeys: string[]
}

const ROLE_TO_REGISTRY: Record<string, string[]> = {
  wedding_date: ['wedding_date'],
  contract_date: ['contract_execution_date'],
  contract_execution_date: ['contract_execution_date'],
  preparation_location: ['preparation_location'],
  bride_preparation_location: ['preparation_location'],
  ceremony_location: ['ceremony_location'],
  church: ['ceremony_location'],
  civil_office: ['ceremony_location'],
  reception_location: ['reception_location'],
  shared_wedding_location: [
    'preparation_location',
    'ceremony_location',
    'reception_location',
  ],
  package_name: ['package_name'],
  package_type: ['package_name'],
  contract_value: ['contract_value'],
  package_price: ['contract_value'],
  deposit_amount: ['deposit_amount'],
  remaining_amount: ['remaining_amount'],
  bank_account: ['company_bank_account'],
  company_name: ['company_name'],
  company_tax_id: ['company_nip'],
  company_registration_number: ['company_regon'],
  company_address: ['company_address'],
  company_phone: ['company_phone'],
  company_email: ['company_email'],
  bride_name: ['bride_full_name'],
  client_name: ['bride_full_name'],
  bride_first_name: ['bride_first_name'],
  bride_last_name: ['bride_last_name'],
  groom_name: ['groom_full_name'],
  groom_first_name: ['groom_first_name'],
  groom_last_name: ['groom_last_name'],
  bride_phone: ['bride_phone'],
  client_phone: ['bride_phone'],
  groom_phone: ['groom_phone'],
  bride_email: ['bride_email'],
  client_email: ['bride_email'],
  groom_email: ['groom_email'],
  bride_address: ['bride_address'],
  groom_address: ['groom_address'],
  wedding_planner_name: ['wedding_planner_name'],
  wedding_planner_email: ['wedding_planner_email'],
  wedding_planner_phone: ['wedding_planner_phone'],
  package_duration: ['package_duration', 'coverage_hours'],
  coverage_hours: ['coverage_hours', 'package_duration'],
  coverage_end_time: ['coverage_end_time'],
  package_overtime_rate: ['package_overtime_rate', 'overtime_rate'],
  overtime_rate: ['overtime_rate', 'package_overtime_rate'],
  package_item: ['package_contents'],
  package_contents: ['package_contents'],
  payment_due_date: ['final_payment_due_date'],
  final_payment_due_date: ['final_payment_due_date'],
  delivery_deadline: ['delivery_deadline'],
  delivery_duration: ['delivery_duration'],
}

const CANONICAL_TO_REGISTRY: Record<string, string[]> = {
  'wedding.date': ['wedding_date'],
  'contract.execution_date': ['contract_execution_date'],
  'location.bride_preparation': ['preparation_location'],
  'location.ceremony': ['ceremony_location'],
  'location.reception': ['reception_location'],
  'package.name': ['package_name'],
  'package.contract_value': ['contract_value'],
  'payments.agreed_deposit': ['deposit_amount'],
  'payments.remaining': ['remaining_amount'],
  'company.bank_account': ['company_bank_account'],
  'company.legal_name': ['company_name'],
  'company.name': ['company_name'],
  'company.nip': ['company_nip'],
  'company.regon': ['company_regon'],
  'company.address': ['company_address'],
  'company.phone': ['company_phone'],
  'company.email': ['company_email'],
  'bride.full_name': ['bride_full_name'],
  'bride.first_name': ['bride_first_name'],
  'bride.last_name': ['bride_last_name'],
  'groom.full_name': ['groom_full_name'],
  'groom.first_name': ['groom_first_name'],
  'groom.last_name': ['groom_last_name'],
  'wedding.client1.firstName': ['bride_first_name'],
  'wedding.client1.lastName': ['bride_last_name'],
  'wedding.client2.firstName': ['groom_first_name'],
  'wedding.client2.lastName': ['groom_last_name'],
  'bride.phone': ['bride_phone'],
  'groom.phone': ['groom_phone'],
  'bride.email': ['bride_email'],
  'groom.email': ['groom_email'],
  'bride.address': ['bride_address'],
  'groom.address': ['groom_address'],
  'package.coverage_hours': ['coverage_hours', 'package_duration'],
  'package.coverage_end_time': ['coverage_end_time'],
  'package.overtime_rate': ['package_overtime_rate', 'overtime_rate'],
  'package.contents': ['package_contents'],
  'derived.final_payment_due_on_wedding_date': ['final_payment_due_date'],
  'derived.delivery_deadline': ['delivery_deadline'],
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

function normalizedDistinct(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const normalized = trimmed
      .normalize('NFC')
      .replace(/\u00a0|\u202f|\u2007/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .toLocaleLowerCase('pl-PL')
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(trimmed)
  }
  return result
}

export function registryKeysForConfiguredField(
  field: TemplateFieldConfiguration,
): string[] {
  const role = normalizeSemanticRole(field.semanticRole) ?? field.semanticRole
  return unique([
    ...(field.canonicalFieldKey
      ? (CANONICAL_TO_REGISTRY[field.canonicalFieldKey] ?? [])
      : []),
    ...(ROLE_TO_REGISTRY[role] ?? []),
    field.canonicalFieldKey?.includes('.') ? null : field.canonicalFieldKey,
  ])
}

function configuredFieldForSlot(
  slot: TemplateSlot,
  configuration: ContractTemplateConfiguration,
): TemplateFieldConfiguration | null {
  const direct = configuration.fields.find((field) =>
    field.detectedAnchorIds.includes(slot.id),
  )
  if (direct) return direct
  if (!slot.registryKey) return null
  return (
    configuration.fields.find((field) =>
      registryKeysForConfiguredField(field).includes(slot.registryKey!),
    ) ?? null
  )
}

export function selectGenerationTemplates(
  templates: DocumentTemplateSummary[],
  weddingPackageName?: string | null,
  context?: {
    packageId?: string | null
    serviceType?: string | null
  },
): GenerationTemplateSelection {
  const classification = classifyTemplatesForGeneration(templates)
  const { recommended, other } = splitRecommended(
    classification.selectable,
    weddingPackageName,
    {
      packageName: weddingPackageName,
      packageId: context?.packageId,
      serviceType: context?.serviceType,
    },
  )
  return {
    classification,
    recommended,
    alternatives: other,
    preselectedTemplateId:
      recommended[0]?.template.id ?? classification.selectable[0]?.template.id ?? null,
  }
}

function rebuildGroups(
  report: ContractCompletenessReport,
  fields: CompletenessField[],
) {
  return report.groups
    .map((group) => {
      const groupFields = fields.filter((field) => field.group === group.id)
      return {
        ...group,
        fields: groupFields,
        complete: groupFields.every((field) => !field.missing),
      }
    })
    .filter((group) => group.fields.length > 0)
}

export function enforceConfigurationOnCompleteness(
  report: ContractCompletenessReport,
  configuration: ContractTemplateConfiguration,
): ConfiguredContractCompletenessReport {
  const modeByRegistry = new Map<
    string,
    { field: TemplateFieldConfiguration; mode: TemplateFieldConfiguration['mode'] }
  >()
  for (const slot of report.slotMap.slots) {
    const configured = configuredFieldForSlot(slot, configuration)
    if (!configured || !slot.registryKey) continue
    modeByRegistry.set(slot.registryKey, {
      field: configured,
      mode: configured.mode,
    })
  }

  const fixedRegistryKeys: string[] = []
  const ignoredRegistryKeys: string[] = []
  const rawFields = report.fields
    .filter((field) => {
      const configured = modeByRegistry.get(field.registryKey)
      if (!configured) return false
      if (configured.mode === 'fixed') {
        fixedRegistryKeys.push(field.registryKey)
        return false
      }
      if (configured.mode === 'ignored') {
        ignoredRegistryKeys.push(field.registryKey)
        return false
      }
      return configured.mode === 'variable'
    })
    .map((field) => {
      const configured = modeByRegistry.get(field.registryKey)!.field
      const manual = configured.variableSource === 'manual'
      return {
        ...field,
        source: manual ? 'manual' : field.source,
        sourceLabel: manual
          ? field.missing
            ? 'Do uzupełnienia w tej umowie'
            : 'Ręcznie'
          : field.sourceLabel,
        label: configured.displayName || field.label,
        missing: configured.requiredWhenVariable ? field.missing : false,
      }
    })

  // Defense: configuration must never re-expand one logical key into N review rows.
  const fields = collapseCompletenessFieldsByRegistryKey(rawFields)
  const missing = fields.filter((field) => field.missing)
  return {
    ...report,
    configuration,
    fields,
    missing,
    groups: rebuildGroups(report, fields),
    allComplete: missing.length === 0,
    fixedRegistryKeys: unique(fixedRegistryKeys),
    ignoredRegistryKeys: unique(ignoredRegistryKeys),
  }
}

export async function prepareContractVerification(input: {
  wedding: Wedding
  templateId: string
  templateVersionId?: string | null
  /** Wedding package-contract route always passes true — do not rely on template meta alone. */
  packageContractMode?: boolean
  packageId?: string | null
  overrides?: Record<string, string>
  generationStartedAt?: Date | string | null
}): Promise<ConfiguredContractCompletenessReport> {
  const packageContractMode = Boolean(input.packageContractMode)
  const [{ documentTemplateService }, { fieldConfigurationFromMeta }] =
    await Promise.all([
      import('@/lib/api/documents'),
      import('@/features/ai-contract-lab/persistTemplateFieldConfiguration'),
    ])
  let template = await documentTemplateService.get(input.templateId)
  if (!template) throw new Error('Nie znaleziono szablonu umowy.')

  // Re-assert package mode on template meta so transform + reload stay consistent.
  if (packageContractMode && !template.meta?.packageContractMode) {
    await documentTemplateService.update(input.templateId, {
      meta: {
        ...(template.meta ?? { version: 1 }),
        version: 1,
        packageContractMode: true,
      },
    })
    template = (await documentTemplateService.get(input.templateId)) ?? template
  }

  let configuration = fieldConfigurationFromMeta(template.meta)
  if (
    !configuration ||
    template.meta.fieldConfigurationStatus !== 'ready' ||
    (template.meta.automaticAttentionIssues ?? []).some(
      (issue) => issue.code === 'physical_slots',
    )
  ) {
    const { ensureAutomaticTemplateConfiguration } = await import(
      '@/features/documents/template/ensureAutomaticTemplateConfiguration'
    )
    const repaired = await ensureAutomaticTemplateConfiguration(input.templateId)
    if (repaired.failure && !repaired.repaired && !repaired.readiness.configuration) {
      throw new Error(
        'Nie udało się dokończyć przygotowania szablonu. Spróbuj ponownie.',
      )
    }
    template = (await documentTemplateService.get(input.templateId)) ?? template
    configuration = fieldConfigurationFromMeta(template.meta)
    // ensureAutomatic can rewrite meta — restore packageContractMode.
    if (packageContractMode && !template.meta?.packageContractMode) {
      await documentTemplateService.update(input.templateId, {
        meta: {
          ...(template.meta ?? { version: 1 }),
          version: 1,
          packageContractMode: true,
        },
      })
      template = (await documentTemplateService.get(input.templateId)) ?? template
    }
  }

  if (!configuration) {
    throw new Error(
      'Szablon wymaga ponownej analizy przed generowaniem. Otwórz szablon w Umowach i uruchom analizę.',
    )
  }
  const { buildContractCompletenessReport } = await import(
    './buildContractCompleteness'
  )
  const report = await buildContractCompletenessReport({
    ...input,
    templateVersionId: input.templateVersionId,
  })
  let configured = enforceConfigurationOnCompleteness(report, configuration)
  configured = {
    ...configured,
    packageContractMode,
    packageId: input.packageId ?? input.wedding.packageId ?? null,
    packageTemplateVersionId: input.templateVersionId ?? null,
  }

  if (packageContractMode) {
    const {
      buildPackageContractGenerationModel,
      filterToPackageContractAllowlist,
    } = await import('./packageContractGenerationModel')
    const versionId =
      input.templateVersionId ?? template.currentVersionId ?? ''
    const model = buildPackageContractGenerationModel({
      templateId: input.templateId,
      templateVersionId: versionId,
      packageId: configured.packageId,
      slotMap: configured.slotMap,
    })
    // Authoritative filtered bindings for review + later generate.
    configured = {
      ...configured,
      slotMap: model.slotMap,
      fields: filterToPackageContractAllowlist(configured.fields),
      missing: filterToPackageContractAllowlist(configured.missing),
      groups: configured.groups
        .map((group) => ({
          ...group,
          fields: filterToPackageContractAllowlist(group.fields),
        }))
        .filter((group) => group.fields.length > 0),
      allComplete: filterToPackageContractAllowlist(configured.missing).length === 0,
    }
    console.info('[package-contract-review-prepare]', {
      weddingId: input.wedding.id,
      packageId: configured.packageId,
      templateId: input.templateId,
      templateVersionId: versionId,
      packageContractMode: true,
      generationSource: model.generationSource,
      logicalKeys: model.logicalFields.map((f) => f.registryKey),
      reviewFieldKeys: configured.fields.map((f) => f.registryKey),
      missingKeys: configured.missing.map((f) => f.registryKey),
    })
  }

  return configured
}

type SharedSlotGroup = {
  slots: TemplateSlot[]
  policy: SharedLocationPolicyConfig
}

function sharedLocationGroup(
  report: ConfiguredContractCompletenessReport,
): SharedSlotGroup | null {
  const locationKeys = new Set([
    'preparation_location',
    'ceremony_location',
    'reception_location',
  ])
  const groups = new Map<string, TemplateSlot[]>()
  for (const slot of report.slotMap.slots) {
    if (!slot.registryKey || !locationKeys.has(slot.registryKey)) continue
    if (slot.paragraphIndex == null) continue
    const start = slot.startOffset ?? slot.allowedRange?.start
    const end = slot.endOffset ?? slot.allowedRange?.end
    if (start == null || end == null) continue
    const key = `${slot.paragraphIndex}:${start}:${end}`
    const list = groups.get(key) ?? []
    list.push(slot)
    groups.set(key, list)
  }
  const slots = [...groups.values()].find(
    (items) => new Set(items.map((slot) => slot.registryKey)).size > 1,
  )
  const policy = report.configuration.sharedLocationPolicy
  return slots && policy ? { slots, policy } : null
}

function locationValue(
  key: string,
  report: ConfiguredContractCompletenessReport,
  overrides: Record<string, string>,
): string {
  return overrides[key]?.trim() || report.resolved[key]?.trim() || ''
}

function originalValuesForFixedSlots(
  report: ConfiguredContractCompletenessReport,
): { values: Record<string, string>; omittedKeys: string[] } {
  const values: Record<string, string> = {}
  const omittedKeys: string[] = []
  const retained = new Set([
    ...report.fixedRegistryKeys,
    ...report.ignoredRegistryKeys,
  ])
  for (const key of retained) {
    const slots = report.slotMap.slots.filter(
      (slot) => slot.registryKey === key && slot.enabled,
    )
    const originals = unique(slots.map((slot) => slot.originalText).filter(Boolean))
    if (originals.length >= 1) {
      // Prefer a single original; if variants exist, keep the first and leave
      // advanced diagnostics to surface the inconsistency — never block the photographer.
      values[key] = originals[0]!
    } else if (slots.length > 0) {
      omittedKeys.push(key)
    }
  }
  return { values, omittedKeys }
}

/**
 * Resolve slots that are not in field configuration without exposing mapping
 * diagnostics to the photographer.
 *
 * Pipeline: wedding/resolved value → preserve template original → omit (keep DOCX).
 */
function resolveUnconfiguredSlotsForGeneration(
  report: ConfiguredContractCompletenessReport,
  overrides: Record<string, string>,
): {
  values: Record<string, string>
  omittedKeys: string[]
  internalDiagnostics: string[]
} {
  const values: Record<string, string> = {}
  const omittedKeys: string[] = []
  const internalDiagnostics: string[] = []
  const configuredKeys = new Set(
    report.slotMap.slots
      .filter((slot) =>
        Boolean(configuredFieldForSlot(slot, report.configuration)),
      )
      .map((slot) => slot.registryKey)
      .filter((key): key is string => Boolean(key)),
  )

  for (const slot of report.slotMap.slots) {
    if (!slot.enabled || !slot.registryKey) continue
    if (configuredKeys.has(slot.registryKey)) continue
    if (slot.variableClassification === 'template_constant') {
      omittedKeys.push(slot.registryKey)
      continue
    }

    const fromOverride = overrides[slot.registryKey]?.trim()
    const fromResolved = report.resolved[slot.registryKey]?.trim()
    if (fromOverride) {
      values[slot.registryKey] = fromOverride
      continue
    }
    if (fromResolved) {
      values[slot.registryKey] = fromResolved
      continue
    }
    if (isSystemAutoResolvedContractKey(slot.registryKey)) {
      omittedKeys.push(slot.registryKey)
      continue
    }
    if (slot.originalText?.trim()) {
      omittedKeys.push(slot.registryKey)
      internalDiagnostics.push(
        `Slot „${slot.label || slot.registryKey}” (${slot.registryKey}) has no field configuration — preserving template text.`,
      )
      continue
    }
    omittedKeys.push(slot.registryKey)
    internalDiagnostics.push(
      `Slot „${slot.label || slot.registryKey}” (${slot.registryKey}) has no field configuration and no source value — omitted.`,
    )
  }

  return {
    values,
    omittedKeys: unique(omittedKeys),
    internalDiagnostics,
  }
}

/** Photographer-facing preflight messages only — never mapping/engine diagnostics. */
export function isPhotographerFacingGenerationError(message: string): boolean {
  const lower = message.toLocaleLowerCase('pl-PL')
  if (lower.includes('powiązania')) return false
  if (lower.includes('konfiguracj')) return false
  if (lower.includes('semantic')) return false
  if (lower.includes('canonical')) return false
  if (lower.includes('slot')) return false
  if (lower.includes('mapping')) return false
  if (lower.includes('diagnost')) return false
  return true
}

export function photographerFacingGenerationErrors(errors: string[]): string[] {
  return unique(
    errors
      .filter(isPhotographerFacingGenerationError)
      .map((message) => message.trim())
      .filter(Boolean),
  )
}

function sharedLocationNeedsDecision(
  report: ConfiguredContractCompletenessReport,
  overrides: Record<string, string>,
): {
  shared: SharedSlotGroup
  values: {
    preparation: string
    ceremony: string
    reception: string
  }
} | null {
  const shared = sharedLocationGroup(report)
  if (!shared) return null
  if (shared.policy.mode !== 'ask_each_time') return null
  const values = {
    preparation: locationValue(
      'preparation_location',
      report,
      overrides,
    ),
    ceremony: locationValue('ceremony_location', report, overrides),
    reception: locationValue('reception_location', report, overrides),
  }
  if (normalizedDistinct(Object.values(values)).length <= 1) return null
  return { shared, values }
}

/**
 * Authoritative photographer review + validation state.
 * Preserved / derived / invariant / suppressed diagnostics never block.
 */
function isPreflightFieldResolved(
  registryKey: string,
  overrides: Record<string, string>,
  effectiveOverrides: Record<string, string>,
): boolean {
  const raw =
    overrides[registryKey]?.trim() ||
    effectiveOverrides[registryKey]?.trim() ||
    ''
  if (registryKey === 'teaser_duration') {
    const teaser =
      raw ||
      overrides.film_duration?.trim() ||
      effectiveOverrides.film_duration?.trim() ||
      ''
    return isValidTeaserDuration(teaser)
  }
  if (registryKey === 'coverage_duration') {
    const duration =
      raw ||
      overrides.coverage_hours?.trim() ||
      effectiveOverrides.coverage_hours?.trim() ||
      ''
    return isValidCoverageDuration(duration)
  }
  if (registryKey === 'coverage_end_time') {
    return isValidCoverageEndTime(raw)
  }
  return Boolean(raw) && !isPlaceholderOnlyValue(raw)
}

export function buildGenerationReviewState(input: {
  report: ConfiguredContractCompletenessReport
  overrides: Record<string, string>
  sharedLocationDecision?: SharedLocationDecision | null
  /** Extra fields merged from a lower-layer actionable failure. */
  forcedEditableFields?: CompletenessField[]
  /** Runtime actionable issues that must survive review recomputation. */
  runtimeReviewIssues?: CompletenessField[]
  /** Explicit package-contract mode from the wedding route. */
  packageContractMode?: boolean
}): GenerationReviewState {
  const packageContractMode = Boolean(
    input.packageContractMode ?? input.report.packageContractMode,
  )
  const retained = originalValuesForFixedSlots(input.report)
  const unconfigured = resolveUnconfiguredSlotsForGeneration(
    input.report,
    input.overrides,
  )
  void unconfigured.internalDiagnostics

  const baseOverrides = expandCoverageOverrides({
    ...input.overrides,
    ...retained.values,
    ...unconfigured.values,
  })

  // Detect photographer questions from pre-decision values so answering does
  // not remove the question from review state.
  const locationAsk = sharedLocationNeedsDecision(input.report, baseOverrides)
  const contextualQuestions: GenerationReviewContextualQuestion[] = []
  if (locationAsk) {
    contextualQuestions.push({
      id: 'shared_location',
      label: 'Które miejsce wpisać w umowie?',
      answered:
        input.sharedLocationDecision === 'use_single' ||
        input.sharedLocationDecision === 'combine',
    })
  }

  const partyFromSlots = resolvePartyBlock({
    slots: input.report.slotMap.slots.filter(isSlotPhysicallyBound),
    wedding: {
      couple: {
        partner1:
          input.overrides.bride_full_name ||
          input.report.resolved.bride_full_name ||
          input.report.resolved.partner1_full_name ||
          '',
        partner2:
          input.overrides.groom_full_name ||
          input.report.resolved.groom_full_name ||
          input.report.resolved.partner2_full_name ||
          '',
        partner1Address:
          input.overrides.bride_address ||
          input.report.resolved.bride_address ||
          '',
        partner2Address:
          input.overrides.groom_address ||
          input.report.resolved.groom_address ||
          '',
      },
    } as Wedding,
  })
  if (partyFromSlots.addressAmbiguity) {
    const addrKey = partyFromSlots.addressAmbiguity.slotKeys[0] ?? 'bride_address'
    contextualQuestions.push({
      id: 'party_address',
      label: 'Partnerzy mają różne adresy — który wpisać w umowie?',
      answered: Boolean(input.overrides[addrKey]?.trim()),
    })
  }

  const paymentRule = inferPaymentDueRule({
    slots: input.report.slotMap.slots.filter(isSlotPhysicallyBound),
  })
  if (
    paymentDueRuleNeedsManualInput(paymentRule) &&
    input.report.slotMap.slots.some(
      (s) =>
        isSlotPhysicallyBound(s) &&
        (s.registryKey === 'final_payment_due_date' ||
          s.registryKey === 'payment_due_date'),
    )
  ) {
    const paymentAnswered = Boolean(
      input.overrides.final_payment_due_date?.trim() ||
        input.overrides.payment_due_date?.trim() ||
        baseOverrides.final_payment_due_date?.trim() ||
        baseOverrides.payment_due_date?.trim() ||
        input.report.resolved.final_payment_due_date?.trim() ||
        input.report.resolved.payment_due_date?.trim() ||
        input.report.fields.some(
          (f) =>
            (f.registryKey === 'final_payment_due_date' ||
              f.registryKey === 'payment_due_date') &&
            f.value.trim() &&
            !f.missing,
        ),
    )
    contextualQuestions.push({
      id: 'payment_due',
      label: 'Jaki termin płatności końcowej wpisać w umowie?',
      answered: paymentAnswered,
    })
  }

  const effectiveOverrides = { ...baseOverrides }
  for (const [key, value] of Object.entries(partyFromSlots.overrides)) {
    if (value.trim() && !effectiveOverrides[key]?.trim()) {
      effectiveOverrides[key] = value.trim()
    }
  }

  const omittedKeys = unique([
    ...input.report.fields
      .filter(
        (field) =>
          !field.missing &&
          !field.value.trim() &&
          !input.overrides[field.registryKey]?.trim(),
      )
      .map((field) => field.registryKey),
    ...retained.omittedKeys,
    ...unconfigured.omittedKeys,
  ])

  // Apply shared-location policy outcomes into effective overrides when possible.
  const shared = sharedLocationGroup(input.report)
  if (shared) {
    const values = {
      preparation: locationValue(
        'preparation_location',
        input.report,
        effectiveOverrides,
      ),
      ceremony: locationValue(
        'ceremony_location',
        input.report,
        effectiveOverrides,
      ),
      reception: locationValue(
        'reception_location',
        input.report,
        effectiveOverrides,
      ),
    }
    const distinct = normalizedDistinct(Object.values(values))
    if (distinct.length > 1) {
      let logicalValue = ''
      if (shared.policy.mode === 'combine_locations') {
        logicalValue = buildCombinedLocationPreview({
          ...values,
          format: shared.policy.combinedFormat,
        })
      } else if (shared.policy.mode === 'use_single_location') {
        logicalValue =
          values[shared.policy.preferredLocationRole ?? 'ceremony'] ||
          values.ceremony ||
          values.preparation ||
          values.reception
      } else if (input.sharedLocationDecision === 'combine') {
        logicalValue = buildCombinedLocationPreview({
          ...values,
          format: shared.policy.combinedFormat,
        })
      } else if (input.sharedLocationDecision === 'use_single') {
        logicalValue = values.ceremony || values.preparation || values.reception
      }
      if (logicalValue) {
        for (const slot of shared.slots) {
          if (slot.registryKey) effectiveOverrides[slot.registryKey] = logicalValue
        }
      }
    } else if (distinct[0]) {
      for (const slot of shared.slots) {
        if (slot.registryKey) effectiveOverrides[slot.registryKey] = distinct[0]
      }
    }
  }

  const resolvedValues = collapseCompletenessFieldsByRegistryKey(
    input.report.fields.filter(
      (field) =>
        !field.missing &&
        (field.value.trim() ||
          Boolean(effectiveOverrides[field.registryKey]?.trim())),
    ),
  )

  // Only fields the photographer can/must fill — never auto-derived / system keys.
  let editableMissingFields = collapseCompletenessFieldsByRegistryKey(
    input.report.missing.filter((field) => {
      if (isSystemAutoResolvedContractKey(field.registryKey)) return false
      const override = input.overrides[field.registryKey]?.trim()
      // Non-empty is not enough — incomplete drafts must stay editable.
      if (
        override &&
        !isIncompleteContractFieldValue(field.registryKey, override)
      ) {
        return false
      }
      if (
        effectiveOverrides[field.registryKey]?.trim() &&
        !isIncompleteContractFieldValue(
          field.registryKey,
          effectiveOverrides[field.registryKey],
        ) &&
        !input.overrides[field.registryKey]?.trim()
      ) {
        // Auto-derived complete values can resolve; incomplete ones cannot.
        return false
      }
      if (omittedKeys.includes(field.registryKey)) return false
      if (input.report.fixedRegistryKeys.includes(field.registryKey)) return false
      if (input.report.ignoredRegistryKeys.includes(field.registryKey)) return false
      return true
    }),
  )

  // Material package placeholders (underscores etc.) → editable before generation.
  // Package-contract mode: never invent teaser/film/coverage fields — immutable.
  const placeholderPackageFields: CompletenessField[] = []
  if (!packageContractMode) {
    for (const slot of input.report.slotMap.slots) {
      if (!isSlotPhysicallyBound(slot) || !slot.registryKey) continue
      if (!isMaterialPackageRegistryKey(slot.registryKey)) continue
      if (input.report.fixedRegistryKeys.includes(slot.registryKey)) continue
      if (input.report.ignoredRegistryKeys.includes(slot.registryKey)) continue
      const resolvedVal =
        effectiveOverrides[slot.registryKey]?.trim() ||
        input.report.resolved[slot.registryKey]?.trim() ||
        ''
      const originalIsPlaceholder = isPlaceholderOnlyValue(slot.originalText)
      if (
        (originalIsPlaceholder && !resolvedVal) ||
        (resolvedVal && isPlaceholderOnlyValue(resolvedVal))
      ) {
        const isTeaser = /teaser|teledysk|highlight|zapowied/i.test(
          `${slot.label} ${slot.originalText} ${slot.sampleContext ?? ''}`,
        )
        const label = isTeaser
          ? 'Długość teledysku'
          : slot.label.trim() || slot.registryKey
        const registryKey = isTeaser ? 'teaser_duration' : slot.registryKey
        if (editableMissingFields.some((f) => f.registryKey === registryKey)) {
          continue
        }
        if (placeholderPackageFields.some((f) => f.registryKey === registryKey)) {
          continue
        }
        placeholderPackageFields.push({
          slotId: slot.id,
          registryKey,
          label,
          group: 'package',
          value: '',
          missing: true,
          source: 'manual',
          sourceLabel: 'Tylko w tej umowie',
          placeholder: isTeaser ? 'np. 3–5 minut' : undefined,
        })
      }
    }
  }
  editableMissingFields.push(...placeholderPackageFields)
  editableMissingFields = collapseCompletenessFieldsByRegistryKey(
    editableMissingFields,
  )

  // Unbound teaser / coverage duration·end-time — must block before transform.
  // Package-contract mode: skip entirely (allowlist-only wedding fields).
  const hoursFromWedding = Number(
    String(input.report.resolved.coverage_hours || '').match(/\d+/)?.[0],
  )
  const hoursRaw =
    effectiveOverrides.coverage_hours ||
    input.report.resolved.coverage_hours ||
    ''
  const hoursNum = Number(String(hoursRaw).match(/\d+/)?.[0])
  const templateRequired = packageContractMode
    ? { editableFields: [], contextualIssues: [] as Array<{ id: string; message: string }> }
    : detectPreGenerationReviewIssues({
        slots: input.report.slotMap.slots,
        resolved: input.report.resolved,
        overrides: {},
        paragraphs: input.report.sourceParagraphs ?? [],
        coverageHours: Number.isFinite(hoursFromWedding) ? hoursFromWedding : null,
        coverageEndTime: input.report.resolved.coverage_end_time || null,
      })

  const preIssues = packageContractMode
    ? { editableFields: [], contextualIssues: [] as Array<{ id: string; message: string }> }
    : detectPreGenerationReviewIssues({
        slots: input.report.slotMap.slots,
        resolved: input.report.resolved,
        overrides: expandCoverageOverrides({
          ...input.overrides,
          ...effectiveOverrides,
        }),
        paragraphs: input.report.sourceParagraphs ?? [],
        coverageHours: Number.isFinite(hoursNum) ? hoursNum : null,
        coverageEndTime:
          effectiveOverrides.coverage_end_time ||
          input.report.resolved.coverage_end_time ||
          null,
      })

  for (const field of [
    ...templateRequired.editableFields,
    ...preIssues.editableFields,
  ]) {
    if (editableMissingFields.some((f) => f.registryKey === field.registryKey)) {
      continue
    }
    editableMissingFields.push({
      slotId: `preflight-${field.id}`,
      registryKey: field.registryKey,
      label: field.label,
      group: field.group,
      value: input.overrides[field.registryKey] ?? '',
      missing: true,
      source: 'manual',
      sourceLabel: field.sourceLabel,
      placeholder: field.placeholder,
    })
  }

  for (const field of [
    ...(input.forcedEditableFields ?? []),
    ...(input.runtimeReviewIssues ?? []),
  ]) {
    if (
      packageContractMode &&
      !isPackageContractAllowedDynamicKey(field.registryKey)
    ) {
      continue
    }
    if (editableMissingFields.some((f) => f.registryKey === field.registryKey)) {
      continue
    }
    editableMissingFields.push({
      ...field,
      missing: true,
      value: input.overrides[field.registryKey] ?? field.value ?? '',
    })
  }

  const blockingUserInputs: GenerationReviewBlockingInput[] = [
    ...editableMissingFields
      .filter(
        (field) =>
          !isPreflightFieldResolved(
            field.registryKey,
            input.overrides,
            effectiveOverrides,
          ),
      )
      .map((field) => ({
        kind: 'missing_field' as const,
        registryKey: field.registryKey,
        label: field.label,
        message: `Uzupełnij pole „${field.label}”.`,
      })),
    ...contextualQuestions
      .filter((question) => !question.answered)
      .map((question) => ({
        kind: 'contextual_question' as const,
        questionId: question.id,
        message:
          question.id === 'party_address'
            ? 'Partnerzy mają różne adresy — wybierz lub wpisz adres w umowie.'
            : question.id === 'payment_due'
              ? 'Uzupełnij termin płatności końcowej.'
              : 'Wybierz, które miejsce wpisać w umowie — albo połącz miejsca.',
      })),
    ...preIssues.contextualIssues.map((issue) => ({
      kind: 'semantic_collision' as const,
      issueId: issue.id,
      message: issue.message,
    })),
    ...templateRequired.contextualIssues
      .filter(
        (issue) =>
          !preIssues.contextualIssues.some((existing) => existing.id === issue.id),
      )
      .map((issue) => ({
        kind: 'semantic_collision' as const,
        issueId: issue.id,
        message: issue.message,
      })),
  ]

  // Final alias expansion so transform receives coverage_hours / film_duration.
  let finalOverrides = expandCoverageOverrides({
    ...effectiveOverrides,
    ...input.overrides,
  })
  // Never omit keys the photographer just filled (incl. teaser → film alias).
  let omittedKeysFinal = omittedKeys.filter((key) => {
    if (finalOverrides[key]?.trim()) return false
    if (
      (key === 'film_duration' || key === 'teaser_duration' || key === 'teaser') &&
      (finalOverrides.teaser_duration?.trim() ||
        finalOverrides.film_duration?.trim())
    ) {
      return false
    }
    return true
  })

  let resolvedOut = resolvedValues
  let editableOut = editableMissingFields
  let blockingOut = blockingUserInputs
  let questionsOut = contextualQuestions

  if (packageContractMode) {
    resolvedOut = filterToPackageContractAllowlist(resolvedOut)
    editableOut = filterToPackageContractAllowlist(editableOut)
    finalOverrides = filterOverrideKeysToPackageAllowlist(finalOverrides)
    omittedKeysFinal = omittedKeysFinal.filter((key) =>
      isPackageContractAllowedDynamicKey(key),
    )
    // Keep unanswered shared-location only; payment_due is answered via wedding value.
    questionsOut = contextualQuestions.filter(
      (q) => q.id === 'shared_location' && !q.answered,
    )
    blockingOut = [
      ...blockingOut.filter(
        (item) =>
          item.kind === 'missing_field' &&
          isPackageContractAllowedDynamicKey(item.registryKey),
      ),
      ...questionsOut.map((question) => ({
        kind: 'contextual_question' as const,
        questionId: question.id,
        message:
          'Wybierz, które miejsce wpisać w umowie — albo połącz miejsca.',
      })),
    ]
    console.info('[package-contract-review-state]', {
      packageContractMode: true,
      resolvedKeys: resolvedOut.map((f) => f.registryKey),
      editableKeys: editableOut.map((f) => f.registryKey),
      blockedByTeaser: editableOut.some((f) => f.registryKey === 'teaser_duration'),
    })
  }

  return {
    resolvedValues: resolvedOut,
    editableMissingFields: editableOut,
    contextualQuestions: questionsOut,
    blockingUserInputs: blockingOut,
    generationAllowed: blockingOut.length === 0,
    effectiveOverrides: finalOverrides,
    omittedKeys: omittedKeysFinal,
  }
}

export function runConfigurationAwarePreflight(input: {
  report: ConfiguredContractCompletenessReport
  overrides: Record<string, string>
  sharedLocationDecision?: SharedLocationDecision | null
}): GenerationPreflightResult {
  const review = buildGenerationReviewState(input)
  return {
    ok: review.generationAllowed,
    errors: review.blockingUserInputs.map((item) => item.message),
    effectiveOverrides: review.effectiveOverrides,
    omittedKeys: review.omittedKeys,
  }
}

const SAFE_WEDDING_OVERRIDE_KEYS = new Set([
  'wedding_date',
  'ceremony_time',
  'package_name',
  'contract_value',
  'deposit_amount',
])

export function weddingWithSafeOverrides(
  wedding: Wedding,
  overrides: Record<string, string>,
): Wedding {
  const next: Wedding = { ...wedding }
  if (overrides.wedding_date?.trim()) next.date = overrides.wedding_date.trim()
  if (overrides.ceremony_time?.trim()) {
    next.ceremonyTime = overrides.ceremony_time.trim()
  }
  if (overrides.package_name?.trim()) {
    next.packageName = overrides.package_name.trim()
  }
  if (overrides.contract_value?.trim()) {
    const amount = Number(overrides.contract_value.replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(amount)) next.price = amount
  }
  if (overrides.deposit_amount?.trim()) {
    const amount = Number(overrides.deposit_amount.replace(/\s/g, '').replace(',', '.'))
    if (Number.isFinite(amount)) next.depositAmount = amount
  }
  return next
}

export async function persistManualOverridesToWedding(input: {
  wedding: Wedding
  overrides: Record<string, string>
  scope: ManualOverrideScope
  update?: (wedding: Wedding) => Promise<Wedding>
}): Promise<Wedding> {
  if (input.scope === 'local_only') return input.wedding
  const unsafeKeys = Object.keys(input.overrides).filter(
    (key) => input.overrides[key]?.trim() && !SAFE_WEDDING_OVERRIDE_KEYS.has(key),
  )
  if (unsafeKeys.length > 0) {
    throw new Error(
      'Nie można bezpiecznie zapisać wszystkich poprawek w danych ślubu. Wybierz użycie tylko w tej umowie.',
    )
  }
  const next = weddingWithSafeOverrides(input.wedding, input.overrides)
  if (next === input.wedding || JSON.stringify(next) === JSON.stringify(input.wedding)) {
    return input.wedding
  }
  if (input.update) return input.update(next)
  const { weddingService } = await import('@/lib/api/weddingService')
  return weddingService.update(next)
}

export async function generateWeddingContract(input: {
  wedding: Wedding
  report: ConfiguredContractCompletenessReport
  overrides: Record<string, string>
  templateVersionId?: string
  packageContractMode?: boolean
  scope?: ManualOverrideScope
  sharedLocationDecision?: SharedLocationDecision | null
  generationDate?: Date | string
  correlationId?: string
}): Promise<GenerationAttemptResult> {
  const packageContractMode = Boolean(
    input.packageContractMode ?? input.report.packageContractMode,
  )
  // Correlation id only when review already allows generation.
  const reviewGate = buildGenerationReviewState({
    ...input,
    packageContractMode,
  })
  if (!reviewGate.generationAllowed) {
    return {
      status: 'needs_review',
      issues: reviewGate.blockingUserInputs.map((item) => ({
        id:
          item.kind === 'missing_field'
            ? item.registryKey
            : item.kind === 'semantic_collision'
              ? item.issueId
              : item.questionId,
        message: item.message,
        registryKeys:
          item.kind === 'missing_field'
            ? [item.registryKey]
            : item.kind === 'semantic_collision'
              ? []
              : [],
      })),
      reviewStatePatch: {
        editableFields: reviewGate.editableMissingFields,
        contextualMessages: reviewGate.blockingUserInputs.map((i) => i.message),
        issues: [],
      },
      correlationId: null,
    }
  }

  const correlationId = input.correlationId ?? createGenerationCorrelationId()
  const trace = {
    correlationId,
    templateId: input.report.templateId,
    templateVersionId: input.templateVersionId ?? null,
    weddingId: input.wedding.id,
  }

  try {
    logGenerationStage(trace, 'review_state_validation', 'started')
    logGenerationStage(trace, 'review_state_validation', 'succeeded', {
      editableMissing: reviewGate.editableMissingFields.length,
      contextualQuestions: reviewGate.contextualQuestions.length,
      packageContractMode,
    })

    logGenerationStage(trace, 'manual_overrides_merge', 'started')
    const wedding = await persistManualOverridesToWedding({
      wedding: input.wedding,
      overrides: packageContractMode
        ? filterOverrideKeysToPackageAllowlist(input.overrides)
        : input.overrides,
      scope: packageContractMode ? 'local_only' : (input.scope ?? 'local_only'),
    })
    logGenerationStage(trace, 'manual_overrides_merge', 'succeeded')

    logGenerationStage(trace, 'generation_input_build', 'started', {
      overrideKeys: Object.keys(reviewGate.effectiveOverrides).length,
      omittedKeys: reviewGate.omittedKeys.length,
      sharedLocationDecision: input.sharedLocationDecision ?? null,
      packageContractMode,
    })
    const { transformContract } = await import('./ContractTransformationService')
    logGenerationStage(trace, 'generation_input_build', 'succeeded')

    const artifact = await transformContract({
      wedding,
      templateId: input.report.templateId,
      templateVersionId: input.templateVersionId,
      packageContractMode,
      packageId: input.report.packageId ?? input.wedding.packageId ?? null,
      overrides: reviewGate.effectiveOverrides,
      omittedKeys: reviewGate.omittedKeys,
      questionnaireAnswers: input.report.questionnaireAnswers,
      generationDate: input.generationDate,
      correlationId,
    })
    return { status: 'completed', artifact }
  } catch (err) {
    if (err instanceof TransformNeedsReviewSignal) {
      const patch = actionablePayloadToReviewPatch(
        err.actionableReview,
        err.messages,
      )
      if (packageContractMode) {
        patch.editableFields = filterToPackageContractAllowlist(
          patch.editableFields,
        )
      }
      // Always surface product messages as issues — field mapping may be empty
      // after allowlist filter, but the photographer must still see why.
      const issues =
        patch.issues.length > 0
          ? patch.issues
          : err.messages
              .map((message) => message.trim())
              .filter(Boolean)
              .map((message, index) => ({
                id: `audit_message_${index}`,
                message,
                registryKeys: [] as string[],
              }))
      if (
        patch.contextualMessages.length === 0 &&
        err.messages.some((m) => m.trim())
      ) {
        patch.contextualMessages = err.messages
          .map((m) => m.trim())
          .filter(Boolean)
      }
      return {
        status: 'needs_review',
        issues,
        reviewStatePatch: patch,
        correlationId: err.correlationId,
      }
    }
    if (err instanceof GenerationPipelineError) throw err
    throw wrapGenerationFailure(
      trace,
      'unexpected_generation_error',
      'unexpected_generation_error',
      err,
      'Nie udało się wygenerować umowy.',
    )
  }
}

export const WeddingContractGenerationService = {
  selectTemplates: selectGenerationTemplates,
  prepareVerification: prepareContractVerification,
  buildReviewState: buildGenerationReviewState,
  preflight: runConfigurationAwarePreflight,
  persistManualOverrides: persistManualOverridesToWedding,
  generate: generateWeddingContract,
}
