/**
 * Template-first contract slots.
 * A variable is only valid with both semantic identity and physical location.
 */

export type TemplateSlotSourceHint =
  | 'couple'
  | 'company'
  | 'package'
  | 'wedding'
  | 'unknown'

/**
 * How this slot mutates the master document during generation.
 * - replace: old example text → resolved value
 * - insert: empty span between anchors → resolved value
 * - composite: multiple registry values + separator as one span
 */
export type ContractSlotOperation = 'replace' | 'insert' | 'composite'

export type OmissionMode =
  | 'empty'
  | 'underscore'
  | 'keep_original'
  | 'remove_clause'

/** Whether this slot must be bound before the template is ready. */
export type TemplateSlotRequirement = 'required' | 'optional'

/**
 * How analysis classified this detection for readiness.
 * Only `required_unbound` blocks template readiness.
 */
export type TemplateSlotDetectionStatus =
  | 'bound'
  | 'optional_unbound'
  | 'required_unbound'
  | 'false_positive'
  | 'duplicate_alias'
  | 'ambiguous'
  | 'not_present'

export interface TemplateSlotRange {
  start: number
  end: number
}

export interface TemplateSlot {
  /** Stable slot id within this template version. */
  id: string
  /** Canonical primary registry id when known. */
  registryKey: string | null
  label: string
  sourceHint: TemplateSlotSourceHint
  /** How many times this value appears in the source document. */
  occurrences: number
  /** Example text found in the contract (used for placeholder insertion only). */
  exampleText?: string | null
  /** Surrounding context for review UI. */
  sampleContext?: string | null
  enabled: boolean
  /** True when {{registryKey}} was written into template DOCX. */
  placeholderInserted?: boolean

  /** Validation / generation operation (defaults inferred at validate-time). */
  operation?: ContractSlotOperation
  /** Paragraph index in source document.xml order (including empty paras). */
  paragraphIndex?: number | null
  /** Exact original span for replace operations. */
  originalText?: string | null
  /** Stable text immediately before an insert/composite span. */
  leftAnchor?: string | null
  /** Stable text immediately after an insert/composite span. */
  rightAnchor?: string | null
  /** Character range within the paragraph (inclusive start, exclusive end). */
  allowedRange?: TemplateSlotRange | null
  /** Alias of allowedRange.start for clarity in persisted JSON. */
  startOffset?: number | null
  /** Alias of allowedRange.end for clarity in persisted JSON. */
  endOffset?: number | null
  /** Inserted before the resolved value (owned by the slot, not AI). */
  prefix?: string | null
  /** Appended after the resolved value (owned by the slot, not AI). */
  suffix?: string | null
  /** Behavior when the resolved value is omitted / empty. */
  omissionMode?: OmissionMode | null
  /** Fingerprint of original paragraph text for recovery. */
  paragraphFingerprint?: string | null
  /** True when physical location was bound during import. */
  physicallyBound?: boolean
  /** For composite: registry keys that form the value. */
  componentKeys?: string[]
  /** For composite: separator between components (e.g. " i "). */
  separator?: string | null

  /** Required vs optional for THIS template (user-overridable). */
  requirement?: TemplateSlotRequirement
  /** Detection / binding classification for readiness. */
  detectionStatus?: TemplateSlotDetectionStatus
  /** Why this slot was detected / classified. */
  detectionReason?: string | null
  /** 0–1 confidence from AI or binder. */
  confidence?: number | null
  /** Aliases collapsed into this canonical slot. */
  aliases?: string[]
  /** User dismissed: not present in this contract. */
  dismissedAsNotPresent?: boolean
  /** Evidence classification from two-pass detection. */
  evidenceType?:
    | 'explicit_label'
    | 'legal_context'
    | 'format_pattern'
    | 'blank_between_anchors'
    | 'existing_value'
    | 'composite_context'
    | null
  evidenceText?: string | null
  /** Mid-confidence detection awaiting user confirm. */
  needsConfirmation?: boolean

