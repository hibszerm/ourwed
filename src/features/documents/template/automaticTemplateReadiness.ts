/**
 * Automatic template readiness for the primary Umowy journey.
 * Field configuration remains internal; users never approve modes.
 */

import {
  buildProposedTemplateConfiguration,
  computeTemplateConfigurationReadiness,
  WEDDING_PLANNER_ROLES,
  type ContractTemplateConfiguration,
  type TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'
import {
  isClientVariableRole,
  isLocationVariableRole,
} from '@/features/ai-contract-lab/templateFieldPolicy'
import { normalizeSemanticRole } from '@/features/ai-contract-lab/semanticRoleCatalog'
import type { DocumentSemanticMap } from '@/features/ai-contract-lab/aiContractLabTypes'
import type {
  DocumentTemplate,
  DocumentTemplateMeta,
  DocumentTemplateSummary,
} from '@/types/documents'

export type AutomaticTemplateStatus =
  | 'analyzing'
  | 'ready'
  | 'attention'
  | 'error'
  | 'archived'

export type AutomaticPreparationKind =
  | 'ok'
  | 'recoverable_internal_state'
  | 'actual_document_attention'
  | 'fatal_analysis_error'
  | 'missing_source'

export type AutomaticConfigDiagnosticCode =
  | 'automatic_configuration_persist_failed'
  | 'automatic_configuration_not_found'
  | 'automatic_configuration_version_mismatch'
  | 'automatic_configuration_repair_failed'
  | 'readiness_recalculation_failed'

export type UserFacingTemplateIssue = {
  code: string
  message: string
  resolveDuringGeneration?: boolean
  /** Internal-only classification; never shown to users. */
  kind?: AutomaticPreparationKind
}

export type AutomaticTemplateReadiness = {
  status: AutomaticTemplateStatus
  blockingIssues: UserFacingTemplateIssue[]
  attentionIssues: UserFacingTemplateIssue[]
  configuration: ContractTemplateConfiguration | null
  preparationKind: AutomaticPreparationKind
}

export type AutomaticConfigurationFailure = {
  stage:
    | 'load_template'
    | 'load_analysis'
    | 'build_configuration'
    | 'persist_configuration'
    | 'recalculate_readiness'
    | 'repair'
  templateId: string
  templateVersionId?: string | null
  cause: string
  diagnosticCode: AutomaticConfigDiagnosticCode
}

const CRITICAL_CLIENT_ROLES = new Set([
  'wedding_date',
  'bride_name',
  'groom_name',
  'client_name',
  'bride_first_name',
  'bride_last_name',
  'groom_first_name',
  'groom_last_name',
  'bride_address',
  'groom_address',
  'bride_phone',
  'groom_phone',
  'bride_email',
  'groom_email',
  'client_phone',
  'client_email',
  'client_address',
])

export const USER_FACING_RETRY_MESSAGE =
  'Nie udało się dokończyć przygotowania szablonu. Spróbuj ponownie.'

function roleId(field: TemplateFieldConfiguration): string {
  return normalizeSemanticRole(field.semanticRole) ?? field.semanticRole
}

function attentionMessageForField(
  field: TemplateFieldConfiguration,
): UserFacingTemplateIssue {
  const id = roleId(field)
  if (id === 'shared_wedding_location') {
    return {
      code: 'shared_location',
      message:
        'Ten szablon ma jedno pole na wszystkie miejsca. Przy generowaniu zapytamy, które miejsce wpisać.',
      resolveDuringGeneration: true,
      kind: 'actual_document_attention',
    }
  }
  if (isClientVariableRole(id) || CRITICAL_CLIENT_ROLES.has(id)) {
    return {
      code: `client_${id}`,
      message: `Nie udało się w pełni rozpoznać pola „${field.displayName}”. Uzupełnisz je podczas generowania.`,
      resolveDuringGeneration: true,
      kind: 'actual_document_attention',
    }
  }
  if (id.includes('delivery') || id.includes('deadline')) {
    return {
      code: `delivery_${id}`,
      message:
        'Nie możemy bezpiecznie zmienić terminu oddania. Pozostawimy zapis z szablonu.',
      resolveDuringGeneration: true,
      kind: 'actual_document_attention',
    }
  }
  return {
    code: `optional_${id}`,
    message: `Pole „${field.displayName}” zostanie uzupełnione podczas generowania lub pozostanie bez zmian.`,
    resolveDuringGeneration: true,
    kind: 'actual_document_attention',
  }
}

/**
 * Document preparation for product readiness.
 * Analysis + detected fields must never be reported as "re-upload DOCX".
 */
export function evaluateDocumentPreparationState(input: {
  hasSourceDocx?: boolean
  aiAnalyzedAt?: string | null
  analysisVersion?: string | null
  detectedFieldCount?: number
  slotBindingsReady?: boolean | null
  generationReady?: boolean | null
  status?: DocumentTemplate['status'] | DocumentTemplateSummary['status']
  automaticAttentionIssues?: DocumentTemplateMeta['automaticAttentionIssues']
}): {
  kind: AutomaticPreparationKind
  /** True when generation infrastructure can proceed (not necessarily slot-perfect). */
  documentPrepared: boolean
  /** True only when the source file / analysis pipeline is fatally broken. */
  fatalPhysicalFailure: boolean
} {
  const detected = input.detectedFieldCount ?? 0
  const hasAnalysis = Boolean(
    input.aiAnalyzedAt ||
      input.analysisVersion ||
      detected > 0 ||
      input.slotBindingsReady === true ||
      input.generationReady === true,
  )
  const hasSource = input.hasSourceDocx !== false

  if (!hasSource && !hasAnalysis) {
    return {
      kind: 'missing_source',
      documentPrepared: false,
      fatalPhysicalFailure: true,
    }
  }

  if (!hasAnalysis) {
    return {
      kind: 'fatal_analysis_error',
      documentPrepared: false,
      fatalPhysicalFailure: true,
    }
  }

  // Incomplete bindings after successful analysis are recoverable — never re-upload.
  if (
    input.slotBindingsReady === false ||
    input.generationReady === false ||
    (input.automaticAttentionIssues ?? []).some(
      (issue) => issue.code === 'physical_slots',
    )
  ) {
    return {
      kind: 'recoverable_internal_state',
      documentPrepared: true,
      fatalPhysicalFailure: false,
    }
  }

  return {
    kind: 'ok',
    documentPrepared: true,
    fatalPhysicalFailure: false,
  }
}

/**
 * Finalize an auto-proposed configuration for the primary product flow.
 * Per-field: never throw; every field gets a safe fallback.
 */
export function finalizeAutomaticTemplateConfiguration(
  config: ContractTemplateConfiguration,
): ContractTemplateConfiguration {
  const fields = config.fields.map((field) => {
    try {
      const id = roleId(field)
      if (WEDDING_PLANNER_ROLES.has(id)) {
        return {
          ...field,
          mode: 'fixed' as const,
          variableSource: undefined,
          requiredWhenVariable: false,
          configuredBy: 'system' as const,
        }
      }
      if (id === 'shared_wedding_location') {
        return {
          ...field,
          mode: 'variable' as const,
          variableSource: 'wedding' as const,
          requiredWhenVariable: false,
          configuredBy: 'system' as const,
          notes:
            field.notes ??
            'Jedno wspólne pole lokalizacji — decyzja przy generowaniu.',
        }
      }
      if (
        id === 'package_price' ||
        id === 'contract_value' ||
        id === 'package_name' ||
        id === 'selected_package'
      ) {
        return {
          ...field,
          mode: 'variable' as const,
          variableSource: field.canonicalFieldKey
            ? ('wedding' as const)
            : ('package' as const),
          requiredWhenVariable: false,
          configuredBy: 'system' as const,
        }
      }
      if (field.mode === 'review' && !CRITICAL_CLIENT_ROLES.has(id)) {
        if (
          isClientVariableRole(id) ||
          isLocationVariableRole(id) ||
          id === 'wedding_date'
        ) {
          return {
            ...field,
            mode: 'variable' as const,
            variableSource: field.canonicalFieldKey
              ? ('wedding' as const)
              : ('manual' as const),
            requiredWhenVariable: Boolean(field.canonicalFieldKey),
            configuredBy: 'system' as const,
          }
        }
        return {
          ...field,
          mode: 'fixed' as const,
          variableSource: undefined,
          requiredWhenVariable: false,
          configuredBy: 'system' as const,
        }
      }
      if (
        field.mode === 'variable' &&
        !field.canonicalFieldKey &&
        field.variableSource === 'wedding'
      ) {
        return {
          ...field,
          variableSource: 'manual' as const,
          requiredWhenVariable: CRITICAL_CLIENT_ROLES.has(id),
          configuredBy: 'system' as const,
        }
      }
      if (
        field.mode === 'fixed' &&
        CRITICAL_CLIENT_ROLES.has(id) &&
        !field.fixedClientRiskConfirmed
      ) {
        return {
          ...field,
          mode: 'variable' as const,
          variableSource: field.canonicalFieldKey
            ? ('wedding' as const)
            : ('manual' as const),
          requiredWhenVariable: true,
          configuredBy: 'system' as const,
        }
      }
      return {
        ...field,
        configuredBy:
          field.configuredBy === 'user' ? ('user' as const) : ('system' as const),
      }
    } catch {
      return {
        ...field,
        mode: 'fixed' as const,
        variableSource: undefined,
        requiredWhenVariable: false,
        configuredBy: 'system' as const,
        notes:
          field.notes ?? 'Zachowano wartość ze szablonu (bezpieczny fallback).',
      }
    }
  })

  const attentionFields = fields.filter(
    (f) =>
      f.mode === 'review' ||
      (f.mode === 'variable' &&
        f.variableSource === 'manual' &&
        CRITICAL_CLIENT_ROLES.has(roleId(f))),
  )

  return {
    ...config,
    fields,
    status: attentionFields.some(
      (f) => f.mode === 'review' && CRITICAL_CLIENT_ROLES.has(roleId(f)),
    )
      ? 'requires_review'
      : 'configured',
    updatedAt: new Date().toISOString(),
  }
}

export function computeAutomaticTemplateReadiness(input: {
  configuration: ContractTemplateConfiguration | null | undefined
  /** @deprecated Prefer preparation. */
  physicalReady?: boolean
  preparation?: ReturnType<typeof evaluateDocumentPreparationState>
  analyzing?: boolean
  analysisError?: boolean
  archived?: boolean
}): AutomaticTemplateReadiness {
  if (input.archived) {
    return {
      status: 'archived',
      blockingIssues: [],
      attentionIssues: [],
      configuration: input.configuration ?? null,
      preparationKind: 'ok',
    }
  }
  if (input.analyzing) {
    return {
      status: 'analyzing',
      blockingIssues: [],
      attentionIssues: [],
      configuration: input.configuration ?? null,
      preparationKind: 'ok',
    }
  }
  if (input.analysisError) {
    return {
      status: 'error',
      blockingIssues: [
        {
          code: 'analysis_failed',
          message: 'Nie udało się przeanalizować dokumentu. Spróbuj ponownie.',
          kind: 'fatal_analysis_error',
        },
      ],
      attentionIssues: [],
      configuration: input.configuration ?? null,
      preparationKind: 'fatal_analysis_error',
    }
  }

  const preparation =
    input.preparation ??
    evaluateDocumentPreparationState({
      slotBindingsReady:
        input.physicalReady === false
          ? false
          : input.physicalReady === true
            ? true
            : undefined,
      detectedFieldCount: input.configuration?.fields.length ?? 0,
      aiAnalyzedAt: input.configuration ? 'present' : null,
    })

  if (!input.configuration) {
    if (preparation.documentPrepared) {
      return {
        status: 'analyzing',
        blockingIssues: [],
        attentionIssues: [],
        configuration: null,
        preparationKind: 'recoverable_internal_state',
      }
    }
    return {
      status: 'attention',
      blockingIssues: [],
      attentionIssues: [
        {
          code: 'missing_configuration',
          message: USER_FACING_RETRY_MESSAGE,
          kind: 'recoverable_internal_state',
        },
      ],
      configuration: null,
      preparationKind: preparation.kind,
    }
  }

  const finalized = finalizeAutomaticTemplateConfiguration(input.configuration)
  const attentionIssues: UserFacingTemplateIssue[] = []
  const blockingIssues: UserFacingTemplateIssue[] = []

  for (const field of finalized.fields) {
    const id = roleId(field)
    if (field.mode === 'review' && CRITICAL_CLIENT_ROLES.has(id)) {
      attentionIssues.push(attentionMessageForField(field))
      continue
    }
    if (field.mode === 'review') {
      attentionIssues.push(attentionMessageForField(field))
      continue
    }
    if (
      field.mode === 'variable' &&
      field.variableSource === 'wedding' &&
      !field.canonicalFieldKey &&
      CRITICAL_CLIENT_ROLES.has(id)
    ) {
      attentionIssues.push(attentionMessageForField(field))
    }
  }

  if (preparation.fatalPhysicalFailure) {
    blockingIssues.push({
      code: 'physical_slots',
      message: USER_FACING_RETRY_MESSAGE,
      kind: 'fatal_analysis_error',
    })
  }

  const status: AutomaticTemplateStatus =
    blockingIssues.length > 0
      ? 'attention'
      : preparation.kind === 'fatal_analysis_error'
        ? 'error'
        : 'ready'

  return {
    status,
    blockingIssues,
    attentionIssues: attentionIssues.filter(
      (issue, index, all) =>
        all.findIndex((other) => other.code === issue.code) === index,
    ),
    configuration: {
      ...finalized,
      status: status === 'ready' ? 'configured' : finalized.status,
    },
    preparationKind: preparation.kind,
  }
}

export function buildAutomaticReadyConfiguration(input: {
  templateId: string
  templateVersionId?: string
  semanticMap: DocumentSemanticMap
  existing?: ContractTemplateConfiguration | null
  physicalReady?: boolean
  preparation?: ReturnType<typeof evaluateDocumentPreparationState>
}): AutomaticTemplateReadiness {
  const proposed = buildProposedTemplateConfiguration({
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    semanticMap: input.semanticMap,
    existing: input.existing,
  })
  return computeAutomaticTemplateReadiness({
    configuration: proposed,
    physicalReady: input.physicalReady,
    preparation:
      input.preparation ??
      evaluateDocumentPreparationState({
        aiAnalyzedAt: 'present',
        detectedFieldCount: proposed.fields.length,
        analysisVersion: input.semanticMap.analysisVersion,
        slotBindingsReady: input.physicalReady === false ? false : true,
      }),
  })
}

export function automaticStatusFromTemplate(
  template: Pick<DocumentTemplateSummary, 'status' | 'meta'> & {
    aiAnalyzedAt?: string | null
    generationReady?: boolean
    variableCount?: number
    sourceDocxPath?: string | null
  },
): AutomaticTemplateStatus {
  if (template.status === 'archived') return 'archived'

  const preparation = evaluateDocumentPreparationState({
    hasSourceDocx: Boolean(template.sourceDocxPath) || template.sourceDocxPath == null,
    aiAnalyzedAt: template.aiAnalyzedAt,
    analysisVersion: template.meta.analysisVersion,
    detectedFieldCount:
      template.variableCount ??
      template.meta.fieldConfigurationSummary?.variableCount ??
      template.meta.slotCounters?.detectedSlotCount ??
      0,
    slotBindingsReady: template.meta.slotBindingsReady,
    generationReady: template.generationReady ?? template.meta.generationReady,
    status: template.status,
    automaticAttentionIssues: template.meta.automaticAttentionIssues,
  })

  // Stale physical_slots attention after successful analysis → treat as ready.
  if (
    template.meta.automaticReadinessStatus === 'attention' &&
    preparation.documentPrepared &&
    !preparation.fatalPhysicalFailure &&
    (template.meta.fieldConfigurationStatus === 'ready' ||
      Boolean(template.meta.fieldConfiguration) ||
      (template.variableCount ?? 0) > 0)
  ) {
    const issues = template.meta.automaticAttentionIssues ?? []
    const onlySoftOrStale =
      issues.length === 0 ||
      issues.every(
        (issue) =>
          issue.code === 'physical_slots' ||
          issue.code === 'missing_configuration' ||
          issue.code.startsWith('optional_') ||
          issue.code.startsWith('client_') ||
          issue.code === 'shared_location' ||
          issue.code.startsWith('delivery_'),
      )
    if (onlySoftOrStale) return 'ready'
  }

  if (
    template.meta.automaticReadinessStatus === 'error' ||
    template.meta.automaticReadinessStatus === 'analyzing' ||
    template.meta.automaticReadinessStatus === 'archived'
  ) {
    return template.meta.automaticReadinessStatus
  }
  if (template.meta.automaticReadinessStatus === 'ready') return 'ready'
  if (
    template.meta.automaticReadinessStatus === 'attention' &&
    preparation.fatalPhysicalFailure
  ) {
    return 'attention'
  }
  if (template.meta.automaticReadinessStatus === 'attention') {
    if (
      preparation.documentPrepared &&
      (template.meta.fieldConfigurationStatus === 'ready' ||
        template.meta.fieldConfiguration)
    ) {
      return 'ready'
    }
    return 'attention'
  }

  if (template.status === 'draft' && !template.aiAnalyzedAt) return 'analyzing'
  if (template.status === 'needs_review' || template.status === 'incomplete') {
    if (template.meta.fieldConfigurationStatus === 'ready') return 'ready'
    if (preparation.documentPrepared && template.meta.fieldConfiguration) {
      return 'ready'
    }
    return preparation.documentPrepared ? 'analyzing' : 'attention'
  }
  if (template.meta.fieldConfigurationStatus === 'ready') return 'ready'
  if (template.meta.fieldConfiguration) {
    return preparation.documentPrepared ? 'ready' : 'attention'
  }
  return preparation.documentPrepared ? 'analyzing' : 'analyzing'
}

export function toPersistedAutomaticMeta(
  readiness: AutomaticTemplateReadiness,
): Pick<
  DocumentTemplateMeta,
  | 'fieldConfiguration'
  | 'fieldConfigurationStatus'
  | 'fieldConfigurationSummary'
  | 'automaticReadinessStatus'
  | 'automaticAttentionIssues'
> {
  const config = readiness.configuration
  const classic = computeTemplateConfigurationReadiness(
    config
      ? {
          ...config,
          status: readiness.status === 'ready' ? 'configured' : config.status,
        }
      : null,
  )
  const issues = [...readiness.blockingIssues, ...readiness.attentionIssues].filter(
    (issue) =>
      !(
        issue.code === 'physical_slots' &&
        readiness.preparationKind !== 'fatal_analysis_error' &&
        readiness.preparationKind !== 'missing_source'
      ),
  )
  return {
    fieldConfiguration: config
      ? (structuredClone(config) as unknown as Record<string, unknown>)
      : undefined,
    fieldConfigurationStatus:
      readiness.status === 'ready'
        ? 'ready'
        : readiness.status === 'attention'
          ? 'requires_review'
          : classic.status,
    fieldConfigurationSummary: {
      variableCount: classic.variableCount,
      fixedCount: classic.fixedCount,
      ignoredCount: classic.ignoredCount,
      reviewCount: classic.reviewCount,
      updatedAt: new Date().toISOString(),
    },
    automaticReadinessStatus: readiness.status,
    automaticAttentionIssues: issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
    })),
  }
}

