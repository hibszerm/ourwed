/**
 * Phase B: deterministic semantic engine.
 * Maps document roles → wedding/derived values with field-aware equality,
 * value-span narrowing, temporal kinds, and patch safety gates.
 */

import type {
  AiContractAnalysisResult,
  ContractCanonicalField,
  DocumentSemanticMap,
  DocumentTextAnchor,
  SemanticMappingRow,
  SemanticQualityMetrics,
  SemanticStatus,
  SemanticValueKindUi,
} from '@/features/ai-contract-lab/aiContractLabTypes'
import {
  SEMANTIC_ROLE_LABELS,
  confidenceBand,
  normalizeSemanticRole,
  type ContractSemanticRole,
} from '@/features/ai-contract-lab/semanticRoleCatalog'
import {
  resolveDomainMapping,
  type SemanticDomainMapping,
} from '@/features/ai-contract-lab/semanticDomainMapping'
import {
  resolveExactSourceSpan,
  type SourceSpanResolution,
} from '@/features/ai-contract-lab/resolveExactSourceSpan'
import {
  equalityKindForField,
  semanticValuesEqual,
  formatDotDateFromIso,
} from '@/features/ai-contract-lab/semanticValueEquality'
import {
  computeTemporalValue,
  isoFromAnyDate,
  SEMANTIC_TEMPORAL_RULES,
} from '@/features/ai-contract-lab/semanticTemporalRules'
import type { ContractGenerationContext } from '@/features/ai-contract-lab/contractGenerationContext'
import {
  narrowSemanticValueSpan,
  sourceSpanIsValueOnly,
  valueTypeForRole,
  type SemanticValueType,
} from '@/features/ai-contract-lab/narrowSemanticValueSpan'
import {
  detectRelativeDuration,
  canonicalRelativeRule,
  formatRelativeRule,
  relativeDurationsEqual,
  type TemporalValue,
} from '@/features/ai-contract-lab/temporalValueModel'
import {
  classifyLegalReference,
  monetaryRoleHasLiteralAmount,
} from '@/features/ai-contract-lab/legalReferenceGuard'
import {
  comparePackageContentItem,
  parseCanonicalPackageItems,
} from '@/features/ai-contract-lab/packageContentItems'
import { canCreateSemanticPatch } from '@/features/ai-contract-lab/canCreateSemanticPatch'
import {
  classifyDefinedTerm,
  isLiteralPersonName,
  PERSON_NAME_ROLES,
} from '@/features/ai-contract-lab/definedTermGuard'
import {
  computePatchConfidence,
  decideStatusFromConfidence,
} from '@/features/ai-contract-lab/patchConfidence'
import { buildPatchPreview } from '@/features/ai-contract-lab/patchPreview'
import {
  formatDateLikeSource,
  formatMoneyLikeSource,
  resolveTypedSourceSpan,
} from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import { evaluateLocationReplacement, locationFormsFromSnapshot } from '@/features/ai-contract-lab/locationContractDisplay'
import { WEDDING_DOMAIN_MAPPINGS } from '@/features/ai-contract-lab/semanticDomainMapping'
import {
  classifyFieldMutability,
  isClientVariableRole,
  isRoleReplaceable,
  LEGAL_INVARIANT_REASON,
  resolveTemplateConfig,
  TEMPLATE_INVARIANT_REASON,
  type ContractTemplateVariableConfig,
} from '@/features/ai-contract-lab/templateFieldPolicy'
import {
  getEffectiveFieldMode,
  toContractTemplateVariableConfig,
  type ContractTemplateConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import { resolveRunAwareClientContact } from '@/features/ai-contract-lab/runAwareClientResolution'

export type SemanticFieldBinding = SemanticDomainMapping

/** Phase B role → business field map (alias of WEDDING_DOMAIN_MAPPINGS). */
export const SEMANTIC_ROLE_BINDINGS = WEDDING_DOMAIN_MAPPINGS

const CLAUSE_PREFIX_HINTS: Partial<Record<ContractSemanticRole, string[]>> = {
  payment_due_date: [
    'najpóźniej w dniu ',
    'w dniu ',
    'do dnia ',
    'płatna do ',
    'zapłaci Kamerzyście najpóźniej w dniu ',
  ],
  company_registration_number: ['REGON ', 'REGON: ', 'regon '],
  company_tax_id: ['NIP ', 'NIP: ', 'nip '],
  deposit_due_date: ['w terminie ', 'do dnia ', 'w ciągu '],
  delivery_deadline: ['w terminie ', 'do dnia ', 'w ciągu '],
  contract_execution_date: ['Zawarta w dniu ', 'zawarta w dniu ', 'w dniu '],
  contract_date: ['Zawarta w dniu ', 'zawarta w dniu ', 'w dniu '],
  package_name: ['Pakiecie ', 'pakiecie ', 'Pakiet ', 'pakiet '],
  coverage_end_time: ['do godziny ', 'godziny ', 'do godz. '],
  package_duration: ['maksymalnie ', 'wynosi ', 'godzin '],
}

function emptyMetrics(): SemanticQualityMetrics {
  return {
    semanticRolesDetected: 0,
    automaticMappings: 0,
    reviewMappings: 0,
    derivedMappings: 0,
    unchangedMappings: 0,
    replacementMappings: 0,
    ambiguousMappings: 0,
    ignoredMappings: 0,
    unresolvedRows: 0,
  }
}

function valueKindUi(
  role: string,
  temporal: TemporalValue | null,
  isLegal: boolean,
  isPackageItem: boolean,
): SemanticValueKindUi {
  if (isLegal) return 'legal_reference'
  if (isPackageItem) return 'package_item'
  if (temporal?.kind === 'relative_duration') return 'relative_duration'
  if (temporal?.kind === 'absolute_date') return 'absolute_date'
  if (temporal?.kind === 'time_of_day') return 'time'
  const vt = valueTypeForRole(role)
  if (vt === 'money') return 'money'
  if (vt === 'phone') return 'phone'
  if (vt === 'time_of_day') return 'time'
  if (vt === 'duration' || vt === 'hours') return 'duration'
  if (vt === 'location') return 'location'
  if (vt === 'date') return 'absolute_date'
  return 'text'
}

/**
 * Resolve value span using prefix/suffix + role clause hints before ambiguity.
 */
export function resolveSemanticSourceSpan(input: {
  anchorText: string
  sourceText: string
  prefixContext?: string | null
  suffixContext?: string | null
  documentLabel?: string | null
  role: ContractSemanticRole | null
}): SourceSpanResolution {
  const attempts: Array<{
    prefix?: string | null
    suffix?: string | null
  }> = [
    {
      prefix: input.prefixContext,
      suffix: input.suffixContext,
    },
  ]

  if (input.documentLabel?.trim()) {
    attempts.push({
      prefix: `${input.documentLabel.trim()} `,
      suffix: input.suffixContext,
    })
  }

  if (input.role) {
    for (const hint of CLAUSE_PREFIX_HINTS[input.role] ?? []) {
      attempts.push({ prefix: hint, suffix: input.suffixContext ?? '.' })
      attempts.push({ prefix: hint, suffix: null })
    }
  }

  let last: SourceSpanResolution = { status: 'not_found' }
  for (const attempt of attempts) {
    const span = resolveExactSourceSpan(input.anchorText, input.sourceText, {
      prefixContext: attempt.prefix,
      suffixContext: attempt.suffix,
    })
    last = span
    if (span.status === 'exact' || span.status === 'normalized_exact') {
      return span
    }
  }
  return last
}

function collectStudioMeta(fields: ContractCanonicalField[]): {
  weddingIso: string | null
  deliveryMonths: number | null
  previewDays: number | null
} {
  const weddingField = fields.find((f) => f.key === 'wedding.date')
  const weddingIso =
    isoFromAnyDate(weddingField?.formattedValue) ||
    isoFromAnyDate(
      weddingField?.value != null ? String(weddingField.value) : null,
    )

  let deliveryMonths: number | null = null
  const term = fields.find((f) => f.key === 'package.delivery_term')
  const m = (term?.formattedValue ?? '').match(/(\d+)\s*mies/i)
  if (m) deliveryMonths = Number(m[1])

  return { weddingIso, deliveryMonths, previewDays: null }
}

function emptyRowBase(partial: Partial<SemanticMappingRow> & Pick<
  SemanticMappingRow,
  | 'anchorId'
  | 'semanticRole'
  | 'semanticLabel'
  | 'confidence'
  | 'confidenceBand'
  | 'sourceText'
  | 'documentValue'
  | 'status'
>): SemanticMappingRow {
  return {
    documentLabel: null,
    canonicalValue: null,
    derivedValue: null,
    previewValue: null,
    mappedFieldKey: null,
    mappedDisplay: null,
    replacementStatus: 'ignored',
    reason: null,
    groupId: null,
    valueKind: 'other',
    exactPatchSpan: null,
    canonicalRule: null,
    patchable: false,
    temporalKind: null,
    semanticConfidence: partial.confidence,
    patchConfidence: 0,
    confidenceReasons: [],
    patchPreview: null,
    ...partial,
  }
}

/**
 * Build SemanticMappingRow[] + Phase-B analysis + quality metrics.
 */
export function mapSemanticMapToWeddingPlan(input: {
  semanticMap: DocumentSemanticMap
  fields: ContractCanonicalField[]
  anchors: DocumentTextAnchor[]
  generationContext: ContractGenerationContext
  /** Optional studio rule overrides (tests / future settings). */
  studioRules?: {
    depositDueDays?: number
    deliveryMonths?: number | null
    previewDays?: number | null
  }
  /** Template mutability overrides. Defaults are conservative. */
  templateConfig?: Partial<ContractTemplateVariableConfig> | null
  /** Explicit saved field configuration — wins over heuristics. */
  fieldConfiguration?: ContractTemplateConfiguration | null
}): {
  mappingRows: SemanticMappingRow[]
  analysis: AiContractAnalysisResult
  metrics: SemanticQualityMetrics
} {
  const fieldByKey = new Map(input.fields.map((f) => [f.key, f]))
  const anchorById = new Map(input.anchors.map((a) => [a.anchorId, a]))
  const fromSaved = input.fieldConfiguration
    ? toContractTemplateVariableConfig(input.fieldConfiguration)
    : null
  const templateConfig = resolveTemplateConfig({
    ...fromSaved,
    ...input.templateConfig,
    variableRoles: [
      ...(fromSaved?.variableRoles ?? []),
      ...(input.templateConfig?.variableRoles ?? []),
    ],
    invariantRoles: [
      ...(fromSaved?.invariantRoles ?? []),
      ...(input.templateConfig?.invariantRoles ?? []),
    ],
    packageFields: {
      ...fromSaved?.packageFields,
      ...input.templateConfig?.packageFields,
    },
  })
  const fieldConfiguration = input.fieldConfiguration ?? null
  const studio = collectStudioMeta(input.fields)
  if (input.studioRules?.deliveryMonths != null) {
    studio.deliveryMonths = input.studioRules.deliveryMonths
  }
  if (input.studioRules?.previewDays != null) {
    studio.previewDays = input.studioRules.previewDays
  }
  const depositDueDays = input.studioRules?.depositDueDays ?? 7
  const ctx = input.generationContext

  // Inject frozen contract execution date into field map for consumers
  fieldByKey.set('contract.execution_date', {
    key: 'contract.execution_date',
    label: 'Data zawarcia umowy',
    category: 'wedding',
    value: ctx.contractExecutionDate,
    formattedValue: ctx.contractExecutionDateFormatted,
    dataType: 'date',
    source: 'generation_context',
  })

  const mappingRows: SemanticMappingRow[] = []
  const replacements: AiContractAnalysisResult['replacements'] = []
  const ambiguities: AiContractAnalysisResult['ambiguities'] = []
  const metrics = emptyMetrics()
  metrics.unresolvedRows = input.semanticMap.unresolved?.length ?? 0
  metrics.semanticRolesDetected = input.semanticMap.semanticAnchors.length

  // Track primary company phone already matched (one canonical → one doc phone)
  let primaryPhoneMatched = false
  const secondaryPhone =
    fieldByKey.get('company.secondary_phone')?.formattedValue?.trim() || null

  let replIndex = 0

  for (const sa of input.semanticMap.semanticAnchors) {
    const band = confidenceBand(sa.confidence)
    const role: ContractSemanticRole | null = normalizeSemanticRole(
      sa.semanticRole,
    )
    const label = role
      ? SEMANTIC_ROLE_LABELS[role]
      : sa.semanticRole
    const binding = role ? resolveDomainMapping(role) : undefined
    const valueType: SemanticValueType = valueTypeForRole(role ?? sa.semanticRole)
    const docAnchor = anchorById.get(sa.anchorId)

    const pushMetrics = (status: SemanticStatus) => {
      if (status === 'UNCHANGED') metrics.unchangedMappings += 1
      else if (status === 'REPLACEMENT') metrics.replacementMappings += 1
      else if (status === 'DERIVED') {
        metrics.derivedMappings += 1
        metrics.replacementMappings += 1
      } else if (status === 'AMBIGUOUS') metrics.ambiguousMappings += 1
      else if (status === 'REVIEW') metrics.reviewMappings += 1
      else metrics.ignoredMappings += 1
    }

    // Explicit template field configuration wins over product heuristics.
    if (fieldConfiguration) {
      const effective = getEffectiveFieldMode({
        semanticRole: role ?? sa.semanticRole,
        canonicalFieldKey: binding?.fieldKey,
        templateConfiguration: fieldConfiguration,
        defaultPolicy: templateConfig,
      })
      if (effective.mode === 'fixed' || effective.mode === 'ignored') {
        pushMetrics('UNCHANGED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: sa.valueSpan.sourceText,
            status: 'UNCHANGED',
            replacementStatus: 'unchanged',
            reason: effective.reason,
            mappedFieldKey: null,
            mappedDisplay: null,
            valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
            patchable: false,
            semanticConfidence: sa.confidence,
            patchConfidence: 0,
            confidenceReasons: [
              `configured:${effective.configuredBy}`,
              effective.mode,
            ],
          }),
        )
        continue
      }
      if (effective.mode === 'review') {
        pushMetrics('REVIEW')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: sa.valueSpan.sourceText,
            status: 'REVIEW',
            replacementStatus: 'unmapped',
            reason:
              effective.reason ||
              'Wymaga decyzji — brak konfiguracji nowego pola',
            mappedFieldKey: binding?.fieldKey ?? null,
            mappedDisplay: binding?.displayMapping ?? null,
            valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
            patchable: false,
            semanticConfidence: sa.confidence,
            patchConfidence: 0,
            confidenceReasons: [`configured:${effective.configuredBy}`, 'review'],
          }),
        )
        continue
      }
      // variable — fall through; do not short-circuit as template_invariant
    }

    const mutability = classifyFieldMutability(role ?? sa.semanticRole, templateConfig)
    if (
      !fieldConfiguration &&
      (mutability === 'template_invariant' || mutability === 'legal_invariant') &&
      templateConfig.templateMigrationMode !== true
    ) {
      pushMetrics('UNCHANGED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'UNCHANGED',
          replacementStatus: 'unchanged',
          reason:
            mutability === 'legal_invariant'
              ? LEGAL_INVARIANT_REASON
              : TEMPLATE_INVARIANT_REASON,
          mappedFieldKey: null,
          mappedDisplay: null,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, mutability === 'legal_invariant', false),
          patchable: false,
          semanticConfidence: sa.confidence,
          patchConfidence: 0,
          confidenceReasons: ['template_invariant'],
        }),
      )
      continue
    }

    // Legal reference guard (before bindings / fixed-clause short-circuit)
    const legal = classifyLegalReference({
      semanticRole: role ?? sa.semanticRole,
      sourceText: sa.valueSpan.sourceText,
      anchorText: docAnchor?.text ?? '',
    })

    if (legal.isLegalReference) {
      pushMetrics('IGNORED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: legal.legalRole ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'IGNORED',
          reason:
            legal.reason ??
            'Legal reference — not a patchable financial amount',
          valueKind: 'legal_reference',
          canonicalRule:
            legal.numericValue != null
              ? `multiplier=${legal.numericValue}`
              : 'legal clause',
          patchable: false,
          semanticConfidence: sa.confidence,
          patchConfidence: 0,
        }),
      )
      continue
    }

    // Defined-term / legal party reference (Parą Młodą, Klientem, …)
    const defined = classifyDefinedTerm(sa.valueSpan.sourceText)
    if (
      defined.isDefinedTerm &&
      (PERSON_NAME_ROLES.has(sa.semanticRole) ||
        sa.semanticRole === 'client_name' ||
        defined.role != null)
    ) {
      pushMetrics('IGNORED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: defined.role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'IGNORED',
          reason: defined.reason ?? 'Legal defined term, not personal data',
          valueKind: 'defined_term',
          patchable: false,
          semanticConfidence: sa.confidence,
          patchConfidence: 0,
        }),
      )
      continue
    }

    // User-configurable payment/delivery roles stay unchanged when mode is fixed.
    if (
      mutability === 'user_configurable' &&
      !isRoleReplaceable(role ?? sa.semanticRole, templateConfig)
    ) {
      const temporalPreview =
        role === 'delivery_deadline' ||
        role === 'deposit_due_date' ||
        role === 'preview_deadline'
          ? detectRelativeDuration({
              sourceText: sa.valueSpan.sourceText,
              anchorText: docAnchor?.text ?? sa.valueSpan.sourceText,
              role: role ?? sa.semanticRole,
            })
          : null
      pushMetrics('UNCHANGED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'UNCHANGED',
          replacementStatus: 'unchanged',
          reason: TEMPLATE_INVARIANT_REASON,
          mappedFieldKey: null,
          mappedDisplay: null,
          valueKind: valueKindUi(
            role ?? sa.semanticRole,
            temporalPreview,
            false,
            false,
          ),
          temporalKind: temporalPreview?.kind ?? null,
          exactPatchSpan: sa.valueSpan.sourceText,
          canonicalRule:
            temporalPreview?.kind === 'relative_duration'
              ? formatRelativeRule(temporalPreview)
              : null,
          patchable: false,
          semanticConfidence: sa.confidence,
          patchConfidence: 0,
          confidenceReasons: ['fixed_template_clause'],
        }),
      )
      continue
    }

    // Person-name roles require a literal name
    if (PERSON_NAME_ROLES.has(sa.semanticRole)) {
      if (!isLiteralPersonName(sa.valueSpan.sourceText)) {
        pushMetrics('IGNORED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: sa.valueSpan.sourceText,
            status: 'IGNORED',
            reason: 'Not a literal person name',
            valueKind: 'defined_term',
            patchable: false,
            semanticConfidence: sa.confidence,
            patchConfidence: 0,
          }),
        )
        continue
      }
    }

    if (band === 'ignore') {
      pushMetrics('IGNORED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'IGNORED',
          reason: 'Pewność poniżej 0.60 — pominięto.',
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
        }),
      )
      continue
    }

    if (!binding || !docAnchor) {
      pushMetrics('IGNORED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'IGNORED',
          replacementStatus: binding ? 'unmapped' : 'unmapped',
          reason: !docAnchor ? 'Nieznany anchor.' : 'Brak mapowania roli.',
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
        }),
      )
      continue
    }

    // Narrow to value-only span
    let narrowed = narrowSemanticValueSpan({
      semanticRole: role ?? sa.semanticRole,
      anchorText: docAnchor.text,
      proposedSourceText: sa.valueSpan.sourceText,
      prefixContext: sa.valueSpan.prefixContext,
      suffixContext: sa.valueSpan.suffixContext,
      valueType,
    })

    // Run-aware client phone/email recovery (fragmented DOCX runs)
    if (
      !narrowed &&
      docAnchor &&
      isClientVariableRole(role ?? sa.semanticRole) &&
      (valueType === 'phone' ||
        /email|_email$/i.test(role ?? sa.semanticRole) ||
        valueType === 'text')
    ) {
      const contact = resolveRunAwareClientContact({
        role: role ?? sa.semanticRole,
        anchor: docAnchor,
        proposedSourceText: sa.valueSpan.sourceText,
      })
      if (contact) {
        narrowed = {
          exactSourceText: contact.exactSourceText,
          start: contact.start,
          end: contact.end,
          confidence: contact.confidence,
          strategy: 'typed_value_extract',
        }
      }
    }

    // Typed fallback when narrowing fails (dates / money formatting)
    let typedStrategy: string | null = null
    if (!narrowed) {
      const typed = resolveTypedSourceSpan({
        anchorId: sa.anchorId,
        anchorText: docAnchor.text,
        semanticRole: role ?? sa.semanticRole,
        valueKind:
          valueType === 'date' || valueType === 'money' ? valueType : valueType,
        proposedSourceText: sa.valueSpan.sourceText,
        prefixContext: sa.valueSpan.prefixContext,
        suffixContext: sa.valueSpan.suffixContext,
        runStart: docAnchor.runStart,
        runEnd: docAnchor.runEnd,
      })
      if (typed) {
        narrowed = {
          exactSourceText: typed.exactSourceText,
          start: typed.start,
          end: typed.end,
          confidence: typed.confidence,
          strategy: 'typed_value_extract',
        }
        typedStrategy = typed.strategy
      }
    }

    // Also try resolveSemanticSourceSpan then narrow
    let exactDoc: string | null = narrowed?.exactSourceText ?? null
    let spanResolved = Boolean(narrowed)

    if (!exactDoc) {
      const span = resolveSemanticSourceSpan({
        anchorText: docAnchor.text,
        sourceText: sa.valueSpan.sourceText,
        prefixContext: sa.valueSpan.prefixContext,
        suffixContext: sa.valueSpan.suffixContext,
        documentLabel: sa.documentLabel,
        role,
      })
      if (span.status === 'ambiguous') {
        pushMetrics('AMBIGUOUS')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: sa.valueSpan.sourceText,
            status: 'AMBIGUOUS',
            replacementStatus: 'span_unresolved',
            reason: 'Multiple valid source spans',
            mappedFieldKey: binding.fieldKey,
            mappedDisplay: binding.displayMapping,
            valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
          }),
        )
        ambiguities.push({
          ambiguityId: `sem:${sa.anchorId}:${sa.semanticRole}`,
          anchorId: sa.anchorId,
          originalText: sa.valueSpan.sourceText,
          candidateFieldKeys: [binding.fieldKey],
          reason: 'Multiple valid source spans',
        })
        continue
      }
      if (span.status === 'exact' || span.status === 'normalized_exact') {
        const reNarrow = narrowSemanticValueSpan({
          semanticRole: role ?? sa.semanticRole,
          anchorText: docAnchor.text,
          proposedSourceText: span.exactSourceText,
          prefixContext: sa.valueSpan.prefixContext,
          suffixContext: sa.valueSpan.suffixContext,
          valueType,
        })
        exactDoc = reNarrow?.exactSourceText ?? span.exactSourceText
        spanResolved = true
        if (
          reNarrow == null &&
          !sourceSpanIsValueOnly(span.exactSourceText, valueType)
        ) {
          pushMetrics('REVIEW')
          mappingRows.push(
            emptyRowBase({
              anchorId: sa.anchorId,
              semanticRole: role ?? sa.semanticRole,
              semanticLabel: label,
              confidence: sa.confidence,
              confidenceBand: band,
              documentLabel: sa.documentLabel ?? null,
              sourceText: sa.valueSpan.sourceText,
              documentValue: span.exactSourceText,
              status: 'REVIEW',
              replacementStatus: 'span_unresolved',
              reason:
                'Unsafe broad source span includes legal wording — manual narrow required',
              mappedFieldKey: binding.fieldKey,
              mappedDisplay: binding.displayMapping,
              exactPatchSpan: null,
              valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
              patchable: false,
            }),
          )
          continue
        }
      }
    }

    if (!exactDoc || !spanResolved) {
      pushMetrics('REVIEW')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: sa.valueSpan.sourceText,
          status: 'REVIEW',
          replacementStatus: 'span_unresolved',
          reason: 'Nie udało się zawęzić bezpiecznego value span.',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
        }),
      )
      continue
    }

    const isValueOnly = sourceSpanIsValueOnly(exactDoc, valueType)
    if (!isValueOnly) {
      pushMetrics('REVIEW')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          status: 'REVIEW',
          replacementStatus: 'span_unresolved',
          reason: 'Source span is not value-only',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          exactPatchSpan: exactDoc,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
        }),
      )
      continue
    }

    // ——— Package contents (item-level) ———
    if (binding.kind === 'package_content') {
      const contentsField = fieldByKey.get(binding.fieldKey)
      const canonicalItems = parseCanonicalPackageItems(
        contentsField?.formattedValue,
      )
      const cmp = comparePackageContentItem({
        documentText: exactDoc,
        canonicalItems,
      })
      let status: SemanticStatus =
        cmp.status === 'DOCUMENT_ONLY'
          ? 'DOCUMENT_ONLY'
          : cmp.status === 'REPLACEMENT'
            ? 'REPLACEMENT'
            : cmp.status === 'REVIEW'
              ? 'REVIEW'
              : 'UNCHANGED'
      if (cmp.status === 'MISSING_CANONICAL_ITEM') status = 'REVIEW'

      pushMetrics(status === 'DOCUMENT_ONLY' ? 'IGNORED' : status)
      const patchable = canCreateSemanticPatch({
        status,
        exactValueSpanResolved: true,
        sourceSpanIsValueOnly: true,
        canonicalOrDerivedValueAvailable: Boolean(cmp.matchedCanonical),
        isLegalReference: false,
        isDocumentOnly: status === 'DOCUMENT_ONLY',
        isCollectionLevelPlaceholder: false,
        originalText: exactDoc,
        replacementText: cmp.matchedCanonical ?? '',
      })

      if (patchable && cmp.matchedCanonical) {
        replIndex += 1
        replacements.push({
          replacementId: `sem:${replIndex}:${sa.anchorId}`,
          anchorId: sa.anchorId,
          originalText: exactDoc,
          canonicalFieldKey: binding.fieldKey,
          proposedValue: cmp.matchedCanonical,
          semanticRole: label,
          reason: cmp.reason,
          confidence: sa.confidence,
          requiresUserReview: true,
          prefixContext: sa.valueSpan.prefixContext ?? null,
          suffixContext: sa.valueSpan.suffixContext ?? null,
        })
      }

      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          canonicalValue: cmp.matchedCanonical,
          status,
          replacementStatus: patchable ? 'replacement' : 'unchanged',
          reason: cmp.reason,
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          groupId: 'PackageContentCollection',
          valueKind: 'package_item',
          exactPatchSpan: exactDoc,
          canonicalRule: cmp.matchedCanonical,
          patchable,
        }),
      )
      continue
    }

    // ——— Relative temporal roles ———
    const relativeDetected =
      role === 'delivery_deadline' ||
      role === 'deposit_due_date' ||
      role === 'preview_deadline'
        ? detectRelativeDuration({
            sourceText: sa.valueSpan.sourceText,
            anchorText: docAnchor.text,
            role,
          })
        : null

    if (relativeDetected?.kind === 'relative_duration') {
      const canonicalRel = canonicalRelativeRule({
        role: role!,
        deliveryMonths: studio.deliveryMonths,
        depositDueDays,
        previewDays: studio.previewDays,
      })
      const previewBase =
        relativeDetected.base === 'contract.executionDate'
          ? ctx.contractExecutionDate
          : studio.weddingIso
      let preview: string | null = null
      if (previewBase && canonicalRel) {
        const rule = SEMANTIC_TEMPORAL_RULES[role!]
        if (rule) {
          const computed = computeTemporalValue({
            rule,
            baseIso: previewBase,
            deliveryMonths: studio.deliveryMonths,
            previewDays: studio.previewDays,
          })
          preview = computed?.formatted ?? null
        }
      }

      const matches =
        canonicalRel != null &&
        relativeDurationsEqual(relativeDetected, canonicalRel)

      if (matches) {
        pushMetrics('UNCHANGED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            derivedValue: null,
            previewValue: preview,
            status: 'UNCHANGED',
            replacementStatus: 'unchanged',
            reason: 'Relative temporal rule already matches',
            mappedFieldKey: binding.fieldKey,
            mappedDisplay: binding.displayMapping,
            valueKind: 'relative_duration',
            exactPatchSpan: exactDoc,
            canonicalRule: canonicalRel
              ? formatRelativeRule(canonicalRel)
              : null,
            patchable: false,
            temporalKind: 'relative_duration',
          }),
        )
        continue
      }

      // Patch only the duration number — never an absolute date
      const proposedAmount = canonicalRel ? String(canonicalRel.amount) : null
      const status: SemanticStatus =
        band === 'review' ? 'REVIEW' : 'REPLACEMENT'
      const patchable = canCreateSemanticPatch({
        status: status === 'REVIEW' ? 'REPLACEMENT' : status,
        exactValueSpanResolved: true,
        sourceSpanIsValueOnly: /^\d+$/.test(exactDoc),
        canonicalOrDerivedValueAvailable: Boolean(proposedAmount),
        isLegalReference: false,
        isDocumentOnly: false,
        isCollectionLevelPlaceholder: false,
        originalText: exactDoc,
        replacementText: proposedAmount ?? '',
        absoluteIntoRelative: false,
      })

      // Ensure we are patching a number, not a date-looking span
      if (!/^\d+$/.test(exactDoc)) {
        // Try to re-narrow to number only
        const numNarrow = narrowSemanticValueSpan({
          semanticRole: role ?? sa.semanticRole,
          anchorText: docAnchor.text,
          proposedSourceText: sa.valueSpan.sourceText,
          prefixContext: sa.valueSpan.prefixContext,
          suffixContext: sa.valueSpan.suffixContext,
          valueType: 'duration',
        })
        if (numNarrow && /^\d+$/.test(numNarrow.exactSourceText)) {
          exactDoc = numNarrow.exactSourceText
        } else {
          pushMetrics('REVIEW')
          mappingRows.push(
            emptyRowBase({
              anchorId: sa.anchorId,
              semanticRole: role ?? sa.semanticRole,
              semanticLabel: label,
              confidence: sa.confidence,
              confidenceBand: band,
              documentLabel: sa.documentLabel ?? null,
              sourceText: sa.valueSpan.sourceText,
              documentValue: exactDoc,
              previewValue: preview,
              status: 'REVIEW',
              reason:
                'Relative duration clause — could not isolate duration number',
              mappedFieldKey: binding.fieldKey,
              mappedDisplay: binding.displayMapping,
              valueKind: 'relative_duration',
              exactPatchSpan: exactDoc,
              canonicalRule: canonicalRel
                ? formatRelativeRule(canonicalRel)
                : null,
              patchable: false,
              temporalKind: 'relative_duration',
            }),
          )
          continue
        }
      }

      if (patchable && proposedAmount && exactDoc !== proposedAmount) {
        if (band === 'review') metrics.reviewMappings += 1
        else metrics.automaticMappings += 1
        pushMetrics('REPLACEMENT')
        replIndex += 1
        replacements.push({
          replacementId: `sem:${replIndex}:${sa.anchorId}`,
          anchorId: sa.anchorId,
          originalText: exactDoc,
          canonicalFieldKey: binding.fieldKey,
          proposedValue: proposedAmount,
          semanticRole: label,
          reason: `Relative duration ${relativeDetected.amount} → ${proposedAmount}`,
          confidence: sa.confidence,
          requiresUserReview: band === 'review',
          prefixContext: sa.valueSpan.prefixContext ?? null,
          suffixContext: sa.valueSpan.suffixContext ?? null,
        })
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            canonicalValue: proposedAmount,
            previewValue: preview,
            status: band === 'review' ? 'REVIEW' : 'REPLACEMENT',
            replacementStatus: 'replacement',
            reason: 'Different relative temporal rule',
            mappedFieldKey: binding.fieldKey,
            mappedDisplay: binding.displayMapping,
            valueKind: 'relative_duration',
            exactPatchSpan: exactDoc,
            canonicalRule: canonicalRel
              ? formatRelativeRule(canonicalRel)
              : null,
            patchable: true,
            temporalKind: 'relative_duration',
          }),
        )
      } else {
        pushMetrics('UNCHANGED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            previewValue: preview,
            status: 'UNCHANGED',
            replacementStatus: 'unchanged',
            reason: 'Relative temporal rule already matches',
            mappedFieldKey: binding.fieldKey,
            mappedDisplay: binding.displayMapping,
            valueKind: 'relative_duration',
            exactPatchSpan: exactDoc,
            canonicalRule: canonicalRel
              ? formatRelativeRule(canonicalRel)
              : null,
            patchable: false,
            temporalKind: 'relative_duration',
          }),
        )
      }
      continue
    }

    // ——— Resolve proposed canonical / derived / generation value ———
    let proposed: string | null = null
    let canonicalDisplay: string | null = null
    let derivedDisplay: string | null = null
    let isDerived = false
    let temporalKind: SemanticMappingRow['temporalKind'] = null
    let canonicalRule: string | null = binding.displayMapping

    if (binding.kind === 'generation') {
      proposed = ctx.contractExecutionDateFormatted
      derivedDisplay = proposed
      isDerived = true
      temporalKind = 'absolute_date'
      canonicalRule = `context.contractExecutionDate (${ctx.timezone})`
    } else if (binding.kind === 'derived' && binding.temporal) {
      // Absolute-date derived (e.g. final payment) — only when NOT relative
      const baseIso =
        binding.temporal.base === 'wedding.date'
          ? studio.weddingIso
          : ctx.contractExecutionDate
      const computed = computeTemporalValue({
        rule: binding.temporal,
        baseIso,
        deliveryMonths: studio.deliveryMonths,
        previewDays: studio.previewDays,
      })
      const snap = fieldByKey.get(binding.fieldKey)
      proposed =
        snap?.formattedValue?.trim() || computed?.formatted || null
      // Prefer wedding date format from snapshot for final payment
      if (role === 'payment_due_date' && studio.weddingIso) {
        proposed =
          fieldByKey.get('wedding.date')?.formattedValue?.trim() ||
          formatDotDateFromIso(studio.weddingIso)
      }
      derivedDisplay = proposed
      isDerived = true
      temporalKind = 'absolute_date'
      canonicalRule = binding.displayMapping
    } else if (binding.kind === 'canonical') {
      const snap = fieldByKey.get(binding.fieldKey)
      proposed = snap?.formattedValue?.trim() || null
      canonicalDisplay = proposed
      if (valueType === 'time_of_day') temporalKind = 'time_of_day'
    }

    // ——— Locations: require contractDisplay when grammar needs it ———
    if (valueType === 'location' && binding.kind === 'canonical') {
      const displayField = fieldByKey.get(`${binding.fieldKey}.contract_display`)
      const addressField = fieldByKey.get(`${binding.fieldKey}.address`)
      const forms = locationFormsFromSnapshot({
        name: proposed,
        address: addressField?.formattedValue,
        contractDisplay: displayField?.formattedValue,
      })
      const locEval = evaluateLocationReplacement({
        beforeContext: sa.valueSpan.prefixContext ?? '',
        forms,
        fallbackName: proposed,
      })
      if (locEval.requiresReview) {
        pushMetrics('REVIEW')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            canonicalValue: proposed,
            status: 'REVIEW',
            reason:
              locEval.reason ?? 'Missing contract-ready display value',
            mappedFieldKey: binding.fieldKey,
            mappedDisplay: binding.displayMapping,
            valueKind: 'location',
            exactPatchSpan: exactDoc,
            patchable: false,
            semanticConfidence: sa.confidence,
            patchConfidence: 0,
            confidenceReasons: ['contractDisplay required'],
          }),
        )
        continue
      }
      if (locEval.displayValue) {
        proposed = locEval.displayValue
        canonicalDisplay = locEval.displayValue
      }
    }

    // ——— Company phones: primary once, extras DOCUMENT_ONLY ———
    if (role === 'company_phone' && proposed) {
      const kind = equalityKindForField(binding.fieldKey, 'phone')
      const matchesPrimary = semanticValuesEqual(exactDoc, proposed, kind)
      const matchesSecondary =
        secondaryPhone != null &&
        semanticValuesEqual(exactDoc, secondaryPhone, kind)

      if (matchesPrimary && !primaryPhoneMatched) {
        primaryPhoneMatched = true
        pushMetrics('UNCHANGED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            canonicalValue: proposed,
            status: 'UNCHANGED',
            replacementStatus: 'unchanged',
            reason: 'Already matches',
            mappedFieldKey: binding.fieldKey,
            mappedDisplay: 'business.primaryPhone',
            valueKind: 'phone',
            exactPatchSpan: exactDoc,
            canonicalRule: 'business.primaryPhone',
            patchable: false,
          }),
        )
        continue
      }

      if (matchesSecondary) {
        pushMetrics('UNCHANGED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            canonicalValue: secondaryPhone,
            status: 'UNCHANGED',
            replacementStatus: 'unchanged',
            reason: 'Already matches secondary phone',
            mappedFieldKey: 'company.secondary_phone',
            mappedDisplay: 'business.secondaryPhone',
            valueKind: 'phone',
            exactPatchSpan: exactDoc,
            canonicalRule: 'business.secondaryPhone',
            patchable: false,
          }),
        )
        continue
      }

      if (primaryPhoneMatched || matchesPrimary) {
        // Extra distinct phone — do not overwrite with primary
        pushMetrics('IGNORED')
        mappingRows.push(
          emptyRowBase({
            anchorId: sa.anchorId,
            semanticRole: role ?? sa.semanticRole,
            semanticLabel: label,
            confidence: sa.confidence,
            confidenceBand: band,
            documentLabel: sa.documentLabel ?? null,
            sourceText: sa.valueSpan.sourceText,
            documentValue: exactDoc,
            status: 'DOCUMENT_ONLY',
            replacementStatus: 'ignored',
            reason: 'Additional document phone has no canonical binding',
            mappedFieldKey: null,
            mappedDisplay: null,
            valueKind: 'phone',
            exactPatchSpan: exactDoc,
            patchable: false,
          }),
        )
        continue
      }

      // First phone differs from primary → replacement once
      primaryPhoneMatched = true
    }

    if (!proposed) {
      pushMetrics('IGNORED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          status: 'IGNORED',
          replacementStatus: 'missing_value',
          reason: 'Brak wartości w katalogu / regule derived.',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          exactPatchSpan: exactDoc,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
        }),
      )
      continue
    }

    const field = fieldByKey.get(binding.fieldKey)
    const kind = equalityKindForField(binding.fieldKey, field?.dataType ?? valueType)

    if (semanticValuesEqual(exactDoc, proposed, kind)) {
      pushMetrics('UNCHANGED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          canonicalValue: isDerived ? null : proposed,
          derivedValue: isDerived ? proposed : null,
          status: 'UNCHANGED',
          replacementStatus: 'unchanged',
          reason: 'Already matches',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
          exactPatchSpan: exactDoc,
          canonicalRule,
          patchable: false,
          temporalKind,
        }),
      )
      continue
    }

    // Style-preserving formatters for dates / money
    if (valueType === 'date' && proposed) {
      const styled = formatDateLikeSource({
        canonicalDate: isoFromAnyDate(proposed) ?? proposed,
        sourceText: exactDoc,
      })
      proposed = styled
      if (isDerived) derivedDisplay = styled
      else canonicalDisplay = styled
    } else if (valueType === 'money' && proposed) {
      const amount = Number(
        String(proposed)
          .replace(/zł|pln|zl/gi, '')
          .replace(/\s/g, '')
          .replace(',', '.'),
      )
      if (Number.isFinite(amount)) {
        const styled = formatMoneyLikeSource({
          canonicalAmount: amount,
          sourceText: exactDoc,
        })
        proposed = styled
        canonicalDisplay = styled
      }
    }

    // Re-check equality after style-preserving format (still compare normalized)
    if (semanticValuesEqual(exactDoc, proposed, kind)) {
      pushMetrics('UNCHANGED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          canonicalValue: isDerived ? null : proposed,
          derivedValue: isDerived ? proposed : null,
          status: 'UNCHANGED',
          replacementStatus: 'unchanged',
          reason: 'Already matches',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
          exactPatchSpan: exactDoc,
          canonicalRule,
          patchable: false,
          temporalKind,
          semanticConfidence: sa.confidence,
          patchConfidence: 1,
        }),
      )
      continue
    }

    // Monetary literal guard
    const monetaryOk = monetaryRoleHasLiteralAmount(binding.fieldKey, exactDoc)
    if (!monetaryOk) {
      pushMetrics('IGNORED')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          status: 'IGNORED',
          reason: 'Monetary role without literal amount — no patch',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          valueKind: 'legal_reference',
          exactPatchSpan: exactDoc,
          patchable: false,
        }),
      )
      continue
    }

    const conf = computePatchConfidence({
      semanticConfidence: sa.confidence,
      exactValueSpanResolved: true,
      sourceSpanIsValueOnly: isValueOnly,
      uniqueInsideAnchor: true,
      canonicalBindingExists: true,
      contextAgreement: Boolean(
        sa.valueSpan.prefixContext || sa.valueSpan.suffixContext,
      ),
      isLegalReference: false,
      isDefinedTerm: false,
      typedSpanStrategy: typedStrategy,
    })

    let status = decideStatusFromConfidence({
      semanticConfidence: conf.semanticConfidence,
      patchConfidence: conf.patchConfidence,
      exactValueSpanResolved: true,
      valuesDiffer: true,
      isDerived,
      ambiguous: false,
      ignored: false,
    }) as SemanticStatus

    const preview = buildPatchPreview({
      exactSourceText: exactDoc,
      replacementText: proposed,
      prefixContext: sa.valueSpan.prefixContext,
      suffixContext: sa.valueSpan.suffixContext,
      anchorText: docAnchor.text,
    })
    if (!preview.valid) {
      status = 'REVIEW'
    }

    const patchable = canCreateSemanticPatch({
      status: status === 'REVIEW' ? 'REPLACEMENT' : status,
      exactValueSpanResolved: true,
      sourceSpanIsValueOnly: isValueOnly,
      canonicalOrDerivedValueAvailable: true,
      isLegalReference: false,
      isDocumentOnly: false,
      isCollectionLevelPlaceholder: false,
      originalText: exactDoc,
      replacementText: proposed,
      monetaryWithoutLiteral: !monetaryOk,
    })

    // Allow AUTO/REPLACEMENT when patch confidence is high even if semantic is 85%
    const autoOk =
      status === 'REPLACEMENT' ||
      status === 'DERIVED' ||
      (conf.semanticConfidence >= 0.8 &&
        conf.patchConfidence >= 0.95 &&
        preview.valid)

    if (!patchable || (!autoOk && status === 'REVIEW' && conf.patchConfidence < 0.95)) {
      // Still create REVIEW row; if patchable and autoOk, fall through
    }

    if (!patchable || !preview.valid) {
      pushMetrics('REVIEW')
      mappingRows.push(
        emptyRowBase({
          anchorId: sa.anchorId,
          semanticRole: role ?? sa.semanticRole,
          semanticLabel: label,
          confidence: sa.confidence,
          confidenceBand: band,
          documentLabel: sa.documentLabel ?? null,
          sourceText: sa.valueSpan.sourceText,
          documentValue: exactDoc,
          canonicalValue: canonicalDisplay,
          derivedValue: derivedDisplay,
          status: 'REVIEW',
          reason: !preview.valid
            ? preview.failureReason ?? 'Patch preview invalid'
            : 'Patch safety gate rejected row',
          mappedFieldKey: binding.fieldKey,
          mappedDisplay: binding.displayMapping,
          exactPatchSpan: exactDoc,
          canonicalRule,
          patchable: false,
          temporalKind,
          valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
          semanticConfidence: conf.semanticConfidence,
          patchConfidence: conf.patchConfidence,
          confidenceReasons: conf.reasons,
          patchPreview: {
            oldValue: preview.oldValue,
            newValue: preview.newValue,
            beforePhrase: preview.beforePhrase,
            afterPhrase: preview.afterPhrase,
            valid: preview.valid,
          },
        }),
      )
      continue
    }

    // Promote REVIEW → REPLACEMENT/DERIVED when patch confidence is sufficient
    if (
      status === 'REVIEW' &&
      conf.semanticConfidence >= 0.8 &&
      conf.patchConfidence >= 0.95
    ) {
      status = isDerived ? 'DERIVED' : 'REPLACEMENT'
    }

    if (status === 'REVIEW') metrics.reviewMappings += 1
    else metrics.automaticMappings += 1
    pushMetrics(status)

    replIndex += 1
    replacements.push({
      replacementId: `sem:${replIndex}:${sa.anchorId}`,
      anchorId: sa.anchorId,
      originalText: exactDoc,
      canonicalFieldKey: binding.fieldKey,
      proposedValue: proposed,
      semanticRole: label,
      reason: isDerived
        ? `Mapowanie Phase B: ${binding.displayMapping}`
        : `Mapowanie Phase B: ${sa.semanticRole} → ${binding.fieldKey}`,
      confidence: Math.max(sa.confidence, conf.patchConfidence),
      requiresUserReview: status === 'REVIEW' || isDerived,
      prefixContext: sa.valueSpan.prefixContext ?? null,
      suffixContext: sa.valueSpan.suffixContext ?? null,
    })

    mappingRows.push(
      emptyRowBase({
        anchorId: sa.anchorId,
        semanticRole: role ?? sa.semanticRole,
        semanticLabel: label,
        confidence: sa.confidence,
        confidenceBand: band,
        documentLabel: sa.documentLabel ?? null,
        sourceText: sa.valueSpan.sourceText,
        documentValue: exactDoc,
        canonicalValue: isDerived ? null : proposed,
        derivedValue: isDerived ? proposed : null,
        status,
        replacementStatus: 'replacement',
        reason:
          status === 'DERIVED'
            ? 'Computed from generation/temporal rule'
            : status === 'REVIEW'
              ? 'Confidence below automatic threshold'
              : 'Different canonical value',
        mappedFieldKey: binding.fieldKey,
        mappedDisplay: binding.displayMapping,
        valueKind: valueKindUi(role ?? sa.semanticRole, null, false, false),
        exactPatchSpan: exactDoc,
        canonicalRule,
        patchable: true,
        temporalKind,
        semanticConfidence: conf.semanticConfidence,
        patchConfidence: conf.patchConfidence,
        confidenceReasons: conf.reasons,
        patchPreview: {
          oldValue: preview.oldValue,
          newValue: preview.newValue,
          beforePhrase: preview.beforePhrase,
          afterPhrase: preview.afterPhrase,
          valid: preview.valid,
        },
      }),
    )
  }

  // Surface Phase A unresolved package items as individual REVIEW siblings
  for (const u of input.semanticMap.unresolved ?? []) {
    const unresolvedRole = normalizeSemanticRole(u.semanticRole)
    if (unresolvedRole !== 'package_item') continue
    if (
      mappingRows.some(
        (r) =>
          r.anchorId === u.anchorId &&
          normalizeSemanticRole(r.semanticRole) === 'package_item',
      )
    ) {
      continue
    }
    metrics.reviewMappings += 1
    mappingRows.push(
      emptyRowBase({
        anchorId: u.anchorId ?? 'unknown',
        semanticRole: 'package_item',
        semanticLabel: SEMANTIC_ROLE_LABELS.package_item,
        confidence: 0,
        confidenceBand: 'review',
        sourceText: '',
        documentValue: '',
        status: 'REVIEW',
        reason: `Phase A unresolved: ${u.status}`,
        groupId: 'PackageContentCollection',
        valueKind: 'package_item',
        patchable: false,
        semanticConfidence: 0,
        patchConfidence: 0,
        confidenceReasons: ['source span not resolved'],
      }),
    )
  }

  const summary = input.semanticMap.documentSummary ?? {
    documentType: 'umowa',
    language: 'pl',
    detectedPartyRoles: [],
    detectedBusinessContext: 'foto/video',
  }

  return {
    mappingRows,
    metrics,
    analysis: {
      analysisVersion: input.semanticMap.analysisVersion,
      documentSummary: summary,
      replacements,
      missingFields: [],
      ambiguities,
      ignoredWeddingFields: [],
      warnings: [...(input.semanticMap.warnings ?? [])],
    },
  }
}

export const FOCUS_SEMANTIC_ROLES: ContractSemanticRole[] = [
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'payment_due_date',
]