  /**
   * Physical span safety (independent of semantic confidence).
   * High confidence must never override `unsafe`.
   */
  physicalSpanSafety?: 'safe' | 'unsafe' | 'needs_review' | null
  /** Entity types detected inside the persisted source span. */
  detectedEntityTypes?: string[] | null
  /** Legal wrapper phrases found inside the span (should be empty when safe). */
  legalWrapperTokensInside?: string[] | null
  /** Blocking reasons when physicalSpanSafety is unsafe. */
  spanSafetyReasons?: string[] | null
  /** User-facing message for unsafe spans. */
  spanSafetyMessage?: string | null

  /**
   * How this detection participates in generation.
   * Provider-side data defaults to `template_constant` (immutable in DOCX).
   */
  variableClassification?: VariableClassification | null
  /**
   * Safe minimal provider span may be optionally linked to company profile.
   * Never true for unsafe / whole-clause spans.
   */
  canLinkToCompany?: boolean
}

/** Provider vs dynamic vs ignore classification for detections. */
export type VariableClassification =
  | 'template_constant'
  | 'dynamic_candidate'
  | 'ignored_non_variable'

export interface TemplateSlotCounters {
  detectedSlotCount: number
  requiredSlotCount: number
  optionalSlotCount: number
  boundRequiredSlotCount: number
  unresolvedRequiredSlotCount: number
  ambiguousSlotCount: number
  falsePositiveCount: number
  /** High-confidence auto detections. */
  detectedAutomatically?: number
  /** Mid-confidence awaiting confirmation. */
  needsConfirmationCount?: number
  /** Physically safe bindings (span validated). */
  safeBindingsCount?: number
  /** Unsafe / too-broad physical spans. */
  unsafeBindingsCount?: number
  /** Slots that require human review (ambiguous + unsafe). */
  itemsRequiringReviewCount?: number
  /** Required concepts still unresolved after detection. */
  unresolvedRequiredConceptsCount?: number
}

/**
 * Fine-grained lifecycle for analysis → generation.
 * Orthogonal to persisted DocumentTemplateStatus (ready/incomplete/needs_review).
 */
export type ContractTemplateLifecycleStatus =
  | 'analysis_in_progress'
  | 'analysis_requires_review'
  | 'analysis_ready'
  | 'generation_requires_configuration'
  | 'generation_ready'
  | 'generation_blocked'

export interface TemplateSlotMap {
  version: 1
  documentTitle?: string
  slots: TemplateSlot[]
  unmappedDynamics: string[]
  staticNotes?: string[]
  /**
   * @deprecated Prefer counters.unresolvedRequiredSlotCount + slot.detectionStatus.
   * Kept for older clients — only REQUIRED unbound keys.
   */
  unboundRegistryKeys?: string[]
  /** Precise counters for readiness / picker. */
  counters?: TemplateSlotCounters
  /** Structural warnings (e.g. missing party identity). */
  analysisWarnings?: string[]
  /** Analysis completeness for contract-type templates. */
  analysisStatus?: 'complete' | 'needs_review'
  /** Derived analysis→generation lifecycle (not a DB enum). */
  lifecycleStatus?: ContractTemplateLifecycleStatus
  /** Source kind that produced this analysis (pdf stays evidence-only). */
  sourceKind?: 'docx' | 'pdf' | string
  /** Provider party handling for this template. */
  providerPartyMode?: 'immutable_template' | 'dynamic_profile' | 'mixed'
  /** Client/couple party handling. */
  clientPartyMode?: 'dynamic' | 'missing' | 'not_present'
  /** Latest dynamic coverage audit (diagnostics; not bindings). */
  dynamicCoverage?: {
    detectedDynamicValues: number
    missedDynamicValues: number
    emptyPlaceholders: number
    unsupportedStructures: number
    coveragePercent: number
    items: Array<{
      sourceText: string
      semanticConcept: string
      expectedKey: string | null
      status: string
      missReason: string | null
      paragraphIndex: number | null
    }>
  }
}

export function emptySlotMap(): TemplateSlotMap {
  return {
    version: 1,
    slots: [],
    unmappedDynamics: [],
    unboundRegistryKeys: [],
  }
}

function asOperation(value: unknown): ContractSlotOperation | undefined {
  if (value === 'replace' || value === 'insert' || value === 'composite') {
    return value
  }
  return undefined
}

function asRequirement(value: unknown): TemplateSlotRequirement | undefined {
  if (value === 'required' || value === 'optional') return value
  return undefined
}