export function configurationFromMeta(
  meta: DocumentTemplateMeta | null | undefined,
): ContractTemplateConfiguration | null {
  const raw = meta?.fieldConfiguration
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Partial<ContractTemplateConfiguration>
  if (!obj.templateId || !Array.isArray(obj.fields)) return null
  if (obj.paymentMode !== 'fixed' && obj.paymentMode !== 'variable') return null
  if (obj.deliveryTermMode !== 'fixed' && obj.deliveryTermMode !== 'variable') {
    return null
  }
  return obj as ContractTemplateConfiguration
}

export function migrateLegacyTemplateConfiguration(
  template: Pick<
    DocumentTemplateSummary,
    'id' | 'status' | 'meta' | 'aiAnalyzedAt'
  > & {
    generationReady?: boolean
    variableCount?: number
    sourceDocxPath?: string | null
  },
): {
  needsPersist: boolean
  readiness: AutomaticTemplateReadiness
  meta: DocumentTemplateMeta
} {
  const existing = configurationFromMeta(template.meta)
  const preparation = evaluateDocumentPreparationState({
    hasSourceDocx: Boolean(template.sourceDocxPath) || template.sourceDocxPath == null,
    aiAnalyzedAt: template.aiAnalyzedAt,
    analysisVersion: template.meta.analysisVersion,
    detectedFieldCount:
      template.variableCount ??
      template.meta.slotCounters?.detectedSlotCount ??
      existing?.fields.length ??
      0,
    slotBindingsReady: template.meta.slotBindingsReady,
    generationReady: template.generationReady ?? template.meta.generationReady,
    status: template.status,
    automaticAttentionIssues: template.meta.automaticAttentionIssues,
  })
  const alreadyReady =
    template.meta.automaticReadinessStatus === 'ready' &&
    template.meta.fieldConfigurationStatus === 'ready' &&
    !(template.meta.automaticAttentionIssues ?? []).some(
      (issue) => issue.code === 'physical_slots',
    )

  if (alreadyReady && existing) {
    return {
      needsPersist: false,
      readiness: computeAutomaticTemplateReadiness({
        configuration: existing,
        preparation,
      }),
      meta: template.meta,
    }
  }

  if (!existing) {
    const readiness = computeAutomaticTemplateReadiness({
      configuration: null,
      preparation,
      analyzing: !template.aiAnalyzedAt && !preparation.documentPrepared,
      analysisError: false,
      archived: template.status === 'archived',
    })
    return {
      needsPersist: false,
      readiness,
      meta: {
        ...template.meta,
        ...toPersistedAutomaticMeta(readiness),
      },
    }
  }

  const readiness = computeAutomaticTemplateReadiness({
    configuration: existing,
    preparation,
    archived: template.status === 'archived',
  })
  const autoMeta = toPersistedAutomaticMeta(readiness)
  const needsPersist =
    template.meta.fieldConfigurationStatus !== 'ready' ||
    template.meta.automaticReadinessStatus !== readiness.status ||
    (template.meta.automaticAttentionIssues ?? []).some(
      (issue) => issue.code === 'physical_slots',
    )

  return {
    needsPersist,
    readiness,
    meta: {
      ...template.meta,
      version: 1,
      ...autoMeta,
    },
  }
}