function asDetectionStatus(
  value: unknown,
): TemplateSlotDetectionStatus | undefined {
  if (
    value === 'bound' ||
    value === 'optional_unbound' ||
    value === 'required_unbound' ||
    value === 'false_positive' ||
    value === 'duplicate_alias' ||
    value === 'ambiguous' ||
    value === 'not_present'
  ) {
    return value
  }
  return undefined
}

function asCounters(value: unknown): TemplateSlotCounters | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const num = (k: string) =>
    typeof row[k] === 'number' && Number.isFinite(row[k])
      ? Math.max(0, Math.floor(row[k] as number))
      : 0
  return {
    detectedSlotCount: num('detectedSlotCount'),
    requiredSlotCount: num('requiredSlotCount'),
    optionalSlotCount: num('optionalSlotCount'),
    boundRequiredSlotCount: num('boundRequiredSlotCount'),
    unresolvedRequiredSlotCount: num('unresolvedRequiredSlotCount'),
    ambiguousSlotCount: num('ambiguousSlotCount'),
    falsePositiveCount: num('falsePositiveCount'),
    detectedAutomatically: num('detectedAutomatically') || undefined,
    needsConfirmationCount: num('needsConfirmationCount') || undefined,
    safeBindingsCount: num('safeBindingsCount') || undefined,
    unsafeBindingsCount: num('unsafeBindingsCount') || undefined,
    itemsRequiringReviewCount: num('itemsRequiringReviewCount') || undefined,
    unresolvedRequiredConceptsCount:
      num('unresolvedRequiredConceptsCount') || undefined,
  }
}

function asOmission(value: unknown): OmissionMode | null | undefined {
  if (value == null) return null
  if (
    value === 'empty' ||
    value === 'underscore' ||
    value === 'keep_original' ||
    value === 'remove_clause'
  ) {
    return value
  }
  return undefined
}

function asRange(value: unknown): TemplateSlotRange | null | undefined {
  if (value == null) return null
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const start = typeof row.start === 'number' ? row.start : Number(row.start)
  const end = typeof row.end === 'number' ? row.end : Number(row.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null
  }
  return { start: Math.floor(start), end: Math.floor(end) }
}

export function parseSlotMap(raw: unknown): TemplateSlotMap {
  if (!raw || typeof raw !== 'object') return emptySlotMap()
  const obj = raw as Record<string, unknown>
  const slotsRaw = Array.isArray(obj.slots) ? obj.slots : []
  const slots: TemplateSlot[] = []
  for (const item of slotsRaw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id) continue
    const registryKey =
      typeof row.registryKey === 'string' && row.registryKey.trim()
        ? row.registryKey.trim()
        : null
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : registryKey ?? id
    const sourceHint = asSourceHint(row.sourceHint)
    const occurrences =
      typeof row.occurrences === 'number' && row.occurrences > 0
        ? Math.floor(row.occurrences)
        : 1
    const componentKeys = Array.isArray(row.componentKeys)
      ? row.componentKeys.filter(
          (k): k is string => typeof k === 'string' && Boolean(k.trim()),
        )
      : undefined
    const paragraphIndex =
      typeof row.paragraphIndex === 'number' && row.paragraphIndex >= 0
        ? Math.floor(row.paragraphIndex)
        : row.paragraphIndex === null
          ? null
          : undefined

    const allowedRange = asRange(row.allowedRange)
    const startOffset =
      typeof row.startOffset === 'number'
        ? Math.floor(row.startOffset)
        : allowedRange?.start ?? null
    const endOffset =
      typeof row.endOffset === 'number'
        ? Math.floor(row.endOffset)
        : allowedRange?.end ?? null
    const range =
      allowedRange ??
      (startOffset != null && endOffset != null
        ? { start: startOffset, end: endOffset }
        : null)

    slots.push({
      id,
      registryKey,
      label,
      sourceHint,
      occurrences,
      exampleText:
        typeof row.exampleText === 'string' ? row.exampleText : null,
      sampleContext:
        typeof row.sampleContext === 'string' ? row.sampleContext : null,
      enabled: row.enabled !== false,
      placeholderInserted: row.placeholderInserted === true,
      operation: asOperation(row.operation),
      paragraphIndex,
      originalText:
        typeof row.originalText === 'string' ? row.originalText : null,
      leftAnchor: typeof row.leftAnchor === 'string' ? row.leftAnchor : null,
      rightAnchor: typeof row.rightAnchor === 'string' ? row.rightAnchor : null,
      allowedRange: range,
      startOffset,
      endOffset,
      prefix: typeof row.prefix === 'string' ? row.prefix : null,
      suffix: typeof row.suffix === 'string' ? row.suffix : null,
      omissionMode: asOmission(row.omissionMode),
      paragraphFingerprint:
        typeof row.paragraphFingerprint === 'string'
          ? row.paragraphFingerprint
          : null,
      physicallyBound:
        row.variableClassification === 'template_constant' ||
        row.variableClassification === 'ignored_non_variable'
          ? false
          : row.physicallyBound === true ||
            (paragraphIndex != null &&
              Boolean(
                row.leftAnchor ||
                  row.rightAnchor ||
                  range ||
                  (typeof row.originalText === 'string' &&
                    row.originalText.length > 0),
              )),
      componentKeys,
      separator: typeof row.separator === 'string' ? row.separator : null,
      requirement: asRequirement(row.requirement),
      detectionStatus: asDetectionStatus(row.detectionStatus),
      detectionReason:
        typeof row.detectionReason === 'string' ? row.detectionReason : null,
      confidence:
        typeof row.confidence === 'number' && Number.isFinite(row.confidence)
          ? row.confidence
          : null,
      aliases: Array.isArray(row.aliases)
        ? row.aliases.filter(
            (k): k is string => typeof k === 'string' && Boolean(k.trim()),
          )
        : undefined,
      dismissedAsNotPresent: row.dismissedAsNotPresent === true,
      evidenceType:
        row.evidenceType === 'explicit_label' ||
        row.evidenceType === 'legal_context' ||
        row.evidenceType === 'format_pattern' ||
        row.evidenceType === 'blank_between_anchors' ||
        row.evidenceType === 'existing_value' ||
        row.evidenceType === 'composite_context'
          ? row.evidenceType
          : null,
      evidenceText:
        typeof row.evidenceText === 'string' ? row.evidenceText : null,
      needsConfirmation: row.needsConfirmation === true,
      physicalSpanSafety:
        row.physicalSpanSafety === 'safe' ||
        row.physicalSpanSafety === 'unsafe' ||
        row.physicalSpanSafety === 'needs_review'
          ? row.physicalSpanSafety
          : null,
      detectedEntityTypes: Array.isArray(row.detectedEntityTypes)
        ? row.detectedEntityTypes.filter((x): x is string => typeof x === 'string')
        : null,
      legalWrapperTokensInside: Array.isArray(row.legalWrapperTokensInside)
        ? row.legalWrapperTokensInside.filter(
            (x): x is string => typeof x === 'string',
          )
        : null,
      spanSafetyReasons: Array.isArray(row.spanSafetyReasons)
        ? row.spanSafetyReasons.filter((x): x is string => typeof x === 'string')
        : null,
      spanSafetyMessage:
        typeof row.spanSafetyMessage === 'string'
          ? row.spanSafetyMessage
          : null,
      variableClassification:
        row.variableClassification === 'template_constant' ||
        row.variableClassification === 'dynamic_candidate' ||
        row.variableClassification === 'ignored_non_variable'
          ? row.variableClassification
          : null,
      canLinkToCompany: row.canLinkToCompany === true,
    })
  }
  const unmapped = Array.isArray(obj.unmappedDynamics)
    ? obj.unmappedDynamics.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : []
  const staticNotes = Array.isArray(obj.staticNotes)
    ? obj.staticNotes.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : undefined
  const unboundRegistryKeys = Array.isArray(obj.unboundRegistryKeys)
    ? obj.unboundRegistryKeys.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : undefined
  const analysisWarnings = Array.isArray(obj.analysisWarnings)
    ? obj.analysisWarnings.filter(
        (x): x is string => typeof x === 'string' && Boolean(x.trim()),
      )
    : undefined
  return {
    version: 1,
    documentTitle:
      typeof obj.documentTitle === 'string' ? obj.documentTitle : undefined,
    slots,
    unmappedDynamics: unmapped,
    staticNotes,
    unboundRegistryKeys,
    counters: asCounters(obj.counters),
    analysisWarnings,
    analysisStatus:
      obj.analysisStatus === 'complete' || obj.analysisStatus === 'needs_review'
        ? obj.analysisStatus
        : undefined,
    lifecycleStatus:
      obj.lifecycleStatus === 'analysis_in_progress' ||
      obj.lifecycleStatus === 'analysis_requires_review' ||
      obj.lifecycleStatus === 'analysis_ready' ||
      obj.lifecycleStatus === 'generation_requires_configuration' ||
      obj.lifecycleStatus === 'generation_ready' ||
      obj.lifecycleStatus === 'generation_blocked'
        ? obj.lifecycleStatus
        : undefined,
    sourceKind:
      typeof obj.sourceKind === 'string' ? obj.sourceKind : undefined,
    providerPartyMode:
      obj.providerPartyMode === 'immutable_template' ||
      obj.providerPartyMode === 'dynamic_profile' ||
      obj.providerPartyMode === 'mixed'
        ? obj.providerPartyMode
        : undefined,
    clientPartyMode:
      obj.clientPartyMode === 'dynamic' ||
      obj.clientPartyMode === 'missing' ||
      obj.clientPartyMode === 'not_present'
        ? obj.clientPartyMode
        : undefined,
    dynamicCoverage:
      obj.dynamicCoverage && typeof obj.dynamicCoverage === 'object'
        ? (() => {
            const c = obj.dynamicCoverage as Record<string, unknown>
            const num = (k: string) =>
              typeof c[k] === 'number' && Number.isFinite(c[k])
                ? Math.max(0, Math.floor(c[k] as number))
                : 0
            const itemsRaw = Array.isArray(c.items) ? c.items : []
            return {
              detectedDynamicValues: num('detectedDynamicValues'),
              missedDynamicValues: num('missedDynamicValues'),
              emptyPlaceholders: num('emptyPlaceholders'),
              unsupportedStructures: num('unsupportedStructures'),
              coveragePercent: num('coveragePercent'),
              items: itemsRaw
                .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
                .map((row) => ({
                  sourceText:
                    typeof row.sourceText === 'string' ? row.sourceText : '',
                  semanticConcept:
                    typeof row.semanticConcept === 'string'
                      ? row.semanticConcept
                      : '',
                  expectedKey:
                    typeof row.expectedKey === 'string' ? row.expectedKey : null,
                  status: typeof row.status === 'string' ? row.status : 'review',
                  missReason:
                    typeof row.missReason === 'string' ? row.missReason : null,
                  paragraphIndex:
                    typeof row.paragraphIndex === 'number'
                      ? row.paragraphIndex
                      : null,
                })),
            }
          })()
        : undefined,
  }
}

function asSourceHint(value: unknown): TemplateSlotSourceHint {
  if (
    value === 'couple' ||
    value === 'company' ||
    value === 'package' ||
    value === 'wedding' ||
    value === 'unknown'
  ) {
    return value
  }
  return 'unknown'
}

/** Whether a slot has a usable physical binding. */
export function isSlotPhysicallyBound(slot: TemplateSlot): boolean {
  if (!slot.enabled || !slot.registryKey) return false
  if (slot.physicallyBound === false) return false
  if (slot.paragraphIndex == null || slot.paragraphIndex < 0) return false
  if (slot.operation === 'insert') {
    return Boolean(
      (slot.leftAnchor && slot.rightAnchor) ||
        (slot.startOffset != null && slot.endOffset != null) ||
        slot.allowedRange,
    )
  }
  if (slot.operation === 'replace') {
    return Boolean(
      slot.originalText != null ||
        (slot.leftAnchor && slot.rightAnchor) ||
        (slot.startOffset != null && slot.endOffset != null) ||
        slot.allowedRange,
    )
  }
  if (slot.operation === 'composite') {
    return Boolean(
      (slot.leftAnchor || slot.rightAnchor) ||
        (slot.startOffset != null && slot.endOffset != null) ||
        slot.allowedRange,
    )
  }
  // Unknown operation — require anchors or offsets
  return Boolean(
    (slot.leftAnchor && slot.rightAnchor) ||
      (slot.startOffset != null && slot.endOffset != null) ||
      slot.allowedRange ||
      slot.originalText,
  )
}
